"""API key: endpoint para sistemas externos (por ejemplo, la página web de rastreo de la empresa)."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from app import config, models, schemas
from app.database import DB
from app.limitador import limiter
from app.seguridad import api_key_valida

router = APIRouter(prefix="/api/rastreo", tags=["4. Rastreo (API key)"])


@router.get(
    "/{codigo}",
    response_model=schemas.Rastreo,
    dependencies=[Depends(api_key_valida)],
    summary="Estado de un envío por su código de rastreo",
)
@limiter.limit(config.LIMITE_RASTREO)
def rastrear(request: Request, codigo: str, db: DB):
    """Requiere el encabezado X-API-Key. Solo regresa datos públicos del envío (sin cliente ni camión)."""
    envio = db.scalar(select(models.Envio).where(models.Envio.codigo == codigo.upper()))
    if envio is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe un envío con ese código")
    return envio
