from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select

from app import models, schemas
from app.database import DB
from app.limites import limite_login
from app.seguridad import (
    HASH_DE_RELLENO,
    ROLES,
    Identidad,
    crear_token,
    hashear_password,
    identidad_actual,
    verificar_password,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])
Sesion = Annotated[Identidad, Security(identidad_actual)]  # cualquier sesión válida, sin scopes extra


@router.post(
    "/token",
    response_model=schemas.Token,
    dependencies=[Depends(limite_login)],
    summary="Iniciar sesión (devuelve un JWT)",
)
def iniciar_sesion(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB):
    """Si no pides scopes recibes todos los de tu rol; si pides algunos, el token solo tendrá esos."""
    # El usuario no distingue mayúsculas ni espacios de más (el teclado del celular los agrega solo).
    # La contraseña sí se compara exacta.
    nombre = form.username.strip().lower()
    usuario = db.scalar(select(models.Usuario).where(func.lower(models.Usuario.usuario) == nombre))
    password_ok = verificar_password(form.password, usuario.password_hash if usuario else HASH_DE_RELLENO)
    if usuario is None or not password_ok or not usuario.activo:
        # Mismo mensaje en todos los casos para no revelar qué usuarios existen
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")
    permitidos = ROLES[usuario.rol]
    pedidos = set(form.scopes)
    if pedidos - permitidos:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Tu rol ({usuario.rol}) no permite: {', '.join(sorted(pedidos - permitidos))}"
        )
    scopes = pedidos or permitidos
    return schemas.Token(
        access_token=crear_token(usuario, scopes), nombre=usuario.nombre, rol=usuario.rol, scopes=sorted(scopes)
    )


@router.get("/yo", response_model=schemas.Yo, summary="Quién soy y qué permisos tengo")
def yo(identidad: Sesion):
    if identidad.usuario:
        u = identidad.usuario
        return schemas.Yo(
            tipo="usuario", nombre=u.nombre, usuario=u.usuario, rol=u.rol,
            conductor_id=u.conductor_id, scopes=sorted(identidad.scopes),
        )
    return schemas.Yo(tipo="api_key", nombre=identidad.nombre, scopes=sorted(identidad.scopes))


@router.put("/yo/password", status_code=status.HTTP_204_NO_CONTENT, summary="Cambiar mi contraseña")
def cambiar_password(datos: schemas.CambioPassword, identidad: Sesion, db: DB):
    # No recibe un id en la URL: cada quien solo puede cambiar SU contraseña (evita BOLA/IDOR)
    if identidad.usuario is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Las API keys no tienen contraseña")
    if not verificar_password(datos.actual, identidad.usuario.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no es correcta")
    identidad.usuario.password_hash = hashear_password(datos.nueva)
    db.commit()
