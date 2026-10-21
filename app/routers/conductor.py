"""Endpoints de la app móvil del conductor.

Regla contra BOLA/IDOR: el conductor nunca decide de quién son los datos.
- Lo que es suyo (su camión, su viaje actual, su ubicación) se toma de la SESIÓN: no hay id que cambiar.
- Cuando sí manda un id (un viaje de su historial) se comprueba que el viaje sea suyo;
  si no lo es, responde 404 igual que si no existiera (así no puede averiguar qué ids existen).
"""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import guardar
from app.database import DB
from app.routers.posiciones import a_esquema
from app.routers.rutas import detalle_asignacion
from app.seguridad import Identidad, con_permiso
from app.services import viajes

router = APIRouter(prefix="/api/conductor", tags=["App móvil (conductor)"])
SesionConductor = con_permiso("conductor:viaje")


def _conductor_id(identidad: Identidad) -> int:
    if identidad.usuario is None or identidad.usuario.conductor_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tu usuario no está vinculado a un conductor")
    return identidad.usuario.conductor_id


def _mi_camion(db: Session, identidad: Identidad) -> models.Camion:
    camion = db.scalar(select(models.Camion).where(models.Camion.conductor_id == _conductor_id(identidad)))
    if camion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No tienes un camión asignado")
    return camion


def _mi_viaje(db: Session, identidad: Identidad, asignacion_id: int) -> models.Asignacion:
    """Control BOLA: el viaje tiene que ser de este conductor; si no, 404 como si no existiera."""
    asignacion = db.get(models.Asignacion, asignacion_id)
    if asignacion is None or asignacion.conductor_id != _conductor_id(identidad):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No se encontró el viaje {asignacion_id}")
    return asignacion


@router.get("/camion", response_model=schemas.MiCamion, summary="Mi camión")
def mi_camion(identidad: SesionConductor, db: DB):
    camion = _mi_camion(db, identidad)
    return schemas.MiCamion(
        id=camion.id,
        placa=camion.placa,
        marca=camion.marca,
        modelo=camion.modelo,
        capacidad_kg=camion.capacidad_kg,
        estado=camion.estado,
        ubicacion=camion.ubicacion.nombre if camion.ubicacion else None,
        conductor=camion.conductor.nombre if camion.conductor else "",
    )


@router.get("/viaje", response_model=schemas.RutaCamion, summary="Mi viaje actual")
def viaje_actual(identidad: SesionConductor, db: DB):
    asignacion = db.scalar(
        select(models.Asignacion)
        .where(
            models.Asignacion.conductor_id == _conductor_id(identidad),
            models.Asignacion.estado.in_(models.ASIGNACION_ACTIVA),
        )
        .order_by(models.Asignacion.id.desc())
        .limit(1)
    )
    if asignacion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No tienes viajes asignados por ahora")
    return detalle_asignacion(db, asignacion)


@router.get("/viajes", response_model=list[schemas.ViajeResumen], summary="Mi historial de viajes")
def mis_viajes(identidad: SesionConductor, db: DB):
    # El filtro por dueño va dentro de la consulta SQL: los viajes ajenos nunca se leen
    asignaciones = db.scalars(
        select(models.Asignacion)
        .where(models.Asignacion.conductor_id == _conductor_id(identidad))
        .order_by(models.Asignacion.id.desc())
    ).all()
    nombres = dict(db.execute(select(models.Ubicacion.id, models.Ubicacion.nombre)).all())
    return [
        schemas.ViajeResumen(
            id=a.id,
            estado=a.estado,
            envio=a.envio.codigo,
            cliente=a.envio.cliente,
            origen=nombres.get(a.envio.origen_id, "—"),
            destino=nombres.get(a.envio.destino_id, "—"),
            distancia_total_km=a.distancia_total_km,
            tiempo_estimado_min=a.tiempo_estimado_min,
            creado_en=a.creado_en,
            actualizado_en=a.actualizado_en,
        )
        for a in asignaciones
    ]


@router.get("/viajes/{asignacion_id}", response_model=schemas.RutaCamion, summary="Detalle de uno de mis viajes")
def mi_viaje(asignacion_id: int, identidad: SesionConductor, db: DB):
    return detalle_asignacion(db, _mi_viaje(db, identidad, asignacion_id))


@router.post("/viajes/{asignacion_id}/iniciar", response_model=schemas.RutaCamion, summary="Salir a ruta")
def iniciar_viaje(asignacion_id: int, identidad: SesionConductor, db: DB):
    asignacion = _mi_viaje(db, identidad, asignacion_id)
    viajes.iniciar(asignacion)
    guardar(db)
    db.refresh(asignacion)
    return detalle_asignacion(db, asignacion)


@router.post("/viajes/{asignacion_id}/entregar", response_model=schemas.RutaCamion, summary="Confirmar la entrega")
def entregar(asignacion_id: int, identidad: SesionConductor, db: DB):
    asignacion = _mi_viaje(db, identidad, asignacion_id)
    viajes.completar(asignacion)
    guardar(db)
    db.refresh(asignacion)
    return detalle_asignacion(db, asignacion)


@router.post(
    "/ubicacion",
    response_model=schemas.Posicion,
    status_code=status.HTTP_201_CREATED,
    summary="Reportar mi ubicación GPS",
)
def reportar_ubicacion(datos: schemas.PosicionEntrada, identidad: SesionConductor, db: DB):
    """El camión NO viene en el cuerpo: se toma de la sesión (mandar camion_id responde 422)."""
    camion = _mi_camion(db, identidad)
    posicion = models.Posicion(camion_id=camion.id, usuario_id=identidad.usuario.id, **datos.model_dump())
    db.add(posicion)
    guardar(db)
    db.refresh(posicion)
    return a_esquema(posicion, camion.placa)
