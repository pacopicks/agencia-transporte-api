from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.crud import guardar, obtener_o_404
from app.database import DB
from app.seguridad import con_permiso, hashear_password, requiere

router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"], dependencies=[requiere("usuarios:admin")])
Admin = con_permiso("usuarios:admin")


@router.get("", response_model=list[schemas.Usuario], summary="Listar usuarios")
def listar(db: DB):
    return db.scalars(select(models.Usuario).order_by(models.Usuario.id)).all()


@router.post("", response_model=schemas.Usuario, status_code=status.HTTP_201_CREATED, summary="Crear usuario")
def crear(datos: schemas.UsuarioCrear, db: DB):
    usuario = models.Usuario(
        **datos.model_dump(exclude={"password"}), password_hash=hashear_password(datos.password)
    )
    db.add(usuario)
    guardar(db)
    db.refresh(usuario)
    return usuario


@router.put("/{usuario_id}", response_model=schemas.Usuario, summary="Actualizar usuario")
def actualizar(usuario_id: int, datos: schemas.UsuarioActualizar, db: DB, actual: Admin):
    usuario = obtener_o_404(db, models.Usuario, usuario_id, "usuario")
    if actual.usuario and usuario.id == actual.usuario.id and (not datos.activo or datos.rol != "admin"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes quitarte el rol de admin ni desactivar tu cuenta")
    for campo, valor in datos.model_dump(exclude={"password"}).items():
        setattr(usuario, campo, valor)
    if datos.password:
        usuario.password_hash = hashear_password(datos.password)
    guardar(db)
    db.refresh(usuario)
    return usuario


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar usuario")
def eliminar(usuario_id: int, db: DB, actual: Admin):
    if actual.usuario and usuario_id == actual.usuario.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes eliminar tu propia cuenta")
    db.delete(obtener_o_404(db, models.Usuario, usuario_id, "usuario"))
    guardar(db)
