"""Endpoints solo para el rol admin: usuarios, camiones y API keys."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app import models, schemas
from app.database import DB
from app.seguridad import Admin, generar_api_key, hashear_password

router = APIRouter(prefix="/api", tags=["2. Administración (solo admin)"])


def guardar(db, objeto) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un registro con esos datos o está en uso")
    db.refresh(objeto)


# ---------- Usuarios ----------

@router.get("/usuarios", response_model=list[schemas.Usuario], summary="Listar usuarios")
def listar_usuarios(_: Admin, db: DB):
    return db.scalars(select(models.Usuario).order_by(models.Usuario.id)).all()


@router.post("/usuarios", response_model=schemas.Usuario, status_code=201, summary="Crear usuario")
def crear_usuario(datos: schemas.UsuarioNuevo, _: Admin, db: DB):
    usuario = models.Usuario(
        usuario=datos.usuario, nombre=datos.nombre, rol=datos.rol, password_hash=hashear_password(datos.password)
    )
    db.add(usuario)
    guardar(db, usuario)
    return usuario


# ---------- Camiones ----------

@router.get("/camiones", response_model=list[schemas.Camion], summary="Listar camiones")
def listar_camiones(_: Admin, db: DB):
    return db.scalars(select(models.Camion).order_by(models.Camion.id)).all()


@router.post("/camiones", response_model=schemas.Camion, status_code=201, summary="Registrar camión")
def crear_camion(datos: schemas.CamionNuevo, _: Admin, db: DB):
    if datos.conductor_id is not None:
        conductor = db.get(models.Usuario, datos.conductor_id)
        if conductor is None or conductor.rol != "conductor":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "conductor_id debe ser un usuario con rol conductor")
    camion = models.Camion(**datos.model_dump())
    db.add(camion)
    guardar(db, camion)
    return camion


# ---------- API keys ----------

@router.get("/api-keys", response_model=list[schemas.ApiKey], summary="Listar API keys")
def listar_api_keys(_: Admin, db: DB):
    return db.scalars(select(models.ApiKey).order_by(models.ApiKey.id)).all()


@router.post("/api-keys", response_model=schemas.ApiKeyCreada, status_code=201, summary="Crear API key")
def crear_api_key(datos: schemas.ApiKeyNueva, _: Admin, db: DB):
    """Regresa la llave completa UNA sola vez; en la base solo se guarda su hash (SHA-256)."""
    clave, prefijo, hash_ = generar_api_key()
    api_key = models.ApiKey(nombre=datos.nombre, prefijo=prefijo, hash=hash_)
    db.add(api_key)
    guardar(db, api_key)
    return schemas.ApiKeyCreada(**schemas.ApiKey.model_validate(api_key).model_dump(), clave=clave)


@router.delete("/api-keys/{api_key_id}", status_code=204, summary="Revocar (borrar) una API key")
def revocar_api_key(api_key_id: int, _: Admin, db: DB):
    api_key = db.get(models.ApiKey, api_key_id)
    if api_key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe esa API key")
    db.delete(api_key)
    db.commit()
