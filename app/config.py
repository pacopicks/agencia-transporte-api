from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parent.parent
CLAVE_DE_EJEMPLO = "cambia-esta-clave-por-un-texto-largo-y-secreto-1234567890"


class Settings(BaseSettings):
    """Configuración leída del archivo .env (o de variables de entorno)."""

    model_config = SettingsConfigDict(env_file=RAIZ / ".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/transporte"
    secret_key: str = CLAVE_DE_EJEMPLO
    token_minutos: int = 480
    admin_usuario: str = "admin"
    admin_password: str = "admin123"
    precio_diesel: float = 25.5
    cargar_demo: bool = True

    # Orígenes (sitios web) que pueden llamar a la API desde el navegador, separados por coma
    cors_origenes: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Rate limit: peticiones permitidas por minuto
    limite_por_minuto: int = 120  # general, por usuario / API key / IP
    limite_login_por_minuto: int = 10  # intentos de inicio de sesión por IP
    limite_modelo_por_minuto: int = 10  # ejecuciones del modelo de asignación

    @property
    def lista_cors(self) -> list[str]:
        return [origen.strip() for origen in self.cors_origenes.split(",") if origen.strip()]


settings = Settings()
