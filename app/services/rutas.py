"""Rutas óptimas sobre la red de carreteras con el algoritmo de Dijkstra.

La red es un grafo: cada ubicación es un nodo y cada tramo activo una arista
con distancia, tiempo y costo de casetas. Dijkstra encuentra el camino de menor
distancia o de menor tiempo, según el criterio.
"""
import heapq
from collections import defaultdict
from dataclasses import dataclass, field
from math import inf

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Tramo


@dataclass(frozen=True)
class Arista:
    destino: int
    distancia_km: float
    tiempo_min: int
    peaje: float


@dataclass
class Recorrido:
    """Camino encontrado: ubicaciones visitadas y tramos usados (desde, arista)."""

    nodos: list[int]
    tramos: list[tuple[int, Arista]] = field(default_factory=list)

    @property
    def distancia_km(self) -> float:
        return sum(a.distancia_km for _, a in self.tramos)

    @property
    def tiempo_min(self) -> int:
        return sum(a.tiempo_min for _, a in self.tramos)

    @property
    def peaje(self) -> float:
        return sum(a.peaje for _, a in self.tramos)


class Grafo:
    def __init__(self, tramos: list[Tramo]):
        self.vecinos: dict[int, list[Arista]] = defaultdict(list)
        for t in tramos:
            self.vecinos[t.origen_id].append(Arista(t.destino_id, t.distancia_km, t.tiempo_min, t.peaje))
            if t.bidireccional:
                self.vecinos[t.destino_id].append(Arista(t.origen_id, t.distancia_km, t.tiempo_min, t.peaje))
        self._arboles: dict[tuple[int, str], dict] = {}  # caché: un Dijkstra por origen y criterio

    @classmethod
    def desde_bd(cls, db: Session) -> "Grafo":
        """Arma el grafo solo con los tramos activos: las carreteras cerradas no existen para el modelo."""
        return cls(db.scalars(select(Tramo).where(Tramo.activo)).all())

    def _dijkstra(self, origen: int, criterio: str) -> dict[int, tuple[int, Arista]]:
        """Regresa, para cada nodo alcanzable, desde qué nodo y por qué arista se llega mejor."""
        clave = (origen, criterio)
        if clave not in self._arboles:
            costo = {origen: 0.0}
            previo: dict[int, tuple[int, Arista]] = {}
            cola = [(0.0, origen)]
            while cola:
                acumulado, nodo = heapq.heappop(cola)
                if acumulado > costo[nodo]:
                    continue  # entrada vieja: ya se encontró un camino mejor a este nodo
                for arista in self.vecinos[nodo]:
                    peso = arista.distancia_km if criterio == "distancia" else arista.tiempo_min
                    nuevo = acumulado + peso
                    if nuevo < costo.get(arista.destino, inf):
                        costo[arista.destino] = nuevo
                        previo[arista.destino] = (nodo, arista)
                        heapq.heappush(cola, (nuevo, arista.destino))
            self._arboles[clave] = previo
        return self._arboles[clave]

    def ruta_optima(self, origen: int, destino: int, criterio: str = "distancia") -> Recorrido | None:
        """Camino más corto (o más rápido) de origen a destino; None si no hay forma de llegar."""
        if origen == destino:
            return Recorrido(nodos=[origen])
        previo = self._dijkstra(origen, criterio)
        if destino not in previo:
            return None
        tramos = []
        nodo = destino
        while nodo != origen:
            anterior, arista = previo[nodo]
            tramos.append((anterior, arista))
            nodo = anterior
        tramos.reverse()
        return Recorrido(nodos=[origen] + [a.destino for _, a in tramos], tramos=tramos)
