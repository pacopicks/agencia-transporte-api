"""Tablas de la base de datos (SQLAlchemy). Se crean solas al arrancar la API."""
from datetime import date, datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

ASIGNACION_ACTIVA = ("planificada", "en_curso")


class Usuario(Base):
    """Persona que entra al panel. Su rol define sus permisos (scopes)."""

    __tablename__ = "usuarios"
    __table_args__ = (
        CheckConstraint("rol IN ('admin', 'operador', 'consulta', 'conductor')", name="ck_usuarios_rol"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario: Mapped[str] = mapped_column(String(50), unique=True)
    nombre: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(200))
    rol: Mapped[str] = mapped_column(String(20), default="consulta")
    # Solo para el rol "conductor": a qué conductor representa (para ver únicamente SU ruta)
    conductor_id: Mapped[int | None] = mapped_column(ForeignKey("conductores.id", ondelete="SET NULL"))
    activo: Mapped[bool] = mapped_column(default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiKey(Base):
    """Llave para que otras aplicaciones usen la API. Solo se guarda su hash."""

    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    prefijo: Mapped[str] = mapped_column(String(12))  # primeros caracteres, para reconocerla
    hash: Mapped[str] = mapped_column(String(64), unique=True)  # SHA-256 de la llave completa
    scopes: Mapped[list[str]] = mapped_column(JSON)
    activo: Mapped[bool] = mapped_column(default=True)
    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultimo_uso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Ubicacion(Base):
    """Nodo de la red: ciudad, centro de distribución o almacén."""

    __tablename__ = "ubicaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    region: Mapped[str | None] = mapped_column(String(100))
    tipo: Mapped[str] = mapped_column(String(30), default="ciudad")
    latitud: Mapped[float]
    longitud: Mapped[float]


class Tramo(Base):
    """Carretera que une dos ubicaciones (una arista del grafo)."""

    __tablename__ = "tramos"
    __table_args__ = (
        UniqueConstraint("origen_id", "destino_id", name="uq_tramos_origen_destino"),
        CheckConstraint("origen_id <> destino_id", name="ck_tramos_origen_destino"),
        CheckConstraint("distancia_km > 0 AND tiempo_min > 0 AND peaje >= 0", name="ck_tramos_valores"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    origen_id: Mapped[int] = mapped_column(ForeignKey("ubicaciones.id", ondelete="CASCADE"))
    destino_id: Mapped[int] = mapped_column(ForeignKey("ubicaciones.id", ondelete="CASCADE"))
    distancia_km: Mapped[float]
    tiempo_min: Mapped[int]
    peaje: Mapped[float] = mapped_column(default=0)
    bidireccional: Mapped[bool] = mapped_column(default=True)
    activo: Mapped[bool] = mapped_column(default=True)


class Conductor(Base):
    __tablename__ = "conductores"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    licencia: Mapped[str] = mapped_column(String(30), unique=True)
    telefono: Mapped[str | None] = mapped_column(String(20))
    activo: Mapped[bool] = mapped_column(default=True)


class Camion(Base):
    __tablename__ = "camiones"
    __table_args__ = (
        CheckConstraint("capacidad_kg > 0 AND rendimiento_km_l > 0", name="ck_camiones_valores"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    placa: Mapped[str] = mapped_column(String(15), unique=True)
    marca: Mapped[str] = mapped_column(String(50))
    modelo: Mapped[str] = mapped_column(String(50))
    capacidad_kg: Mapped[float]
    rendimiento_km_l: Mapped[float]
    estado: Mapped[str] = mapped_column(String(20), default="disponible")
    ubicacion_id: Mapped[int | None] = mapped_column(ForeignKey("ubicaciones.id", ondelete="SET NULL"))
    conductor_id: Mapped[int | None] = mapped_column(ForeignKey("conductores.id", ondelete="SET NULL"), unique=True)

    ubicacion: Mapped[Ubicacion | None] = relationship()
    conductor: Mapped[Conductor | None] = relationship()


class Envio(Base):
    """Carga que hay que llevar de un origen a un destino."""

    __tablename__ = "envios"
    __table_args__ = (
        CheckConstraint("origen_id <> destino_id", name="ck_envios_origen_destino"),
        CheckConstraint("peso_kg > 0", name="ck_envios_peso"),
        CheckConstraint("prioridad BETWEEN 1 AND 4", name="ck_envios_prioridad"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    cliente: Mapped[str] = mapped_column(String(100))
    descripcion: Mapped[str | None] = mapped_column(String(200))
    origen_id: Mapped[int] = mapped_column(ForeignKey("ubicaciones.id"))
    destino_id: Mapped[int] = mapped_column(ForeignKey("ubicaciones.id"))
    peso_kg: Mapped[float]
    prioridad: Mapped[int] = mapped_column(default=2)  # 1 baja, 2 media, 3 alta, 4 urgente
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    fecha_limite: Mapped[date | None]
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Asignacion(Base):
    """Resultado del modelo: qué camión lleva qué envío y por qué ruta."""

    __tablename__ = "asignaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    envio_id: Mapped[int] = mapped_column(ForeignKey("envios.id"))
    camion_id: Mapped[int] = mapped_column(ForeignKey("camiones.id"))
    conductor_id: Mapped[int | None] = mapped_column(ForeignKey("conductores.id", ondelete="SET NULL"))
    criterio: Mapped[str] = mapped_column(String(20), default="distancia")
    ruta_vacio: Mapped[list[int]] = mapped_column(JSON)  # ubicaciones: camión -> origen del envío
    ruta_carga: Mapped[list[int]] = mapped_column(JSON)  # ubicaciones: origen -> destino
    distancia_vacio_km: Mapped[float]
    distancia_carga_km: Mapped[float]
    distancia_total_km: Mapped[float]
    tiempo_estimado_min: Mapped[int]
    peajes: Mapped[float]
    costo_estimado: Mapped[float]
    estado: Mapped[str] = mapped_column(String(20), default="planificada")
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    envio: Mapped[Envio] = relationship()
    camion: Mapped[Camion] = relationship()
