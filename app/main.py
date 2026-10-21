"""API de la agencia de transporte + panel web de administración.

Arrancar:  uvicorn app.main:app --reload
Panel web: http://localhost:8000      Documentación: http://localhost:8000/docs
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import OperationalError

from app import models  # noqa: F401  (registra las tablas en Base.metadata)
from app.config import CLAVE_DE_EJEMPLO, settings
from app.database import Base, SessionLocal, crear_base_si_no_existe, engine
from app.datos_demo import inicializar
from app.limites import limite_general
from app.routers import api_keys, asignaciones, auth, catalogos, panel, rutas, usuarios

CARPETA_WEB = Path(__file__).resolve().parent.parent / "frontend" / "dist"
log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.secret_key == CLAVE_DE_EJEMPLO:
        log.warning("SECRET_KEY sigue con el valor de ejemplo: cámbiala en .env antes de publicar la API")
    try:
        crear_base_si_no_existe()
        Base.metadata.create_all(engine)
    except (OperationalError, UnicodeDecodeError) as error:
        raise RuntimeError(
            "No se pudo conectar a PostgreSQL. Revisa que el servicio esté encendido y que "
            "DATABASE_URL en el archivo .env tenga bien el usuario, la contraseña y el puerto."
        ) from error
    with SessionLocal() as db:
        inicializar(db)
    yield


app = FastAPI(
    title="API · Agencia de transporte",
    description=(
        "Gestión de camiones, conductores, envíos y carreteras. Incluye un modelo que asigna "
        "automáticamente cada envío al camión más conveniente y calcula la ruta óptima.\n\n"
        "**Autenticación:** usa el botón **Authorize** con tu usuario (JWT con scopes) "
        "o con una API key (encabezado `X-API-Key`).\n\n"
        "**Rate limit:** cada respuesta trae `X-RateLimit-Limit` y `X-RateLimit-Remaining`; "
        "al pasarte del límite recibes `429` con `Retry-After`."
    ),
    version="1.0.0",
    lifespan=lifespan,
    dependencies=[Depends(limite_general)],  # rate limit para todos los endpoints de la API
)


@app.middleware("http")
async def encabezados_de_seguridad(request: Request, call_next):
    respuesta = await call_next(request)
    respuesta.headers.setdefault("X-Content-Type-Options", "nosniff")
    respuesta.headers.setdefault("X-Frame-Options", "DENY")
    respuesta.headers.setdefault("Referrer-Policy", "no-referrer")
    return respuesta


# CORS: solo los orígenes de CORS_ORIGENES (.env) pueden llamar a la API desde un navegador.
# El panel se sirve desde la misma API, así que no necesita estar en la lista.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.lista_cors,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    expose_headers=["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    max_age=600,
)

for router in (
    auth.router, panel.router, asignaciones.router, rutas.router,
    *catalogos.routers, usuarios.router, api_keys.router,
):
    app.include_router(router)


@app.get("/api/salud", tags=["Sistema"], summary="Verificar que la API responde")
def salud():
    return {"estado": "ok"}


# El panel web (React, ya compilado con "npm run build") lo sirve la misma API
if CARPETA_WEB.exists():
    app.mount("/", StaticFiles(directory=CARPETA_WEB, html=True), name="web")
else:
    log.warning("No existe frontend/dist: compila el panel con 'npm run build' dentro de la carpeta frontend")
