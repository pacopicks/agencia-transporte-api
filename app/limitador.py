"""Rate limiter con slowapi: cuenta las peticiones por dirección IP.

- Límite general para todos los endpoints (LIMITE_GENERAL, por defecto 60 por minuto).
- Límites más estrictos en endpoints sensibles con @limiter.limit(...):
  el login (contra ataques de fuerza bruta) y el rastreo con API key.
Al pasarse, la API responde 429 Too Many Requests.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app import config

limiter = Limiter(key_func=get_remote_address, default_limits=[config.LIMITE_GENERAL])
