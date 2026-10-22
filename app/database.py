from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app import config

engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
SesionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def crear_base_si_no_existe() -> None:
    """Crea la base de datos (por ejemplo 'transporte_api') si todavía no existe."""
    url = make_url(config.DATABASE_URL)
    if url.get_backend_name() != "postgresql":
        return
    servidor = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with servidor.connect() as conn:
            existe = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database})
            if not existe:
                conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        servidor.dispose()


def get_db():
    db = SesionLocal()
    try:
        yield db
    finally:
        db.close()


DB = Annotated[Session, Depends(get_db)]
