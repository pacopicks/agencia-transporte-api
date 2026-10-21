from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def crear_base_si_no_existe() -> None:
    """Crea la base de datos en PostgreSQL (p. ej. 'transporte') si todavía no existe."""
    url = make_url(settings.database_url)
    if url.get_backend_name() != "postgresql":
        return
    servidor = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with servidor.connect() as conn:
            existe = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :nombre"), {"nombre": url.database})
            if not existe:
                conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        servidor.dispose()


def get_db():
    """Abre una sesión por petición y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DB = Annotated[Session, Depends(get_db)]
