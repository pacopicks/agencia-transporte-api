# Seguridad de la API

Este documento explica cómo se protege la API y presenta el **análisis BOLA/IDOR**. Las referencias de código apuntan a los archivos donde está cada control.

## 1. Autenticación

Hay dos formas de identificarse ([app/seguridad.py](app/seguridad.py)):

| Quién | Cómo | Detalle |
|---|---|---|
| Personas (panel web) | `POST /api/auth/token` con usuario y contraseña → **JWT** → `Authorization: Bearer <token>` | Firmado con HS256 y `SECRET_KEY`. Lleva `sub`, `rol`, `scope`, `iat` y `exp` (8 h por defecto). |
| Aplicaciones | Encabezado **`X-API-Key: atk_...`** | Las crea un admin en el panel o en `POST /api/api-keys`. |

Medidas:

- **Contraseñas** con PBKDF2-SHA256, 200,000 iteraciones y sal aleatoria. Se comparan con `hmac.compare_digest` para no filtrar información por el tiempo de respuesta.
- **Login sin enumeración de usuarios.** Si el usuario no existe se calcula igual un hash de relleno y se responde el mismo mensaje *"Usuario o contraseña incorrectos"*, así no se puede saber qué usuarios existen.
- **API keys** de 43 caracteres aleatorios (`secrets.token_urlsafe(32)`). Solo se guarda su **hash SHA-256**, de modo que quien robe la base no obtiene llaves usables. La llave completa se muestra una sola vez y se puede **revocar** (`activo=false`) en cualquier momento.
- El **rol se vuelve a leer de la base en cada petición**. Si a alguien le quitan permisos o lo desactivan, su token deja de servir de inmediato, aunque no haya expirado.
- La API avisa al arrancar si `SECRET_KEY` sigue con el valor de ejemplo.

## 2. Autorización con scopes

Cada endpoint declara los scopes que exige, por ejemplo `dependencies=[requiere("catalogos:escribir")]`. Si faltan, la respuesta es `403` e indica qué scope falta.

| Scope | Permite |
|---|---|
| `catalogos:leer` | Consultar ubicaciones, tramos, camiones, conductores y envíos |
| `catalogos:escribir` | Crear, editar y eliminar en esos catálogos |
| `asignaciones:leer` | Consultar asignaciones y el tablero |
| `asignaciones:escribir` | Ejecutar el modelo, asignar a mano, iniciar, completar y cancelar |
| `rutas:leer` | Calcular rutas óptimas y ver la ruta de un camión |
| `usuarios:admin` | Administrar usuarios y API keys |
| `conductor:viaje` | App móvil: ver, iniciar y entregar **sus** viajes y reportar **su** ubicación |

| Rol | Scopes |
|---|---|
| admin | todos menos `conductor:viaje` (el admin no maneja un camión) |
| operador | catálogos, asignaciones y rutas (sin `usuarios:admin`) |
| consulta | `catalogos:leer`, `asignaciones:leer`, `rutas:leer` |
| conductor | `rutas:leer` y `conductor:viaje`, limitados a su propio camión y sus viajes (ver BOLA) |

- Un token puede pedir **menos** scopes que los de su rol (campo `scope` del login, o las casillas de *Authorize* en `/docs`). Así se aplica el **mínimo privilegio**: por ejemplo, un token solo de lectura para un reporte.
- Pedir scopes que el rol no tiene responde `403`.
- Una **API key nunca puede tener `usuarios:admin` ni `conductor:viaje`**: una llave no puede crear usuarios ni otras llaves, ni hacerse pasar por un conductor.

## 3. Rate limit

Está en [app/limites.py](app/limites.py) y usa una ventana deslizante de 60 s en memoria.

| Límite | Valor por defecto | Se cuenta por | Para qué |
|---|---|---|---|
| General | 120/min | API key, usuario (JWT) o IP | Evitar abuso y scraping |
| Login | 10/min | IP | Frenar ataques de fuerza bruta a contraseñas |
| Modelo | 10/min | API key, usuario o IP | La optimización es costosa en CPU |

Cada respuesta trae `X-RateLimit-Limit` y `X-RateLimit-Remaining`. Al pasarse se responde `429` con `Retry-After`. Los valores se cambian en `.env`. Con varios servidores se usaría Redis en lugar de memoria.

## 4. CORS

Está en [app/main.py](app/main.py). Solo los orígenes de `CORS_ORIGENES` pueden llamar a la API desde un navegador; por defecto es `http://localhost:5173`, el servidor de desarrollo del panel. El panel normal se sirve desde la misma API (mismo origen) y no necesita CORS.

Se permiten solo los métodos `GET`, `POST`, `PUT` y `DELETE`, y los encabezados `Authorization`, `Content-Type` y `X-API-Key`. No se usan cookies, así que no hace falta `allow_credentials`. Un sitio no autorizado recibe el preflight sin `Access-Control-Allow-Origin`, y el navegador bloquea la respuesta.

Además, todas las respuestas llevan `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: no-referrer`.

## 5. BOLA / IDOR

El análisis completo está en **[ANALISIS-BOLA-IDOR.md](ANALISIS-BOLA-IDOR.md)**: actores, modelo de propiedad, inventario de endpoints, hallazgos, evidencia y riesgos residuales. En resumen:

- Lo que le pertenece a un conductor (su camión, su viaje actual, su ubicación) se identifica **por su sesión**, no por un id que él mande.
- Donde sí llega un id en la URL (`/api/conductor/viajes/{id}`, `/api/rutas/camion/{id}`), la API verifica la propiedad y responde **404**, el mismo error que si el objeto no existiera, para que no se puedan enumerar ids.
- Los listados filtran por dueño **dentro de la consulta SQL**.
- Los esquemas de entrada rechazan campos de más (`extra="forbid"` en la ubicación GPS), así que no se puede mandar el `camion_id` de otro.
- [`pruebas/bola_idor.py`](pruebas/bola_idor.py) ejecuta **20 ataques** de un conductor contra otro; todos deben fallar. Úsalo para comprobarlo después de cualquier cambio:

```powershell
.venv\Scripts\python pruebas\bola_idor.py
```
## 6. Pendientes para producción

- Servir la API con **HTTPS** detrás de un proxy (Nginx o Caddy): sin HTTPS los tokens viajan en texto plano.
- Pasar el rate limit a **Redis** si se usan varios procesos o servidores.
- Agregar **refresh tokens** y una lista de revocación de JWT si se necesitan sesiones largas.
- Registrar en una bitácora los intentos de acceso denegados (401, 403 y 404 por BOLA) para detectar ataques.
