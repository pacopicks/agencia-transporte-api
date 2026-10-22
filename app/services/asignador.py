"""Modelo de asignación automática de envíos a camiones.

Cómo decide:
1. Revisa cada par (envío pendiente, camión disponible) y descarta los que no
   se pueden: el camión no aguanta el peso, no tiene ubicación o no hay camino.
2. Con Dijkstra calcula la ruta óptima en dos partes:
   ubicación del camión -> origen del envío (viaje en vacío) y
   origen -> destino (viaje con carga).
3. Estima el costo del viaje: litros de diésel x precio + casetas.
4. Resuelve el "problema de asignación" con el método húngaro
   (scipy.optimize.linear_sum_assignment): cada camión lleva como máximo un
   envío y el costo total es el mínimo posible. Si no alcanzan los camiones,
   dejar pendiente un envío tiene una penalización que crece con su prioridad,
   así que primero se cubren los urgentes y después se ahorra dinero.
"""
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
from fastapi import HTTPException, status
from scipy.optimize import linear_sum_assignment
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Asignacion, Camion, Conductor, Envio
from app.services.rutas import Grafo, Recorrido

# Qué tan grave es dejar sin camión un envío de cada prioridad (1 baja ... 4 urgente)
PESO_PRIORIDAD = {1: 1, 2: 2, 3: 4, 4: 8}


@dataclass
class Plan:
    """Propuesta de que un camión lleve un envío, con sus rutas y su costo."""

    envio: Envio
    camion: Camion
    vacio: Recorrido
    carga: Recorrido
    costo: float


def prioridad_efectiva(envio: Envio) -> int:
    """Si la fecha límite es hoy o mañana, el envío se trata como urgente."""
    if envio.fecha_limite and envio.fecha_limite <= date.today() + timedelta(days=1):
        return 4
    return envio.prioridad


def planear(grafo: Grafo, envio: Envio, camion: Camion, criterio: str) -> Plan | str:
    """Calcula ruta y costo de que `camion` lleve `envio`. Si no se puede, regresa el motivo."""
    if camion.capacidad_kg < envio.peso_kg:
        return f"El camión {camion.placa} carga {camion.capacidad_kg:,.0f} kg y el envío pesa {envio.peso_kg:,.0f} kg"
    if camion.ubicacion_id is None:
        return f"El camión {camion.placa} no tiene ubicación registrada"
    carga = grafo.ruta_optima(envio.origen_id, envio.destino_id, criterio)
    if carga is None:
        return "No hay ruta (con tramos abiertos) entre el origen y el destino del envío"
    vacio = grafo.ruta_optima(camion.ubicacion_id, envio.origen_id, criterio)
    if vacio is None:
        return f"El camión {camion.placa} no tiene ruta para llegar al origen del envío"
    litros = (vacio.distancia_km + carga.distancia_km) / camion.rendimiento_km_l
    costo = litros * settings.precio_diesel + vacio.peaje + carga.peaje
    return Plan(envio, camion, vacio, carga, round(costo, 2))


def camiones_disponibles(db: Session) -> list[Camion]:
    """Camiones libres que tienen un conductor activo asignado."""
    consulta = (
        select(Camion)
        .join(Conductor, Camion.conductor_id == Conductor.id)
        .where(Camion.estado == "disponible", Conductor.activo)
        .order_by(Camion.id)
    )
    return list(db.scalars(consulta).all())


def _aplicar(asignacion: Asignacion, plan: Plan, criterio: str) -> None:
    asignacion.criterio = criterio
    asignacion.ruta_vacio = plan.vacio.nodos
    asignacion.ruta_carga = plan.carga.nodos
    asignacion.distancia_vacio_km = round(plan.vacio.distancia_km, 1)
    asignacion.distancia_carga_km = round(plan.carga.distancia_km, 1)
    asignacion.distancia_total_km = round(plan.vacio.distancia_km + plan.carga.distancia_km, 1)
    asignacion.tiempo_estimado_min = plan.vacio.tiempo_min + plan.carga.tiempo_min
    asignacion.peajes = round(plan.vacio.peaje + plan.carga.peaje, 2)
    asignacion.costo_estimado = plan.costo


def _registrar(db: Session, plan: Plan, criterio: str) -> Asignacion:
    asignacion = Asignacion(envio_id=plan.envio.id, camion_id=plan.camion.id, conductor_id=plan.camion.conductor_id)
    _aplicar(asignacion, plan, criterio)
    plan.envio.estado = "asignado"
    plan.camion.estado = "asignado"
    db.add(asignacion)
    return asignacion


