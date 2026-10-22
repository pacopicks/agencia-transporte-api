# API · Agencia de Transporte

API para una agencia de transporte de carga. Dirige a los camiones por **rutas óptimas** y usa un **modelo de optimización que asigna automáticamente** cada envío al camión más conveniente. Incluye un **panel web de administración** con CRUD, mapa y tablero, una **app móvil** (PWA instalable) para conductores y personal, y una base de datos local en **PostgreSQL**.

```
 Panel web (React)   App móvil (PWA, /movil)   Otras apps
          │  JWT              │  JWT                │  X-API-Key
          ▼                   ▼                     ▼
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
| Panel web y app móvil | React 19 · TypeScript · Vite · Tailwind CSS 4 · shadcn/ui · Leaflet (mapas) · PWA (manifest + service worker) |

## Requisitos de seguridad de la tarea

| Requisito | En la API | En el panel web (`/`) | En la app móvil (`/movil/`) |
|---|---|---|---|
| **JWT** | `POST /api/auth/token` entrega el token y todas las rutas lo exigen. Sin token o con un token alterado: **401**. | Pantalla de inicio de sesión. El token viaja en cada petición; si expira, te regresa al login. | Su propia pantalla de inicio de sesión, con el mismo token. |
| **Roles** | 4 roles (admin, operador, consulta, conductor) con *scopes* por endpoint. Si falta permiso: **403**. | El menú y los botones cambian según el rol: *Usuarios* y *API keys* solo los ve el admin, `consulta` no tiene botones de edición y el conductor solo ve *Mi ruta*. | Pestañas según el rol: el conductor tiene *Mi viaje* e *Historial*; el personal tiene *Inicio*, *Asignaciones*, *Envíos* y *Flota*. `consulta` no puede editar. |
| **BOLA/IDOR** | Verificación de dueño en `/api/conductor/viajes/{id}` y `/api/rutas/camion/{id}`: si no es tuyo, **404**. El GPS no acepta `camion_id`. Ver [ANALISIS-BOLA-IDOR.md](ANALISIS-BOLA-IDOR.md). | El conductor en *Mi ruta* solo ve su camión. | Si un conductor escribe en la URL el id de un viaje ajeno: *"No se encontró el viaje"*. |
| **API key** | Encabezado `X-API-Key`. Se guarda solo el hash, tiene scopes propios y se puede revocar. | Sección **API keys**: crear (la llave se muestra una sola vez), revocar y eliminar. | No se usa a propósito: la app es para personas y usa JWT. Las API keys son para sistemas externos y meterlas en la app las dejaría expuestas. |
| **Rate limit** | 120 peticiones por minuto en general, 10 intentos de login y 10 ejecuciones del modelo por minuto. Al pasarse: **429** con `Retry-After`. | Muestra *"Demasiadas peticiones. Intenta de nuevo en N s."* | Muestra el mismo aviso. |

**Comprobarlo desde un cliente externo** (cualquier computadora con Python que llegue al servidor):

```bash
python3 pruebas/probar_seguridad.py http://IP-DEL-SERVIDOR:8000   # 23 pruebas: JWT, roles, BOLA, API key y rate limit
python3 pruebas/bola_idor.py http://IP-DEL-SERVIDOR:8000          # 20 ataques BOLA/IDOR entre conductores
```

`probar_seguridad.py` deja el login bloqueado 1 minuto al final (prueba del rate limit), así que espera ese minuto antes de correr otra prueba.

## Subirlo a Ubuntu Server

Guía paso a paso para una máquina virtual: **[GUIA-UBUNTU.md](GUIA-UBUNTU.md)**. El panel ya va compilado en `frontend/dist`, así que **el servidor no necesita Node.js**, solo Python y PostgreSQL.

## Cómo arrancarlo en Windows

**Requisitos:** Python 3.10+ y PostgreSQL instalado y encendido. Node.js 20+ solo hace falta si vas a modificar el panel.

1. Revisa el archivo `.env` (si no existe, copia `.env.example` como `.env`) y pon la contraseña de tu usuario `postgres` en `DATABASE_URL`.
2. Haz doble clic en **`iniciar.bat`**. La primera vez instala todo y compila el panel.
3. Abre **http://localhost:8000** para el panel, **http://localhost:8000/movil/** para la app móvil o **http://localhost:8000/docs** para la documentación interactiva (Swagger).

La base de datos `transporte` y sus tablas se crean solas al arrancar. Con `CARGAR_DEMO=true` también se cargan 15 ciudades, 22 carreteras, 7 camiones, 7 conductores, 8 envíos y estos usuarios de prueba:

| Usuario | Contraseña | Rol | Qué puede hacer |
|---|---|---|---|
| `admin` | `admin123` | admin | Todo, incluidos usuarios y API keys |
| `operador` | `operador123` | operador | Editar catálogos y ejecutar el modelo |
| `consulta` | `consulta123` | consulta | Solo ver |
| `juan` | `juan123` | conductor | App móvil: solo **sus** viajes y **su** camión (71-AK-3D) |
| `maria` | `maria123` | conductor | Igual, con el camión 52-BN-8F (sirve para probar ataques entre conductores) |

> Con `CARGAR_DEMO=true`, los usuarios de prueba que falten se vuelven a crear al arrancar. En una instalación real pon `CARGAR_DEMO=false` y cambia la contraseña del admin.

<details>
<summary>Arrancarlo a mano (sin iniciar.bat)</summary>

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
cd frontend; npm install; npm run build; cd ..
.venv\Scripts\python -m uvicorn app.main:app --reload
```
</details>

