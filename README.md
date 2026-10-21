# API · Agencia de Transporte

API para una agencia de transporte de carga. Dirige a los camiones por **rutas óptimas** y usa un **modelo de optimización que asigna automáticamente** cada envío al camión más conveniente. Incluye un **panel web de administración** con CRUD, mapa y tablero, y una base de datos local en **PostgreSQL**.

```
 Navegador (panel React)          Otras apps (p. ej. app de conductores)
          │  JWT                              │  X-API-Key
          ▼                                   ▼
 ┌───────────────────────────────────────────────────────────┐
 │ FastAPI  ·  CORS · rate limit · scopes · BOLA             │
 │  ├─ CRUD de catálogos (envíos, camiones, conductores, …)  │
 │  ├─ Rutas óptimas ............ Dijkstra                   │
 │  └─ Asignación automática .... Método húngaro (SciPy)     │
 └───────────────────────────────┬───────────────────────────┘
                                 │ SQLAlchemy + psycopg
                                 ▼
                      PostgreSQL (base "transporte")
```

| Parte | Tecnología |
|---|---|
| API | Python 3.12 · FastAPI · SQLAlchemy 2 · Pydantic 2 |
| Modelo | Dijkstra (implementado a mano) + método húngaro (`scipy.optimize.linear_sum_assignment`) |
| Base de datos | PostgreSQL 18 (local) |
| Seguridad | JWT con scopes (PyJWT) · API keys · rate limit · CORS · protección BOLA/IDOR |
| Panel web | React 19 · TypeScript · Vite · Tailwind CSS 4 · shadcn/ui · Leaflet (mapas) |

## Cómo arrancarlo

**Requisitos:** Python 3.12+, Node.js 20+ y PostgreSQL instalado y encendido.

1. Revisa el archivo `.env` (si no existe, copia `.env.example` como `.env`) y pon la contraseña de tu usuario `postgres` en `DATABASE_URL`.
2. Haz doble clic en **`iniciar.bat`**. La primera vez instala todo y compila el panel.
3. Abre **http://localhost:8000** para el panel o **http://localhost:8000/docs** para la documentación interactiva (Swagger).

La base de datos `transporte` y sus tablas se crean solas al arrancar. Con `CARGAR_DEMO=true` también se cargan 15 ciudades, 22 carreteras, 7 camiones, 7 conductores, 8 envíos y estos usuarios de prueba:

| Usuario | Contraseña | Rol | Qué puede hacer |
|---|---|---|---|
| `admin` | `admin123` | admin | Todo, incluidos usuarios y API keys |
| `operador` | `operador123` | operador | Editar catálogos y ejecutar el modelo |
| `consulta` | `consulta123` | consulta | Solo ver |
| `juan` | `juan123` | conductor | Solo ver la ruta de **su** camión |

