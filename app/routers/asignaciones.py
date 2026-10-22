from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app import models, schemas
from app.crud import guardar, obtener_o_404
from app.database import DB
from app.limites import limite_modelo
from app.seguridad import requiere
from app.services import asignador, viajes

router = APIRouter(prefix="/api/asignaciones", tags=["Asignaciones (modelo)"])
LEER = [requiere("asignaciones:leer")]
ESCRIBIR = [requiere("asignaciones:escribir")]


def _obtener(db, asignacion_id: int) -> models.Asignacion:
    return obtener_o_404(db, models.Asignacion, asignacion_id, "asignación")


@router.get("", response_model=list[schemas.Asignacion], dependencies=LEER, summary="Listar asignaciones")
def listar(db: DB, estado: schemas.EstadoAsignacion | None = None):
    consulta = select(models.Asignacion).order_by(models.Asignacion.id.desc())
    if estado:
        consulta = consulta.where(models.Asignacion.estado == estado)
    return db.scalars(consulta).all()


@router.post(
    "/automatica",
    response_model=schemas.ResultadoModelo,
    dependencies=[*ESCRIBIR, Depends(limite_modelo)],
    summary="Ejecutar el modelo de asignación",
)
def ejecutar_modelo(db: DB, criterio: schemas.Criterio = "distancia"):
    """Asigna cada envío pendiente al camión más conveniente y calcula su ruta óptima."""
    asignaciones, no_asignados = asignador.asignar_automaticamente(db, criterio)
    return schemas.ResultadoModelo(
        mensaje=f"Se asignaron {len(asignaciones)} envío(s); {len(no_asignados)} quedaron pendientes.",
        costo_total=round(sum(a.costo_estimado for a in asignaciones), 2),
        asignaciones=asignaciones,
        no_asignados=no_asignados,
    )


@router.post("", response_model=schemas.Asignacion, status_code=status.HTTP_201_CREATED, dependencies=ESCRIBIR, summary="Asignación manual")
def asignar_manual(datos: schemas.AsignacionManual, db: DB):
    envio = obtener_o_404(db, models.Envio, datos.envio_id, "envío")
    camion = obtener_o_404(db, models.Camion, datos.camion_id, "camión")
    return asignador.asignar_manual(db, envio, camion, datos.criterio)


@router.get("/{asignacion_id}", response_model=schemas.Asignacion, dependencies=LEER, summary="Obtener asignación")
def obtener(asignacion_id: int, db: DB):
    return _obtener(db, asignacion_id)


@router.post("/{asignacion_id}/recalcular", response_model=schemas.Asignacion, dependencies=ESCRIBIR, summary="Recalcular la ruta")
def recalcular(asignacion_id: int, db: DB):
    return asignador.recalcular(db, _obtener(db, asignacion_id))


@router.post("/{asignacion_id}/iniciar", response_model=schemas.Asignacion, dependencies=ESCRIBIR, summary="El camión sale a ruta")
def iniciar(asignacion_id: int, db: DB):
    asignacion = _obtener(db, asignacion_id)
    viajes.iniciar(asignacion)
    guardar(db)
    db.refresh(asignacion)
    return asignacion


@router.post("/{asignacion_id}/completar", response_model=schemas.Asignacion, dependencies=ESCRIBIR, summary="Envío entregado")
def completar(asignacion_id: int, db: DB):
    asignacion = _obtener(db, asignacion_id)
    viajes.completar(asignacion)
    guardar(db)
    db.refresh(asignacion)
    return asignacion


@router.post("/{asignacion_id}/cancelar", response_model=schemas.Asignacion, dependencies=ESCRIBIR, summary="Cancelar asignación")
def cancelar(asignacion_id: int, db: DB):
    asignacion = _obtener(db, asignacion_id)
    viajes.cancelar(asignacion)
    guardar(db)
    db.refresh(asignacion)
    return asignacion


@router.delete("/{asignacion_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=ESCRIBIR, summary="Eliminar asignación")
def eliminar(asignacion_id: int, db: DB):
    asignacion = _obtener(db, asignacion_id)
    if asignacion.estado in models.ASIGNACION_ACTIVA:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cancela la asignación antes de eliminarla")
    db.delete(asignacion)
    guardar(db)