## App móvil

Es una **PWA** (app web instalable) hecha con el mismo código que el panel ([frontend/src/movil](frontend/src/movil)). Vive en **`/movil/`**, se instala en la pantalla de inicio del celular y muestra pantallas distintas según el rol:

| Rol | Pestañas |
|---|---|
| Conductor | **Mi viaje** (envío, mapa, ruta paso a paso, *Iniciar viaje*, *Confirmar entrega*, *Navegar con Google Maps* y compartir ubicación GPS) · **Historial** · **Perfil** |
| Admin, operador o consulta | **Inicio** (resumen y ejecutar el modelo) · **Asignaciones** (con acciones) · **Envíos** (alta rápida) · **Flota** (mapa con el GPS de los camiones) · **Perfil** |

**Probarla en la computadora:** abre http://localhost:8000/movil/ y activa la vista de celular del navegador (F12 → ícono de teléfono).

**Probarla en tu celular (misma red Wi-Fi):** ejecuta **`iniciar-red.bat`** y abre en el celular la dirección que aparece (`http://192.168.x.x:8000/movil/`). Si Windows pregunta por el firewall, permite el acceso en redes privadas. Así la app funciona, pero el navegador **no deja usar el GPS ni instalarla** sin `https`.

**Instalarla con GPS (https):** con la API encendida, crea un túnel `https` temporal con Cloudflare:

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:8000
```

Abre en el celular la dirección `https://….trycloudflare.com/movil/` que aparece y elige **"Instalar app"** o **"Agregar a pantalla principal"**. Mientras el túnel esté abierto, cualquiera con el enlace puede llegar a tu API: cambia antes las contraseñas de prueba y ciérralo con `Ctrl+C` al terminar.

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

Todo está explicado en **[SEGURIDAD.md](SEGURIDAD.md)**. El **análisis BOLA/IDOR** completo, con evidencia, está en **[ANALISIS-BOLA-IDOR.md](ANALISIS-BOLA-IDOR.md)**. En resumen:

- **JWT** para personas: `POST /api/auth/token`. El token lleva los *scopes* (permisos) del rol.
- **API keys** para otras aplicaciones, en el encabezado `X-API-Key`. La API solo guarda su hash SHA-256 y la llave completa se ve una sola vez.
- **Scopes:** `catalogos:leer`, `catalogos:escribir`, `asignaciones:leer`, `asignaciones:escribir`, `rutas:leer`, `usuarios:admin` y `conductor:viaje`.
- **Rate limit:** 120 peticiones por minuto en general, 10 intentos de login por minuto por IP y 10 ejecuciones del modelo por minuto. Al pasarse se recibe `429` con `Retry-After`.
- **CORS:** solo se aceptan los orígenes de `CORS_ORIGENES` en `.env`.
- **BOLA/IDOR:** un conductor solo ve y opera **sus** viajes y **su** camión. Si cambia el id en la URL recibe `404`. Las 20 pruebas de ataque de [`pruebas/bola_idor.py`](pruebas/bola_idor.py) pasan.

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
| `GET /api/posiciones` | `catalogos:leer` | Última ubicación GPS de cada camión |
| `GET /api/conductor/viaje` · `GET /api/conductor/camion` | `conductor:viaje` | App móvil: mi viaje actual y mi camión |
| `GET /api/conductor/viajes` · `GET /api/conductor/viajes/{id}` | `conductor:viaje` + BOLA | Mi historial y el detalle de uno de **mis** viajes |
| `POST /api/conductor/viajes/{id}/{iniciar, entregar}` | `conductor:viaje` + BOLA | Salir a ruta o confirmar la entrega |
| `POST /api/conductor/ubicacion` | `conductor:viaje` | Reportar mi ubicación GPS (el camión sale de la sesión) |
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
  services/viajes.py    ciclo de vida de un viaje (iniciar, entregar, cancelar)
frontend/               panel web (React + TypeScript + Tailwind + shadcn/ui)
  src/components/ui/dashboard-with-collapsible-sidebar.tsx   diseño del dashboard
  src/components/ui/    componentes de shadcn (button, dialog, table, …)
  src/vistas/           pantallas: Inicio, Asignaciones, Rutas, Catálogo, API keys, Mi ruta
  src/entidades.ts      configuración de los CRUD (columnas y formularios)
  movil/index.html      página de la app móvil
  src/movil/            app móvil: pantallas del conductor y del personal, GPS
  public/movil/         manifest, service worker e íconos de la PWA
pruebas/probar_seguridad.py   23 pruebas de los requisitos de la tarea (JWT, roles, BOLA, API key, rate limit)
pruebas/bola_idor.py    20 pruebas automáticas de ataques BOLA/IDOR
GUIA-UBUNTU.md          cómo subirlo a Ubuntu Server en una máquina virtual
database/esquema.sql    esquema SQL de referencia
iniciar.bat             arranca todo (solo en esta computadora)
iniciar-red.bat         arranca todo y lo abre a tu red Wi-Fi (para el celular)
```

## Trabajar en el panel web

FastAPI sirve la versión compilada (`frontend/dist`). Para editar el panel con recarga en vivo:

```powershell
# terminal 1
.venv\Scripts\python -m uvicorn app.main:app --reload
# terminal 2
cd frontend
npm run dev        # panel: http://localhost:5173 · app móvil: http://localhost:5173/movil/
```

Cuando termines, ejecuta `npm run build` para que FastAPI sirva la versión nueva, y sube también `frontend/dist`: va en git para que el servidor no necesite Node.js.

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
