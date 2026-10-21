from fastapi import APIRouter, status
from sqlalchemy import select

from app import models, schemas
from app.crud import guardar, obtener_o_404
from app.database import DB
from app.seguridad import con_permiso, generar_api_key, requiere

router = APIRouter(prefix="/api/api-keys", tags=["API keys"], dependencies=[requiere("usuarios:admin")])
Admin = con_permiso("usuarios:admin")


@router.get("", response_model=list[schemas.ApiKey], summary="Listar API keys")
def listar(db: DB):
    return db.scalars(select(models.ApiKey).order_by(models.ApiKey.id)).all()


@router.post("", response_model=schemas.ApiKeyCreada, status_code=status.HTTP_201_CREATED, summary="Crear API key")
def crear(datos: schemas.ApiKeyCrear, db: DB, actual: Admin):
    """La llave completa solo se devuelve en esta respuesta; en la base se guarda su hash."""
    clave, prefijo, hash_ = generar_api_key()
    api_key = models.ApiKey(
        nombre=datos.nombre,
        prefijo=prefijo,
        hash=hash_,
        scopes=sorted(set(datos.scopes)),
        creado_por_id=actual.usuario.id if actual.usuario else None,
    )
    db.add(api_key)
    guardar(db)
    db.refresh(api_key)
    return schemas.ApiKeyCreada(**schemas.ApiKey.model_validate(api_key).model_dump(), clave=clave)


@router.put("/{api_key_id}", response_model=schemas.ApiKey, summary="Editar o revocar API key")
def actualizar(api_key_id: int, datos: schemas.ApiKeyActualizar, db: DB):
    api_key = obtener_o_404(db, models.ApiKey, api_key_id, "API key")
    api_key.nombre = datos.nombre
    api_key.scopes = sorted(set(datos.scopes))
    api_key.activo = datos.activo
    guardar(db)
    db.refresh(api_key)
    return api_key


@router.delete("/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar API key")
def eliminar(api_key_id: int, db: DB):
    db.delete(obtener_o_404(db, models.ApiKey, api_key_id, "API key"))
    guardar(db)
