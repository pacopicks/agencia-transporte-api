from fastapi import APIRouter
from sqlalchemy import func, select

from app import models, schemas
from app.database import DB
from app.seguridad import requiere

router = APIRouter(prefix="/api/panel", tags=["Panel"], dependencies=[requiere("asignaciones:leer")])


@router.get("", response_model=schemas.Panel, summary="Resumen para el tablero")
def resumen(db: DB):
    def por_estado(columna):
        return dict(db.execute(select(columna, func.count()).group_by(columna)).all())

    def total(modelo):
        return db.scalar(select(func.count()).select_from(modelo))

    km, costo = db.execute(
        select(
            func.coalesce(func.sum(models.Asignacion.distancia_total_km), 0),
            func.coalesce(func.sum(models.Asignacion.costo_estimado), 0),
        ).where(models.Asignacion.estado.in_(models.ASIGNACION_ACTIVA))
    ).one()
    return schemas.Panel(
        envios=por_estado(models.Envio.estado),
        camiones=por_estado(models.Camion.estado),
        ubicaciones=total(models.Ubicacion),
        tramos=total(models.Tramo),
        conductores=total(models.Conductor),
        km_planificados=round(km, 1),
        costo_planificado=round(costo, 2),
    )
