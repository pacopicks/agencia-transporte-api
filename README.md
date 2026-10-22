# API · Agencia de Transporte

API REST sencilla de una agencia de transporte de carga: los **clientes** solicitan envíos, el **admin** asigna camiones automáticamente y los **conductores** entregan. Está hecha con **FastAPI + PostgreSQL** y tiene las configuraciones de seguridad que pide la tarea.

> La versión completa del proyecto (rutas óptimas con Dijkstra, panel web en React y app móvil) quedó guardada en la rama [`version-completa`](https://github.com/pacopicks/agencia-transporte-api/tree/version-completa).

## Requisitos de la tarea

| Requisito | Dónde está | Cómo se ve |
|---|---|---|
| **JWT** | [`app/seguridad.py`](app/seguridad.py), [`app/routers/auth.py`](app/routers/auth.py) | `POST /api/auth/login` regresa un token que se manda como `Authorization: Bearer <token>`. Sin token o con un token alterado: **401**. |
| **Roles** | `requiere_rol(...)` en [`app/seguridad.py`](app/seguridad.py) | Hay tres roles: `admin`, `cliente` y `conductor`. Un cliente que intenta ver usuarios o registrar camiones recibe **403**. |
| **Análisis BOLA/IDOR** | [`ANALISIS-BOLA-IDOR.md`](ANALISIS-BOLA-IDOR.md), [`app/routers/envios.py`](app/routers/envios.py) | Cada quien solo ve y modifica **sus** envíos. Si cambias el id en la URL por uno ajeno: **404**. |
| **API key** | [`app/routers/rastreo.py`](app/routers/rastreo.py), [`app/routers/admin.py`](app/routers/admin.py) | `GET /api/rastreo/{codigo}` pide el encabezado `X-API-Key`. Sin llave o con una revocada: **401**. |
| **Rate limiter** | [`app/limitador.py`](app/limitador.py) (slowapi) | 60 peticiones por minuto por IP en general, 5 intentos de login por minuto y 20 rastreos por minuto. Al pasarse: **429**. |
| **Cliente externo** | [`GUIA-UBUNTU.md`](GUIA-UBUNTU.md) | La API escucha en `0.0.0.0:8000`; cualquier equipo de la red entra a `http://IP-del-servidor:8000/docs`. |

## Usuarios de prueba

Se crean solos al arrancar si `CARGAR_DEMO=true`:

| Usuario | Contraseña | Rol | Qué puede hacer |
|---|---|---|---|
| `admin` | `admin123` | admin | Todo: usuarios, camiones, API keys y asignación automática |
| `cliente1` | `cliente123` | cliente | Crear, ver y cancelar **sus** envíos |
| `cliente2` | `cliente123` | cliente | Igual (sirve para probar ataques entre clientes) |
| `juan` | `juan123` | conductor | Ver y entregar los envíos de **su** camión (71-AK-3D) |
| `maria` | `maria123` | conductor | Igual, con el camión 52-BN-8F |

## Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/auth/login` | cualquiera | Iniciar sesión y obtener un JWT (máximo 5 intentos por minuto) |
| `GET /api/auth/yo` | con sesión | Ver mi usuario |
| `GET /api/envios` | con sesión | Lista de envíos: el admin ve todos, cada cliente los suyos y cada conductor los de su camión |
| `POST /api/envios` | cliente o admin | Solicitar un envío (`origen`, `destino`, `peso_kg`) |
| `GET /api/envios/{id}` | dueño o admin | Ver un envío (**BOLA**: si no es tuyo, 404) |
| `POST /api/envios/{id}/cancelar` | cliente dueño o admin | Cancelar un envío |
| `POST /api/envios/{id}/entregar` | conductor del camión o admin | Marcar como entregado |
| `POST /api/envios/asignar-automatico` | admin | Asigna a cada envío pendiente el camión más chico que lo aguante |
| `GET/POST /api/usuarios`, `/api/camiones` | admin | Administrar usuarios y camiones |
| `GET/POST /api/api-keys`, `DELETE /api/api-keys/{id}` | admin | Crear y revocar API keys (la llave completa solo se ve al crearla) |
| `GET /api/rastreo/{codigo}` | **API key** | Estado de un envío para sistemas externos, sin datos del cliente |

## Cómo probarlo

**Opción 1. Swagger (en el navegador):**

1. Abre `http://IP:8000/docs` y da clic en **Authorize**.
2. En **OAuth2PasswordBearer** escribe usuario y contraseña (por ejemplo `cliente1` / `cliente123`). Swagger pide el JWT solo.
3. Para el rastreo, crea una API key con el admin (`POST /api/api-keys`) y pégala en **APIKeyHeader**.

**Opción 2. Script automático:** desde cualquier computadora con Python, prueba los 4 requisitos (25 pruebas):

```bash
python3 pruebas/probar_seguridad.py http://IP-DEL-SERVIDOR:8000
```

La última prueba bloquea el login a propósito (rate limit). Espera 1 minuto antes de volver a correrlo.

## Correrlo en Windows

1. Instala Python 3.10+ y PostgreSQL.
2. Copia `.env.example` como `.env` y pon tu contraseña de `postgres` en `DATABASE_URL`.
3. Doble clic en **`iniciar.bat`**. La base `transporte_api` y sus tablas se crean solas.

## Subirlo a Ubuntu Server

Sigue la guía paso a paso: **[GUIA-UBUNTU.md](GUIA-UBUNTU.md)**.

## Estructura

```
app/
  main.py          arranque, CORS y rate limiter
  config.py        configuración (lee .env)
  database.py      conexión a PostgreSQL
  models.py        tablas: usuarios, camiones, envios, api_keys
  schemas.py       validación de datos (Pydantic)
  seguridad.py     contraseñas, JWT, roles y API keys
  limitador.py     rate limiter (slowapi)
  datos_demo.py    datos de ejemplo
  routers/
    auth.py        login (JWT)
    admin.py       usuarios, camiones y API keys (solo admin)
    envios.py      envíos con controles de roles y BOLA/IDOR
    rastreo.py     endpoint protegido con API key
pruebas/probar_seguridad.py   25 pruebas de los requisitos de seguridad
```
