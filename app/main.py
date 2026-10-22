"""API de la Agencia de Transporte.

Arrancar:       uvicorn app.main:app --host 0.0.0.0 --port 8000
Documentación:  http://<ip-del-servidor>:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import OperationalError

from app import config
from app.database import Base, SesionLocal, crear_base_si_no_existe, engine
from app.datos_demo import inicializar
from app.limitador import limiter
from app.routers import admin, auth, envios, rastreo


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        crear_base_si_no_existe()
        Base.metadata.create_all(engine)
    except (OperationalError, UnicodeDecodeError) as error:
        raise RuntimeError(
            "No se pudo conectar a PostgreSQL: revisa que esté encendido y que DATABASE_URL en .env "
            "tenga bien el usuario, la contraseña y el nombre de la base."
        ) from error
    with SesionLocal() as db:
        inicializar(db)
    yield


app = FastAPI(
    title="API · Agencia de Transporte",
    version="2.0.0",
    description=(
        "API sencilla de una agencia de transporte con:\n\n"
        "- **JWT**: inicia sesión en `POST /api/auth/login` y usa el botón **Authorize**.\n"
        "- **Roles**: admin, cliente y conductor.\n"
        "- **BOLA/IDOR**: cada quien solo ve y modifica SUS envíos.\n"
        "- **API key**: el rastreo (`/api/rastreo/{codigo}`) pide el encabezado `X-API-Key`.\n"
        "- **Rate limit**: 60 peticiones por minuto por IP, 5 intentos de login por minuto."
    ),
    lifespan=lifespan,
)

# Rate limiter (slowapi): límite general para todos los endpoints + límites propios en algunos
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def limite_excedido(request: Request, error: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Demasiadas peticiones (límite: {error.detail}). Espera un momento."},
        headers={"Retry-After": "60"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGENES,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)

for router in (auth.router, admin.router, envios.router, rastreo.router):
    app.include_router(router)


@app.get("/", tags=["Sistema"], summary="Información de la API")
def inicio():
    return {"api": "Agencia de Transporte", "documentacion": "/docs", "estado": "ok"}