<details>
<summary>Arrancarlo a mano (sin iniciar.bat)</summary>

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
cd frontend; npm install; npm run build; cd ..
.venv\Scripts\python -m uvicorn app.main:app --reload
```
</details>

## Cómo funciona el modelo de asignación

Está en [app/services/asignador.py](app/services/asignador.py) y [app/services/rutas.py](app/services/rutas.py).

1. **La red es un grafo.** Las ubicaciones son nodos y los tramos de carretera son aristas, cada una con distancia, tiempo y costo de casetas. Los tramos marcados como cerrados no se usan.
2. **Ruta óptima con Dijkstra.** Para cada combinación de camión disponible y envío pendiente se calcula el camino más corto (o más rápido) en dos partes:
   - Ubicación del camión → origen del envío (viaje en vacío).
   - Origen → destino (viaje con carga).
3. **Costo de cada combinación:** `(km totales ÷ rendimiento km/L) × precio del diésel + casetas`. Si el camión no aguanta el peso o no hay camino, la combinación se descarta.
4. **Asignación con el método húngaro.** Se arma una matriz de costos (envíos × camiones) y se resuelve el *problema de asignación*: cada camión lleva como máximo un envío y el costo total queda en el mínimo posible.
5. **Prioridades.** Si no alcanzan los camiones, dejar un envío sin camión tiene una penalización que crece con su prioridad (baja 1, media 2, alta 4, urgente 8). Por eso primero se cubren los urgentes y después se ahorra dinero. Un envío con fecha límite de hoy o mañana se trata como urgente.
6. Los envíos que se quedan sin camión regresan con el **motivo**, por ejemplo *"Ningún camión disponible aguanta 40,000 kg"*.

Después, cada asignación pasa por `planificada → en_curso → completada` (o `cancelada`). Al completarla, el camión queda disponible **en la ciudad de destino** y la siguiente corrida del modelo parte de ahí.

## Seguridad

Todo está explicado en **[SEGURIDAD.md](SEGURIDAD.md)**, junto con el **análisis BOLA/IDOR**. En resumen:

- **JWT** para personas: `POST /api/auth/token`. El token lleva los *scopes* (permisos) del rol.
- **API keys** para otras aplicaciones, en el encabezado `X-API-Key`. La API solo guarda su hash SHA-256 y la llave completa se ve una sola vez.
- **Scopes:** `catalogos:leer`, `catalogos:escribir`, `asignaciones:leer`, `asignaciones:escribir`, `rutas:leer` y `usuarios:admin`.
- **Rate limit:** 120 peticiones por minuto en general, 10 intentos de login por minuto por IP y 10 ejecuciones del modelo por minuto. Al pasarse se recibe `429` con `Retry-After`.
- **CORS:** solo se aceptan los orígenes de `CORS_ORIGENES` en `.env`.
- **BOLA/IDOR:** un conductor solo puede consultar la ruta de su camión. Si cambia el id en la URL recibe `404`.

## Endpoints principales

| Método y ruta | Scope | Descripción |
|---|---|---|
| `POST /api/auth/token` | — | Iniciar sesión y obtener un JWT |
| `GET /api/auth/yo` | sesión | Quién soy y qué permisos tengo |
| `PUT /api/auth/yo/password` | sesión | Cambiar mi contraseña |
| `GET/POST/PUT/DELETE /api/{envios, camiones, conductores, ubicaciones, tramos}` | `catalogos:leer` / `catalogos:escribir` | CRUD de catálogos |
| `POST /api/asignaciones/automatica?criterio=distancia` | `asignaciones:escribir` | **Ejecutar el modelo** |
| `POST /api/asignaciones` | `asignaciones:escribir` | Asignación manual (tú eliges el camión) |
| `GET /api/asignaciones` | `asignaciones:leer` | Listar asignaciones |
| `POST /api/asignaciones/{id}/{iniciar, completar, cancelar, recalcular}` | `asignaciones:escribir` | Cambiar el estado o recalcular la ruta |
| `GET /api/rutas/optima?origen_id=1&destino_id=12` | `rutas:leer` | Ruta óptima entre dos ciudades |
| `GET /api/rutas/camion/{id}` | `rutas:leer` + BOLA | Indicaciones paso a paso de un camión |
| `GET /api/rutas/mi-ruta` | `rutas:leer` | Ruta del conductor con la sesión abierta |
| `GET /api/panel` | `asignaciones:leer` | Datos del tablero |
| `/api/usuarios`, `/api/api-keys` | `usuarios:admin` | Administrar usuarios y API keys |

En `/docs` puedes probarlos todos con el botón **Authorize**, usando usuario y contraseña o una API key.

## Estructura

```
app/                    API (Python)
  main.py               arranque, CORS, rate limit global, encabezados de seguridad
  config.py             configuración leída de .env
  database.py           conexión a PostgreSQL (crea la base si no existe)
  models.py             tablas (SQLAlchemy)
  schemas.py            validación de datos de entrada y salida (Pydantic)
  seguridad.py          contraseñas, JWT, API keys, scopes y roles
  limites.py            rate limit
  crud.py               fábrica de endpoints CRUD
  datos_demo.py         datos de ejemplo
  routers/              endpoints por tema
  services/rutas.py     Dijkstra
  services/asignador.py modelo de asignación (método húngaro)
frontend/               panel web (React + TypeScript + Tailwind + shadcn/ui)
  src/components/ui/dashboard-with-collapsible-sidebar.tsx   diseño del dashboard
  src/components/ui/    componentes de shadcn (button, dialog, table, …)
  src/vistas/           pantallas: Inicio, Asignaciones, Rutas, Catálogo, API keys, Mi ruta
  src/entidades.ts      configuración de los CRUD (columnas y formularios)
database/esquema.sql    esquema SQL de referencia
iniciar.bat             arranca todo
```

## Trabajar en el panel web

FastAPI sirve la versión compilada (`frontend/dist`). Para editar el panel con recarga en vivo:

```powershell
# terminal 1
.venv\Scripts\python -m uvicorn app.main:app --reload
# terminal 2
cd frontend
npm run dev        # http://localhost:5173 (manda las peticiones /api a FastAPI)
```

Cuando termines, ejecuta `npm run build` para que FastAPI sirva la versión nueva.

El proyecto sigue la estructura de **shadcn/ui** (`components.json`, alias `@/` hacia `src/`, componentes en `src/components/ui`). Para agregar más componentes usa `npx shadcn@latest add <componente>` dentro de `frontend`. Tienen que vivir en `components/ui` porque ahí los busca y los escribe el CLI de shadcn, y ahí los importa el resto del código (`@/components/ui/...`).

## Base de datos

- Las tablas están en [app/models.py](app/models.py), y en [database/esquema.sql](database/esquema.sql) está el SQL equivalente para tu documentación.
- `create_all` solo crea tablas que no existen; no modifica las que ya están. Si cambias un modelo, borra la base para empezar de cero (en pgAdmin o con `psql -U postgres -c "DROP DATABASE transporte"`) y vuelve a arrancar la API.

## Problemas comunes

| Problema | Solución |
|---|---|
| `No se pudo conectar a PostgreSQL` | Revisa que el servicio `postgresql-x64-18` esté encendido (en *Servicios* de Windows) y la contraseña en `.env`. |
| `UnicodeDecodeError` al arrancar | Casi siempre es una contraseña equivocada: PostgreSQL en español manda el error con acentos. |
| La contraseña de postgres tiene `@`, `:` o `/` | En `DATABASE_URL` cámbialos por `%40`, `%3A` y `%2F`. |
| El mapa sale gris | El fondo del mapa (OpenStreetMap) necesita internet; las rutas se dibujan igual. |
| `429 Demasiadas peticiones` | Es el rate limit: espera los segundos que indica o sube los límites en `.env`. |
