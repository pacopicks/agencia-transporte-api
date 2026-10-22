from fastapi import APIRouter
from sqlalchemy import func, select

from app import models, schemas
from app.database import DB
from app.seguridad import requiere

router = APIRouter(prefix="/api/posiciones", tags=["Rutas"])


def a_esquema(posicion: models.Posicion, placa: str) -> schemas.Posicion:
    return schemas.Posicion(
        camion_id=posicion.camion_id,
        placa=placa,
        latitud=posicion.latitud,
        longitud=posicion.longitud,
        precision_m=posicion.precision_m,
        velocidad_kmh=posicion.velocidad_kmh,
        registrado_en=posicion.registrado_en,
    )


@router.get(
    "",
    response_model=list[schemas.Posicion],
    dependencies=[requiere("catalogos:leer")],
    summary="Última ubicación GPS de cada camión",
)
def ultimas_posiciones(db: DB):
    """Para el personal de la agencia. Los conductores no la tienen: no pueden ver dónde andan los demás."""
    ultima = (
        select(models.Posicion.camion_id, func.max(models.Posicion.id).label("id"))
        .group_by(models.Posicion.camion_id)
        .subquery()
    )
    filas = db.execute(
        select(models.Posicion, models.Camion.placa)
        .join(ultima, models.Posicion.id == ultima.c.id)
        .join(models.Camion, models.Camion.id == models.Posicion.camion_id)
        .order_by(models.Camion.placa)
    ).all()
    return [a_esquema(posicion, placa) for posicion, placa in filas]
