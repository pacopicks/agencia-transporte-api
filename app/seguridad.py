"""Seguridad: contraseñas, JWT, roles y API keys."""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer
from sqlalchemy import select

from app import config
from app.database import DB
from app.models import ApiKey, Usuario

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
encabezado_api_key = APIKeyHeader(name="X-API-Key", auto_error=False)


# ---------- Contraseñas (PBKDF2-SHA256 con sal aleatoria) ----------

def hashear_password(password: str) -> str:
    sal = os.urandom(16)
    clave = hashlib.pbkdf2_hmac("sha256", password.encode(), sal, 200_000)
    return f"{sal.hex()}${clave.hex()}"


def verificar_password(password: str, guardado: str) -> bool:
    sal, clave = guardado.split("$")
    calculada = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(sal), 200_000)
    return hmac.compare_digest(calculada.hex(), clave)


# ---------- JWT ----------

def crear_token(usuario: Usuario) -> str:
    expira = datetime.now(timezone.utc) + timedelta(minutes=config.TOKEN_MINUTOS)
    datos = {"sub": str(usuario.id), "rol": usuario.rol, "exp": expira}
    return jwt.encode(datos, config.SECRET_KEY, algorithm="HS256")


def usuario_actual(db: DB, token: str = Depends(oauth2)) -> Usuario:
    """Valida el JWT (firma y expiración) y regresa el usuario. Sin token válido: 401."""
    try:
        datos = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "El token expiró, vuelve a iniciar sesión")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")
    usuario = db.get(Usuario, int(datos["sub"]))
    if usuario is None or not usuario.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inexistente o desactivado")
    return usuario


# ---------- Roles ----------

def requiere_rol(*roles: str):
    """Permite el endpoint solo a ciertos roles; los demás reciben 403."""

    def verificar(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if usuario.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Acción permitida solo para: {', '.join(roles)}")
        return usuario

    return verificar


UsuarioActual = Annotated[Usuario, Depends(usuario_actual)]
Admin = Annotated[Usuario, Depends(requiere_rol("admin"))]


# ---------- API keys ----------

def hash_api_key(clave: str) -> str:
    return hashlib.sha256(clave.encode()).hexdigest()


def generar_api_key() -> tuple[str, str, str]:
    """Regresa (llave completa, prefijo visible, hash que se guarda en la base)."""
    clave = "atk_" + secrets.token_urlsafe(32)
    return clave, clave[:12], hash_api_key(clave)


def api_key_valida(db: DB, clave: str | None = Security(encabezado_api_key)) -> ApiKey:
    """Exige el encabezado X-API-Key con una llave registrada. Sin ella: 401."""
    if not clave:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el encabezado X-API-Key")
    api_key = db.scalar(select(ApiKey).where(ApiKey.hash == hash_api_key(clave)))
    if api_key is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key inválida o revocada")
    api_key.ultimo_uso = datetime.now(timezone.utc)
    db.commit()
    return api_key
