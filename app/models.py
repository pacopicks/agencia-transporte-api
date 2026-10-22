"""Tablas de la base de datos. Se crean solas al arrancar la API."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = (CheckConstraint("rol IN ('admin', 'cliente', 'conductor')", name="ck_usuarios_rol"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario: Mapped[str] = mapped_column(String(50), unique=True)
    nombre: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(200))
    rol: Mapped[str] = mapped_column(String(20))
    activo: Mapped[bool] = mapped_column(default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Camion(Base):
    __tablename__ = "camiones"

    id: Mapped[int] = mapped_column(primary_key=True)
    placa: Mapped[str] = mapped_column(String(15), unique=True)
    capacidad_kg: Mapped[float]
    conductor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), unique=True)
    disponible: Mapped[bool] = mapped_column(default=True)


class Envio(Base):
    __tablename__ = "envios"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(12), unique=True)  # código de rastreo aleatorio
    cliente_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))  # dueño del envío
    origen: Mapped[str] = mapped_column(String(100))
    destino: Mapped[str] = mapped_column(String(100))
    peso_kg: Mapped[float]
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente, asignado, entregado, cancelado
    camion_id: Mapped[int | None] = mapped_column(ForeignKey("camiones.id", ondelete="SET NULL"))
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    entregado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    camion: Mapped[Camion | None] = relationship()


class ApiKey(Base):
    """Llave para sistemas externos. Solo se guarda su hash, nunca la llave."""

    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    prefijo: Mapped[str] = mapped_column(String(12))
    hash: Mapped[str] = mapped_column(String(64), unique=True)
    creada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultimo_uso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
