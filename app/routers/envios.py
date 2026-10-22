"""Envíos: aquí están los controles de roles y de BOLA/IDOR.

Quién es dueño de qué:
- Un CLIENTE solo ve y cancela SUS envíos (envio.cliente_id == su id).
- Un CONDUCTOR solo ve y entrega los envíos asignados a SU camión.
- El ADMIN ve todo y ejecuta la asignación automática.
Si alguien pide un envío que no es suyo, recibe 404 (igual que si no existiera),
así no puede averiguar qué ids existen.
"""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.database import DB
from app.seguridad import Admin, UsuarioActual

router = APIRouter(prefix="/api/envios", tags=["3. Envíos (roles + BOLA/IDOR)"])

LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I para que no se confundan


def nuevo_codigo() -> str:
    """Código de rastreo aleatorio (no consecutivo, imposible de adivinar)."""
    return "TR-" + "".join(secrets.choice(LETRAS) for _ in range(8))


def es_dueno(envio: models.Envio, usuario: models.Usuario) -> bool:
    if usuario.rol == "admin":
        return True
    if usuario.rol == "cliente":
        return envio.cliente_id == usuario.id
    if usuario.rol == "conductor":
        return envio.camion is not None and envio.camion.conductor_id == usuario.id
    return False


def obtener_envio(db, envio_id: int, usuario: models.Usuario) -> models.Envio:
    """Control BOLA/IDOR: si el envío no existe O no es del usuario, responde el mismo 404."""
    envio = db.get(models.Envio, envio_id)
    if envio is None or not es_dueno(envio, usuario):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No se encontró el envío {envio_id}")
    return envio


@router.get("", response_model=list[schemas.Envio], summary="Mis envíos")
def listar(usuario: UsuarioActual, db: DB):
    """El filtro por dueño va dentro de la consulta SQL: nunca se leen envíos ajenos."""
    consulta = select(models.Envio).order_by(models.Envio.id)
    if usuario.rol == "cliente":
        consulta = consulta.where(models.Envio.cliente_id == usuario.id)
    elif usuario.rol == "conductor":
        consulta = consulta.join(models.Camion).where(models.Camion.conductor_id == usuario.id)
    return db.scalars(consulta).all()


@router.post("", response_model=schemas.Envio, status_code=201, summary="Solicitar un envío (cliente)")
def crear(datos: schemas.EnvioNuevo, usuario: UsuarioActual, db: DB):
    if usuario.rol == "conductor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Los conductores no pueden crear envíos")
    # El dueño sale del token, nunca del cuerpo de la petición
    envio = models.Envio(codigo=nuevo_codigo(), cliente_id=usuario.id, **datos.model_dump())
    db.add(envio)
    db.commit()
    db.refresh(envio)
    return envio


@router.get("/{envio_id}", response_model=schemas.Envio, summary="Ver un envío")
def ver(envio_id: int, usuario: UsuarioActual, db: DB):
    return obtener_envio(db, envio_id, usuario)


@router.post("/{envio_id}/entregar", response_model=schemas.Envio, summary="Marcar como entregado (conductor)")
def entregar(envio_id: int, usuario: UsuarioActual, db: DB):
    envio = obtener_envio(db, envio_id, usuario)
    if usuario.rol == "cliente":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el conductor o el admin pueden marcar entregas")
    if envio.estado != "asignado":
        raise HTTPException(status.HTTP_409_CONFLICT, f"El envío está '{envio.estado}', no se puede entregar")
    envio.estado = "entregado"
    envio.entregado_en = datetime.now(timezone.utc)
    envio.camion.disponible = True
    db.commit()
    db.refresh(envio)
    return envio


@router.post("/{envio_id}/cancelar", response_model=schemas.Envio, summary="Cancelar un envío (cliente)")
def cancelar(envio_id: int, usuario: UsuarioActual, db: DB):
    envio = obtener_envio(db, envio_id, usuario)
    if usuario.rol == "conductor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Los conductores no pueden cancelar envíos")
    if envio.estado not in ("pendiente", "asignado") or (usuario.rol == "cliente" and envio.estado != "pendiente"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"El envío está '{envio.estado}', ya no se puede cancelar")
    if envio.camion:
        envio.camion.disponible = True
    envio.estado = "cancelado"
    db.commit()
    db.refresh(envio)
    return envio


@router.post("/asignar-automatico", response_model=schemas.ResultadoAsignacion, summary="Asignar camiones (admin)")
def asignar_automatico(_: Admin, db: DB):
    """Modelo de asignación: a cada envío pendiente (de más pesado a más ligero) le asigna el
    camión disponible MÁS CHICO que lo aguante, para dejar libres los grandes para cargas grandes."""
    pendientes = db.scalars(
        select(models.Envio).where(models.Envio.estado == "pendiente").order_by(models.Envio.peso_kg.desc())
    ).all()
    asignados, sin_camion = [], []
    for envio in pendientes:
        camion = db.scalar(
            select(models.Camion)
            .where(
                models.Camion.disponible,
                models.Camion.conductor_id.is_not(None),
                models.Camion.capacidad_kg >= envio.peso_kg,
            )
            .order_by(models.Camion.capacidad_kg)
            .limit(1)
        )
        if camion is None:
            sin_camion.append(f"{envio.codigo}: no hay camión libre y con conductor que aguante {envio.peso_kg:,.0f} kg")
            continue
        envio.camion_id, envio.estado, camion.disponible = camion.id, "asignado", False
        db.flush()
        asignados.append(envio)
    db.commit()
    return schemas.ResultadoAsignacion(asignados=asignados, sin_camion=sin_camion)
