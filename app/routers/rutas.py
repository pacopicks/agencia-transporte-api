from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.crud import obtener_o_404
from app.database import DB
from app.seguridad import con_permiso, requiere
from app.services.rutas import Grafo

router = APIRouter(prefix="/api/rutas", tags=["Rutas"])
LectorRutas = con_permiso("rutas:leer")


def describir(db: Session, nodos: list[int], etapa: str | None = None) -> list[schemas.Paso]:
    """Convierte una lista de ubicaciones en pasos con nombre, distancia, tiempo y caseta."""
    nombres = dict(db.execute(select(models.Ubicacion.id, models.Ubicacion.nombre)).all())
    tramos: dict[tuple[int, int], models.Tramo] = {}
    for t in sorted(db.scalars(select(models.Tramo)), key=lambda t: not t.activo):  # primero los abiertos
        tramos.setdefault((t.origen_id, t.destino_id), t)
        if t.bidireccional:
            tramos.setdefault((t.destino_id, t.origen_id), t)
    pasos = []
    for desde, hasta in zip(nodos, nodos[1:]):
        tramo = tramos.get((desde, hasta))
        pasos.append(
            schemas.Paso(
                desde_id=desde,
                desde=nombres.get(desde, f"#{desde}"),
                hasta_id=hasta,
                hasta=nombres.get(hasta, f"#{hasta}"),
                distancia_km=tramo.distancia_km if tramo else 0,
                tiempo_min=tramo.tiempo_min if tramo else 0,
                peaje=tramo.peaje if tramo else 0,
                abierto=bool(tramo and tramo.activo),
                etapa=etapa,
            )
        )
    return pasos


def detalle_asignacion(db: Session, asignacion: models.Asignacion) -> schemas.RutaCamion:
    """Toda la información de un viaje: envío, camión, ruta paso a paso y coordenadas."""
    camion = asignacion.camion
    envio = asignacion.envio
    conductor = db.get(models.Conductor, asignacion.conductor_id) if asignacion.conductor_id else None

    def nombre(ubicacion_id: int) -> str:
        ubicacion = db.get(models.Ubicacion, ubicacion_id)
        return ubicacion.nombre if ubicacion else "—"

    nodos = set(asignacion.ruta_vacio) | set(asignacion.ruta_carga)
    return schemas.RutaCamion(
        camion_id=camion.id,
        placa=camion.placa,
        conductor=conductor.nombre if conductor else None,
        asignacion_id=asignacion.id,
        envio=envio.codigo,
        cliente=envio.cliente,
        descripcion=envio.descripcion,
        peso_kg=envio.peso_kg,
        origen=nombre(envio.origen_id),
        destino=nombre(envio.destino_id),
        estado=asignacion.estado,
        distancia_total_km=asignacion.distancia_total_km,
        tiempo_estimado_min=asignacion.tiempo_estimado_min,
        costo_estimado=asignacion.costo_estimado,
        ruta_vacio=asignacion.ruta_vacio,
        ruta_carga=asignacion.ruta_carga,
        ubicaciones=db.scalars(select(models.Ubicacion).where(models.Ubicacion.id.in_(nodos))).all(),
        pasos=describir(db, asignacion.ruta_vacio, "vacio") + describir(db, asignacion.ruta_carga, "carga"),
    )


def ruta_activa(db: Session, camion: models.Camion) -> schemas.RutaCamion:
    """Viaje planificado o en curso del camión; 404 si no tiene."""
    asignacion = db.scalar(
        select(models.Asignacion)
        .where(models.Asignacion.camion_id == camion.id, models.Asignacion.estado.in_(models.ASIGNACION_ACTIVA))
        .order_by(models.Asignacion.id.desc())
        .limit(1)
    )
    if asignacion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"El camión {camion.placa} no tiene una ruta asignada")
    return detalle_asignacion(db, asignacion)


@router.get(
    "/optima",
    response_model=schemas.RutaOptima,
    dependencies=[requiere("rutas:leer")],
    summary="Ruta óptima entre dos ubicaciones (Dijkstra)",
)
def ruta_optima(origen_id: int, destino_id: int, db: DB, criterio: schemas.Criterio = "distancia"):
    if origen_id == destino_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El origen y el destino deben ser distintos")
    for ubicacion_id in (origen_id, destino_id):
        obtener_o_404(db, models.Ubicacion, ubicacion_id, "ubicación")
    recorrido = Grafo.desde_bd(db).ruta_optima(origen_id, destino_id, criterio)
    if recorrido is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay ruta entre esas ubicaciones con los tramos abiertos")
    return schemas.RutaOptima(
        criterio=criterio,
        nodos=recorrido.nodos,
        distancia_km=round(recorrido.distancia_km, 1),
        tiempo_min=recorrido.tiempo_min,
        peaje=round(recorrido.peaje, 2),
        pasos=describir(db, recorrido.nodos),
    )


@router.get("/mi-ruta", response_model=schemas.RutaCamion, summary="Ruta del camión del conductor con sesión")
def mi_ruta(identidad: LectorRutas, db: DB):
    """Para la app de conductores: no recibe ningún id, la ruta se toma de la sesión."""
    if identidad.usuario is None or identidad.usuario.conductor_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tu usuario no está vinculado a un conductor")
    camion = db.scalar(select(models.Camion).where(models.Camion.conductor_id == identidad.usuario.conductor_id))
    if camion is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No tienes un camión asignado")
    return ruta_activa(db, camion)


@router.get("/camion/{camion_id}", response_model=schemas.RutaCamion, summary="Indicaciones de ruta de un camión")
def ruta_de_camion(camion_id: int, identidad: LectorRutas, db: DB):
    camion = obtener_o_404(db, models.Camion, camion_id, "camión")
    # Protección BOLA/IDOR: un conductor solo puede consultar SU camión. Si cambia el id en la URL
    # por el de otro camión recibe el mismo 404 que si no existiera (así no puede enumerar camiones).
    if identidad.es_conductor and camion.conductor_id != identidad.usuario.conductor_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No se encontró camión con id {camion_id}")
    return ruta_activa(db, camion)
