"""Configuración de la API. Se lee del archivo .env (copia .env.example como .env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/transporte_api")
SECRET_KEY = os.getenv("SECRET_KEY", "cambia-esta-clave-por-una-larga-y-secreta")
TOKEN_MINUTOS = int(os.getenv("TOKEN_MINUTOS", "60"))

ADMIN_USUARIO = os.getenv("ADMIN_USUARIO", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
CARGAR_DEMO = os.getenv("CARGAR_DEMO", "true").lower() == "true"

# Rate limit (formato: "cantidad/minute", "cantidad/hour", ...)
LIMITE_GENERAL = os.getenv("LIMITE_GENERAL", "60/minute")
LIMITE_LOGIN = os.getenv("LIMITE_LOGIN", "5/minute")
LIMITE_RASTREO = os.getenv("LIMITE_RASTREO", "20/minute")

CORS_ORIGENES = [o.strip() for o in os.getenv("CORS_ORIGENES", "*").split(",") if o.strip()]
