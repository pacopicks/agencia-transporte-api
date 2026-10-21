"""Esquemas Pydantic: definen y validan el JSON que entra y sale de la API."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TipoUbicacion = Literal["ciudad", "centro_distribucion", "almacen"]
EstadoCamion = Literal["disponible", "asignado", "en_ruta", "mantenimiento"]
EstadoEnvio = Literal["pendiente", "asignado", "en_transito", "entregado", "cancelado"]
EstadoAsignacion = Literal["planificada", "en_curso", "completada", "cancelada"]
Criterio = Literal["distancia", "tiempo"]


class Esquema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ConOrigenDestino(Esquema):
    origen_id: int
    destino_id: int

    @model_validator(mode="after")
    def origen_distinto_de_destino(self):
        if self.origen_id == self.destino_id:
            raise ValueError("El origen y el destino deben ser distintos")
        return self


# ---------- Autenticación, usuarios y API keys ----------
Rol = Literal["admin", "operador", "consulta", "conductor"]
# Scopes que se le pueden dar a una API key (administrar usuarios/llaves queda solo para personas)
ScopeApiKey = Literal["catalogos:leer", "catalogos:escribir", "asignaciones:leer", "asignaciones:escribir", "rutas:leer"]


class Token(Esquema):
    access_token: str
    token_type: str = "bearer"
    nombre: str
    rol: Rol
    scopes: list[str]


class Yo(Esquema):
    """Quién está haciendo la petición (usuario con JWT o aplicación con API key)."""

    tipo: Literal["usuario", "api_key"]
    nombre: str
    usuario: str | None = None
    rol: Rol | None = None
    conductor_id: int | None = None
    scopes: list[str]


class CambioPassword(Esquema):
    actual: str
    nueva: str = Field(min_length=6, max_length=100)


class Usuario(Esquema):
    id: int
    usuario: str
    nombre: str
    rol: Rol
    conductor_id: int | None
    activo: bool
    creado_en: datetime


class UsuarioCrear(Esquema):
    usuario: str = Field(min_length=3, max_length=50)
    nombre: str = Field(min_length=1, max_length=100)
    rol: Rol = "consulta"
    conductor_id: int | None = Field(default=None, description="Obligatorio si el rol es conductor")
    activo: bool = True
    password: str = Field(min_length=6, max_length=100)

    @model_validator(mode="after")
    def conductor_requiere_vinculo(self):
        if self.rol == "conductor" and self.conductor_id is None:
            raise ValueError("Un usuario con rol conductor debe estar vinculado a un conductor")
        return self


class UsuarioActualizar(UsuarioCrear):
    password: str | None = Field(default=None, min_length=6, max_length=100, description="null = conservar la actual")


class ApiKey(Esquema):
    id: int
    nombre: str
    prefijo: str
    scopes: list[str]
    activo: bool
    creado_en: datetime
    ultimo_uso: datetime | None


class ApiKeyCrear(Esquema):
    nombre: str = Field(min_length=1, max_length=100, description="Para qué aplicación es")
    scopes: list[ScopeApiKey] = Field(min_length=1)


class ApiKeyActualizar(ApiKeyCrear):
    activo: bool = True


class ApiKeyCreada(ApiKey):
    clave: str = Field(description="La llave completa. Solo se muestra esta vez: guárdala.")


# ---------- Ubicaciones ----------
class UbicacionEntrada(Esquema):
    nombre: str = Field(min_length=1, max_length=100)
    region: str | None = Field(default=None, max_length=100, description="Estado de la república")
    tipo: TipoUbicacion = "ciudad"
    latitud: float = Field(ge=-90, le=90)
    longitud: float = Field(ge=-180, le=180)


class Ubicacion(UbicacionEntrada):
    id: int


# ---------- Tramos (carreteras) ----------
class TramoEntrada(ConOrigenDestino):
    distancia_km: float = Field(gt=0)
    tiempo_min: int = Field(gt=0, description="Tiempo de manejo en minutos")
    peaje: float = Field(default=0, ge=0, description="Costo de casetas en MXN")
    bidireccional: bool = True
    activo: bool = Field(default=True, description="false = carretera cerrada; el modelo la evita")


class Tramo(TramoEntrada):
    id: int


# ---------- Conductores ----------
class ConductorEntrada(Esquema):
    nombre: str = Field(min_length=1, max_length=100)
    licencia: str = Field(min_length=1, max_length=30)
    telefono: str | None = Field(default=None, max_length=20)
    activo: bool = True


class Conductor(ConductorEntrada):
    id: int


# ---------- Camiones ----------
class CamionEntrada(Esquema):
    placa: str = Field(min_length=1, max_length=15)
    marca: str = Field(min_length=1, max_length=50)
    modelo: str = Field(min_length=1, max_length=50)
    capacidad_kg: float = Field(gt=0)
    rendimiento_km_l: float = Field(gt=0, description="Kilómetros que recorre por litro de diésel")
    estado: EstadoCamion = "disponible"
    ubicacion_id: int | None = Field(default=None, description="Dónde está el camión ahora")
    conductor_id: int | None = None


class Camion(CamionEntrada):
    id: int


# ---------- Envíos ----------
class EnvioEntrada(ConOrigenDestino):
    codigo: str = Field(min_length=1, max_length=20)
    cliente: str = Field(min_length=1, max_length=100)
    descripcion: str | None = Field(default=None, max_length=200)
    peso_kg: float = Field(gt=0)
    prioridad: int = Field(default=2, ge=1, le=4, description="1 baja, 2 media, 3 alta, 4 urgente")
    estado: EstadoEnvio = "pendiente"
    fecha_limite: date | None = None


class Envio(EnvioEntrada):
    id: int
    creado_en: datetime


# ---------- Asignaciones (resultado del modelo) ----------
class Asignacion(Esquema):
    id: int
    envio_id: int
    camion_id: int
    conductor_id: int | None
    criterio: Criterio
    ruta_vacio: list[int] = Field(description="Ubicaciones desde donde está el camión hasta el origen del envío")
    ruta_carga: list[int] = Field(description="Ubicaciones desde el origen hasta el destino del envío")
    distancia_vacio_km: float
    distancia_carga_km: float
    distancia_total_km: float
    tiempo_estimado_min: int
    peajes: float
    costo_estimado: float
    estado: EstadoAsignacion
    creado_en: datetime
    actualizado_en: datetime | None = None


class AsignacionManual(Esquema):
    envio_id: int
    camion_id: int
    criterio: Criterio = "distancia"


class EnvioNoAsignado(Esquema):
    envio_id: int
    codigo: str
    motivo: str


class ResultadoModelo(Esquema):
    mensaje: str
    costo_total: float
    asignaciones: list[Asignacion]
    no_asignados: list[EnvioNoAsignado]


# ---------- Rutas ----------
class Paso(Esquema):
    desde_id: int
    desde: str
    hasta_id: int
    hasta: str
    distancia_km: float
    tiempo_min: int
    peaje: float
    abierto: bool
    etapa: Literal["vacio", "carga"] | None = None


class RutaOptima(Esquema):
    criterio: Criterio
    nodos: list[int]
    distancia_km: float
    tiempo_min: int
    peaje: float
    pasos: list[Paso]


class RutaCamion(Esquema):
    camion_id: int
    placa: str
    conductor: str | None
    asignacion_id: int
    envio: str
    estado: EstadoAsignacion
    distancia_total_km: float
    tiempo_estimado_min: int
    costo_estimado: float
    ruta_vacio: list[int]
    ruta_carga: list[int]
    ubicaciones: list[Ubicacion] = Field(description="Ubicaciones de la ruta, con coordenadas para dibujarla")
    pasos: list[Paso]


# ---------- Panel ----------
class Panel(Esquema):
    envios: dict[str, int]
    camiones: dict[str, int]
    ubicaciones: int
    tramos: int
    conductores: int
    km_planificados: float
    costo_planificado: float
