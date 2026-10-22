"""JWT: iniciar sesión y consultar el usuario de la sesión."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app import config, schemas
from app.database import DB
from app.limitador import limiter
from app.models import Usuario
from app.seguridad import UsuarioActual, crear_token, hashear_password, verificar_password

router = APIRouter(prefix="/api/auth", tags=["1. Autenticación (JWT)"])

# Si el usuario no existe se compara contra este hash para que la respuesta tarde lo mismo
# y no se pueda adivinar qué usuarios existen midiendo el tiempo.
HASH_FALSO = hashear_password("no-existe")


@router.post("/login", response_model=schemas.Token, summary="Iniciar sesión y obtener un JWT")
@limiter.limit(config.LIMITE_LOGIN)  # contra ataques de fuerza bruta: 5 intentos por minuto por IP
def login(request: Request, form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB):
    usuario = db.scalar(select(Usuario).where(Usuario.usuario == form.username))
    password_ok = verificar_password(form.password, usuario.password_hash if usuario else HASH_FALSO)
    if usuario is None or not password_ok or not usuario.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")
    return schemas.Token(access_token=crear_token(usuario), rol=usuario.rol)


@router.get("/yo", response_model=schemas.Usuario, summary="¿Quién soy? (requiere JWT)")
def yo(usuario: UsuarioActual):
    return usuario
