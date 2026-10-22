"""Formato y validación de los datos que entran y salen de la API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Rol = Literal["admin", "cliente", "conductor"]


class Esquema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Token(Esquema):
    access_token: str
    token_type: str = "bearer"
    rol: Rol


class Usuario(Esquema):
    id: int
    usuario: str
    nombre: str
    rol: Rol
    activo: bool


class UsuarioNuevo(Esquema):
    usuario: str = Field(min_length=3, max_length=50)
    nombre: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=100)
    rol: Rol


class CamionNuevo(Esquema):
    placa: str = Field(min_length=1, max_length=15)
    capacidad_kg: float = Field(gt=0)
    conductor_id: int | None = None


class Camion(CamionNuevo):
    id: int
    disponible: bool


class EnvioNuevo(Esquema):
    # extra="forbid": si alguien manda campos de más (por ejemplo cliente_id para crear el
    # envío a nombre de otro) la API responde 422. El dueño siempre sale del token.
    model_config = ConfigDict(extra="forbid")

    origen: str = Field(min_length=1, max_length=100)
    destino: str = Field(min_length=1, max_length=100)
    peso_kg: float = Field(gt=0)


class Envio(Esquema):
    id: int
    codigo: str
    cliente_id: int
    origen: str
    destino: str
    peso_kg: float
    estado: str
    camion_id: int | None
    creado_en: datetime
    entregado_en: datetime | None


class ResultadoAsignacion(Esquema):
    asignados: list[Envio]
    sin_camion: list[str] = Field(description="Envíos que se quedaron pendientes y por qué")


class Rastreo(Esquema):
    """Lo que ve un sistema externo con API key: sin datos del cliente ni del camión."""

    codigo: str
    estado: str
    origen: str
    destino: str
    creado_en: datetime
    entregado_en: datetime | None


class ApiKeyNueva(Esquema):
    nombre: str = Field(min_length=1, max_length=100, description="Para qué sistema es")


class ApiKey(Esquema):
    id: int
    nombre: str
    prefijo: str
    creada_en: datetime
    ultimo_uso: datetime | None


class ApiKeyCreada(ApiKey):
    clave: str = Field(description="La llave completa. Solo se muestra esta vez.")
