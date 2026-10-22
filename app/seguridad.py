"""Seguridad de la API: contraseñas, JWT con scopes, API keys y control de acceso.

Hay dos formas de autenticarse:
- Personas (panel web): POST /api/auth/token  ->  JWT  ->  "Authorization: Bearer <token>"
- Otras aplicaciones (app de conductores, integraciones): encabezado "X-API-Key: atk_..."

Cada endpoint exige uno o más *scopes* (permisos). Un usuario tiene los scopes de su
rol; una API key, los que se le asignaron al crearla.
"""
import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer, SecurityScopes
from sqlalchemy import select

from app.config import settings
from app.database import DB
from app.models import ApiKey, Usuario

SCOPES = {
    "catalogos:leer": "Consultar ubicaciones, tramos, camiones, conductores y envíos",
    "catalogos:escribir": "Crear, editar y eliminar registros de los catálogos",
    "asignaciones:leer": "Consultar asignaciones y el resumen del panel",
    "asignaciones:escribir": "Ejecutar el modelo, asignar manualmente y cambiar estados",
    "rutas:leer": "Calcular rutas óptimas y consultar la ruta de un camión",
    "usuarios:admin": "Administrar usuarios y API keys",
    "conductor:viaje": "App móvil: ver, iniciar y entregar SUS viajes y reportar su ubicación",
}

ROLES: dict[str, set[str]] = {
    "admin": set(SCOPES) - {"conductor:viaje"},  # el admin no maneja un camión
    "operador": {"catalogos:leer", "catalogos:escribir", "asignaciones:leer", "asignaciones:escribir", "rutas:leer"},
    "consulta": {"catalogos:leer", "asignaciones:leer", "rutas:leer"},
    # Solo sobre SU camión y SUS viajes (ver los controles BOLA en rutas.py y conductor.py)
    "conductor": {"rutas:leer", "conductor:viaje"},
}

ALGORITMO = "HS256"
ITERACIONES = 200_000
PREFIJO_API_KEY = "atk_"

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/token", scopes=SCOPES, auto_error=False)
encabezado_api_key = APIKeyHeader(
    name="X-API-Key", auto_error=False, description="API key para aplicaciones (se crea en el panel de administración)"
)


# ---------- Contraseñas ----------

def hashear_password(password: str) -> str:
    sal = os.urandom(16)
    clave = hashlib.pbkdf2_hmac("sha256", password.encode(), sal, ITERACIONES)
    return f"pbkdf2_sha256${ITERACIONES}${sal.hex()}${clave.hex()}"


def verificar_password(password: str, guardado: str) -> bool:
    try:
        _, iteraciones, sal, clave = guardado.split("$")
    except ValueError:
        return False
    calculada = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(sal), int(iteraciones))
    return hmac.compare_digest(calculada.hex(), clave)


# Hash de relleno: si el usuario no existe igual se calcula un hash, así la respuesta
# tarda lo mismo y no se puede adivinar qué usuarios existen midiendo el tiempo.
HASH_DE_RELLENO = hashear_password(secrets.token_hex(8))


# ---------- JWT ----------

def crear_token(usuario: Usuario, scopes: set[str]) -> str:
    ahora = datetime.now(timezone.utc)
    datos = {
        "sub": usuario.usuario,
        "rol": usuario.rol,
        "scope": " ".join(sorted(scopes)),
        "iat": ahora,
        "exp": ahora + timedelta(minutes=settings.token_minutos),
    }
    return jwt.encode(datos, settings.secret_key, algorithm=ALGORITMO)


def leer_token(token: str) -> dict:
    """Valida firma y expiración del JWT. Lanza jwt.PyJWTError si no es válido."""
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITMO], options={"require": ["exp", "sub"]})


# ---------- API keys ----------

def hash_api_key(clave: str) -> str:
    # Las llaves son aleatorias y largas, así que basta SHA-256 (no hace falta un hash lento)
    return hashlib.sha256(clave.encode()).hexdigest()


def generar_api_key() -> tuple[str, str, str]:
    """Regresa (llave completa, prefijo visible, hash para guardar)."""
    clave = PREFIJO_API_KEY + secrets.token_urlsafe(32)
    return clave, clave[:12], hash_api_key(clave)


# ---------- Identidad y permisos ----------

@dataclass
class Identidad:
    """Quién hace la petición y qué puede hacer."""

    nombre: str
    scopes: set[str]
    usuario: Usuario | None = None
    api_key: ApiKey | None = None

    @property
    def es_conductor(self) -> bool:
        return self.usuario is not None and self.usuario.rol == "conductor"


def _no_autorizado(detalle: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detalle, headers={"WWW-Authenticate": "Bearer"})


def _identidad_por_jwt(db, token: str) -> Identidad:
    try:
        datos = leer_token(token)
    except jwt.ExpiredSignatureError:
        raise _no_autorizado("La sesión expiró, vuelve a iniciar sesión")
    except jwt.PyJWTError:
        raise _no_autorizado("Token inválido")
    usuario = db.scalar(select(Usuario).where(Usuario.usuario == datos["sub"]))
    if usuario is None or not usuario.activo:
        raise _no_autorizado("Usuario inexistente o desactivado")
    # El rol se revisa en la base en cada petición: si le quitan permisos a alguien, aplica de inmediato
    scopes = set(str(datos.get("scope", "")).split()) & ROLES.get(usuario.rol, set())
    return Identidad(nombre=usuario.usuario, scopes=scopes, usuario=usuario)


def _identidad_por_api_key(db, clave: str) -> Identidad:
    api_key = db.scalar(select(ApiKey).where(ApiKey.hash == hash_api_key(clave)))
    if api_key is None or not api_key.activo:
        raise _no_autorizado("API key inválida o revocada")
    api_key.ultimo_uso = datetime.now(timezone.utc)
    db.commit()
    # Una API key nunca puede administrar usuarios ni crear otras llaves, ni actuar como conductor
    scopes = set(api_key.scopes) & (set(SCOPES) - {"usuarios:admin", "conductor:viaje"})
    return Identidad(nombre=f"api-key {api_key.prefijo}", scopes=scopes, api_key=api_key)


def identidad_actual(
    permisos: SecurityScopes,
    db: DB,
    token: Annotated[str | None, Depends(oauth2)],
    clave: Annotated[str | None, Depends(encabezado_api_key)],
) -> Identidad:
    """Autentica la petición (JWT o API key) y verifica que tenga los scopes que pide el endpoint."""
    if token:
        identidad = _identidad_por_jwt(db, token)
    elif clave:
        identidad = _identidad_por_api_key(db, clave)
    else:
        raise _no_autorizado("Falta autenticación: envía 'Authorization: Bearer <token>' o el encabezado 'X-API-Key'")
    faltantes = set(permisos.scopes) - identidad.scopes
    if faltantes:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"No tienes permiso para esta acción (falta: {', '.join(sorted(faltantes))})"
        )
    return identidad


def requiere(*scopes: str):
    """Protege un endpoint, por ejemplo: dependencies=[requiere("catalogos:leer")]."""
    return Security(identidad_actual, scopes=list(scopes))


def con_permiso(*scopes: str):
    """Igual que requiere(), pero para recibir la identidad como parámetro del endpoint."""
    return Annotated[Identidad, Security(identidad_actual, scopes=list(scopes))]
