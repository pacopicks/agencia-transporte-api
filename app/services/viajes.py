"""Ciclo de vida de una asignación: planificada -> en_curso -> completada (o cancelada).

Lo usan tanto el panel de administración (routers/asignaciones.py) como la app móvil
del conductor (routers/conductor.py), así las reglas son las mismas en los dos lados.
"""
from fastapi import HTTPException, status

from app.models import ASIGNACION_ACTIVA, Asignacion


def _exigir_estado(asignacion: Asignacion, *permitidos: str) -> None:
    if asignacion.estado not in permitidos:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"La asignación está '{asignacion.estado}'; esta acción solo aplica si está {' o '.join(permitidos)}",
        )


def iniciar(asignacion: Asignacion) -> None:
    """El camión sale a ruta."""
    _exigir_estado(asignacion, "planificada")
    asignacion.estado = "en_curso"
    asignacion.envio.estado = "en_transito"
    asignacion.camion.estado = "en_ruta"


def completar(asignacion: Asignacion) -> None:
    """El envío se entregó: el camión queda libre en la ciudad de destino."""
    _exigir_estado(asignacion, "en_curso")
    asignacion.estado = "completada"
    asignacion.envio.estado = "entregado"
    asignacion.camion.estado = "disponible"
    asignacion.camion.ubicacion_id = asignacion.envio.destino_id


def cancelar(asignacion: Asignacion) -> None:
    """El envío regresa a pendientes y el camión queda libre."""
    _exigir_estado(asignacion, *ASIGNACION_ACTIVA)
    asignacion.estado = "cancelada"
    asignacion.envio.estado = "pendiente"
    asignacion.camion.estado = "disponible"