def _motivo_sin_camion(envio: Envio, camiones: list[Camion], primer_motivo: str | None) -> str:
    if not camiones:
        return "No hay camiones disponibles con conductor activo"
    capacidad_maxima = max(c.capacidad_kg for c in camiones)
    if envio.peso_kg > capacidad_maxima:
        return (
            f"Ningún camión disponible aguanta {envio.peso_kg:,.0f} kg "
            f"(el más grande carga {capacidad_maxima:,.0f} kg)"
        )
    return primer_motivo or "Ningún camión disponible puede hacer el viaje"


def asignar_automaticamente(db: Session, criterio: str) -> tuple[list[Asignacion], list[dict]]:
    envios = list(
        db.scalars(select(Envio).where(Envio.estado == "pendiente").order_by(Envio.prioridad.desc(), Envio.id)).all()
    )
    camiones = camiones_disponibles(db)
    grafo = Grafo.desde_bd(db)
    n, m = len(envios), len(camiones)

    planes: dict[tuple[int, int], Plan] = {}
    motivos: dict[int, str] = {}
    for j, envio in enumerate(envios):
        for i, camion in enumerate(camiones):
            resultado = planear(grafo, envio, camion, criterio)
            if isinstance(resultado, Plan):
                planes[j, i] = resultado
            else:
                motivos.setdefault(j, resultado)

    elegidos: list[Plan] = []
    if planes:
        # Matriz de costos: filas = envíos; columnas = camiones + una columna ficticia
        # por envío que significa "dejarlo pendiente".
        mayor_costo = max(p.costo for p in planes.values())
        unidad = mayor_costo * min(n, m) + 1  # más que cualquier suma de viajes reales
        penalizacion = [unidad * PESO_PRIORIDAD[prioridad_efectiva(e)] for e in envios]
        prohibido = sum(penalizacion) + 1  # combinación imposible
        matriz = np.full((n, m + n), prohibido, dtype=float)
        for (j, i), plan in planes.items():
            matriz[j, i] = plan.costo
        for j in range(n):
            matriz[j, m + j] = penalizacion[j]
        filas, columnas = linear_sum_assignment(matriz)
        elegidos = [planes[j, i] for j, i in zip(filas, columnas) if i < m and (j, i) in planes]

    asignaciones = [_registrar(db, plan, criterio) for plan in elegidos]
    db.commit()
    for asignacion in asignaciones:
        db.refresh(asignacion)

    asignados = {plan.envio.id for plan in elegidos}
    no_asignados = []
    for j, envio in enumerate(envios):
        if envio.id in asignados:
            continue
        if any((j, i) in planes for i in range(m)):
            motivo = "Los camiones disponibles se usaron en envíos de mayor prioridad o más baratos de cubrir"
        else:
            motivo = _motivo_sin_camion(envio, camiones, motivos.get(j))
        no_asignados.append({"envio_id": envio.id, "codigo": envio.codigo, "motivo": motivo})
    return asignaciones, no_asignados


def asignar_manual(db: Session, envio: Envio, camion: Camion, criterio: str) -> Asignacion:
    """El administrador elige el camión; el sistema calcula la ruta óptima."""
    if envio.estado != "pendiente":
        raise HTTPException(status.HTTP_409_CONFLICT, f"El envío {envio.codigo} no está pendiente ({envio.estado})")
    if camion.estado != "disponible":
        raise HTTPException(status.HTTP_409_CONFLICT, f"El camión {camion.placa} no está disponible ({camion.estado})")
    if camion.conductor is None or not camion.conductor.activo:
        raise HTTPException(status.HTTP_409_CONFLICT, f"El camión {camion.placa} no tiene un conductor activo")
    plan = planear(Grafo.desde_bd(db), envio, camion, criterio)
    if isinstance(plan, str):
        raise HTTPException(status.HTTP_409_CONFLICT, plan)
    asignacion = _registrar(db, plan, criterio)
    db.commit()
    db.refresh(asignacion)
    return asignacion


def recalcular(db: Session, asignacion: Asignacion) -> Asignacion:
    """Vuelve a calcular la ruta (por ejemplo, si se cerró una carretera)."""
    if asignacion.estado != "planificada":
        raise HTTPException(status.HTTP_409_CONFLICT, "Solo se pueden recalcular asignaciones planificadas")
    plan = planear(Grafo.desde_bd(db), asignacion.envio, asignacion.camion, asignacion.criterio)
    if isinstance(plan, str):
        raise HTTPException(status.HTTP_409_CONFLICT, plan)
    _aplicar(asignacion, plan, asignacion.criterio)
    db.commit()
    db.refresh(asignacion)
    return asignacion
