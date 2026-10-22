"""Rate limit: cuántas peticiones puede hacer cada cliente por minuto.

Usa una ventana deslizante en memoria: por cada cliente se guardan las horas de sus
últimas peticiones. Si ya hizo el máximo en los últimos 60 s, responde 429.
(Para varios servidores a la vez se usaría Redis en lugar de memoria.)
"""
import hashlib
import math
import threading
import time
from collections import defaultdict, deque

import jwt
from fastapi import HTTPException, Request, Response, status

from app.config import settings
from app.seguridad import leer_token


def identificar_cliente(request: Request) -> str:
    """El límite se cuenta por API key, por usuario (JWT) o, si no hay sesión, por IP."""
    clave = request.headers.get("x-api-key")
    if clave:
        return "key:" + hashlib.sha256(clave.encode()).hexdigest()[:16]
    autorizacion = request.headers.get("authorization", "")
    if autorizacion.lower().startswith("bearer "):
        try:
            return "usuario:" + leer_token(autorizacion[7:])["sub"]
        except jwt.PyJWTError:
            pass
    return "ip:" + (request.client.host if request.client else "desconocida")


class Limitador:
    def __init__(self, nombre: str, maximo: int, ventana_s: int = 60):
        self.nombre = nombre
        self.maximo = maximo
        self.ventana = ventana_s
        self._peticiones: dict[str, deque[float]] = defaultdict(deque)
        self._candado = threading.Lock()

    def registrar(self, cliente: str) -> tuple[bool, int, float]:
        """Anota una petición. Regresa (permitida, restantes, segundos para reintentar)."""
        ahora = time.monotonic()
        with self._candado:
            if len(self._peticiones) > 10_000:  # limpieza para no crecer sin fin
                for llave in [k for k, v in self._peticiones.items() if not v or v[-1] <= ahora - self.ventana]:
                    del self._peticiones[llave]
            historial = self._peticiones[cliente]
            while historial and historial[0] <= ahora - self.ventana:
                historial.popleft()
            if len(historial) >= self.maximo:
                return False, 0, historial[0] + self.ventana - ahora
            historial.append(ahora)
            return True, self.maximo - len(historial), 0.0

    def __call__(self, request: Request, response: Response) -> None:
        """Se usa como dependencia de FastAPI: Depends(limite_general)."""
        permitida, restantes, espera = self.registrar(identificar_cliente(request))
        if not permitida:
            segundos = max(1, math.ceil(espera))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Demasiadas peticiones. Intenta de nuevo en {segundos} s.",
                headers={"Retry-After": str(segundos), "X-RateLimit-Limit": str(self.maximo), "X-RateLimit-Remaining": "0"},
            )
        response.headers["X-RateLimit-Limit"] = str(self.maximo)
        response.headers["X-RateLimit-Remaining"] = str(restantes)


limite_general = Limitador("general", settings.limite_por_minuto)
limite_login = Limitador("login", settings.limite_login_por_minuto)
limite_modelo = Limitador("modelo", settings.limite_modelo_por_minuto)
