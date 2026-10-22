"""Utilidades comunes y fábrica de endpoints CRUD (listar, obtener, crear, actualizar, eliminar)."""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import DB, Base
from app.seguridad import requiere

# Códigos de error de PostgreSQL traducidos a algo entendible
MENSAJES_BD = {
    "23505": "ya existe un registro con ese valor",
    "23503": "está relacionado con otros registros (o apunta a uno que no existe)",
    "23514": "algún valor no cumple las reglas de la base de datos",
    "23502": "falta un campo obligatorio",
}


def obtener_o_404(db: Session, modelo: type[Base], item_id: int, nombre: str):
    objeto = db.get(modelo, item_id)
    if objeto is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No se encontró {nombre} con id {item_id}")
    return objeto


def guardar(db: Session) -> None:
    """Hace commit; si PostgreSQL rechaza los datos responde 409 con un mensaje claro."""
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        codigo = getattr(error.orig, "sqlstate", None)
        detalle = getattr(getattr(error.orig, "diag", None), "message_detail", None)
        mensaje = f"No se pudo completar: {MENSAJES_BD.get(codigo, 'los datos no son válidos')}."
        raise HTTPException(status.HTTP_409_CONFLICT, f"{mensaje} {detalle}" if detalle else mensaje) from error


def router_crud(
    modelo: type[Base],
    entrada: type[BaseModel],
    salida: type[BaseModel],
    prefijo: str,
    etiqueta: str,
    nombre: str,
    scope_leer: str = "catalogos:leer",
    scope_escribir: str = "catalogos:escribir",
) -> APIRouter:
    """Genera los 5 endpoints CRUD de una tabla. Leer y escribir piden scopes distintos."""
    router = APIRouter(prefix=prefijo, tags=[etiqueta])
    leer = [requiere(scope_leer)]
    escribir = [requiere(scope_escribir)]

    @router.get("", response_model=list[salida], dependencies=leer, summary=f"Listar {etiqueta.lower()}")
    def listar(db: DB):
        return db.scalars(select(modelo).order_by(modelo.id)).all()

    @router.get("/{item_id}", response_model=salida, dependencies=leer, summary=f"Obtener {nombre}")
    def obtener(item_id: int, db: DB):
        return obtener_o_404(db, modelo, item_id, nombre)

    @router.post("", response_model=salida, status_code=status.HTTP_201_CREATED, dependencies=escribir, summary=f"Crear {nombre}")
    def crear(datos: entrada, db: DB):
        objeto = modelo(**datos.model_dump())
        db.add(objeto)
        guardar(db)
        db.refresh(objeto)
        return objeto

    @router.put("/{item_id}", response_model=salida, dependencies=escribir, summary=f"Actualizar {nombre}")
    def actualizar(item_id: int, datos: entrada, db: DB):
        objeto = obtener_o_404(db, modelo, item_id, nombre)
        for campo, valor in datos.model_dump().items():
            setattr(objeto, campo, valor)
        guardar(db)
        db.refresh(objeto)
        return objeto

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=escribir, summary=f"Eliminar {nombre}")
    def eliminar(item_id: int, db: DB):
        db.delete(obtener_o_404(db, modelo, item_id, nombre))
        guardar(db)

    return router
