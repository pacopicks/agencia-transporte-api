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

| Rol | Scopes |
|---|---|
| admin | todos |
| operador | todos menos `usuarios:admin` |
| consulta | `catalogos:leer`, `asignaciones:leer`, `rutas:leer` |
| conductor | `rutas:leer`, limitado a su propio camión (ver BOLA) |

- Un token puede pedir **menos** scopes que los de su rol (campo `scope` del login, o las casillas de *Authorize* en `/docs`). Así se aplica el **mínimo privilegio**: por ejemplo, un token solo de lectura para un reporte.
- Pedir scopes que el rol no tiene responde `403`.
- Una **API key nunca puede tener `usuarios:admin`**: una llave no puede crear usuarios ni otras llaves.

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

## 5. Análisis BOLA / IDOR

**BOLA** (*Broken Object Level Authorization*, el riesgo #1 del OWASP API Security Top 10), también llamado **IDOR** (*Insecure Direct Object Reference*), ocurre cuando la API recibe el id de un objeto (`/camiones/5`) y lo entrega sin revisar si **ese usuario** tiene derecho a **ese objeto**. Los ids de esta API son números consecutivos (1, 2, 3…), así que son fáciles de adivinar. Por eso la defensa no puede depender de que el id sea secreto: **cada endpoint que recibe un id tiene que validar la propiedad del objeto**.

### Revisión de endpoints con id en la URL

| Endpoint | Objeto | ¿Quién puede acceder? | Control | Riesgo |
|---|---|---|---|---|
| `GET /api/rutas/camion/{id}` | Ruta de un camión | Personal con `rutas:leer`; un **conductor** solo la de **su** camión | Compara `camion.conductor_id` con el conductor del usuario ([rutas.py](app/routers/rutas.py)). Si no coincide responde **404**, el mismo error que si no existiera, para que no se puedan enumerar camiones. | ✅ Mitigado |
| `GET /api/rutas/mi-ruta` | Ruta propia | Conductor | **No recibe id**: el camión se toma de la sesión, así que no hay id que manipular | ✅ Por diseño |
| `PUT /api/auth/yo/password` | Contraseña propia | Cualquier sesión | **No recibe id** y exige la contraseña actual; nadie puede cambiar la de otro | ✅ Por diseño |
| `GET/PUT/DELETE /api/usuarios/{id}` | Usuarios | Solo `usuarios:admin` | Función restringida a administradores; además un admin no puede borrarse, desactivarse ni quitarse el rol a sí mismo | ✅ Mitigado (BFLA) |
| `PUT/DELETE /api/api-keys/{id}` | API keys | Solo `usuarios:admin` | Igual; las llaves no pueden tener este scope | ✅ Mitigado |
| `GET/PUT/DELETE /api/{envios, camiones, conductores, ubicaciones, tramos}/{id}` | Catálogos | Personal con el scope | La agencia es **una sola organización**: estos datos son compartidos por todo el personal, no pertenecen a un usuario. El scope es el control correcto. Si la API se volviera multiempresa, habría que agregar `empresa_id` y filtrarlo en cada consulta. | ✅ Aceptado (un solo inquilino) |
| `GET/POST /api/asignaciones/{id}/...` | Asignaciones | Personal con el scope | Igual que los catálogos; además cada acción valida el estado actual (no se puede completar algo que no ha iniciado) | ✅ Aceptado |

### Otros riesgos de objeto revisados

- **Asignación masiva / BOPLA** (*Broken Object Property Level Authorization*, OWASP API3). Los esquemas Pydantic definen exactamente qué campos se aceptan. Un cliente no puede mandar `password_hash`, `hash` de una API key ni `creado_en`; esos campos no existen en la entrada y se ignoran.
- **Exposición de datos.** Las respuestas usan esquemas de salida que **nunca incluyen** `password_hash` ni el hash de las API keys. La llave completa solo aparece en la respuesta de creación.
- **Mensajes de error.** El 404 de un objeto ajeno es idéntico al de uno inexistente, y el login falla igual sin importar si el usuario existe.

### Cómo comprobarlo

Con la API corriendo y los datos de ejemplo:

```powershell
# 1. Entrar como el conductor juan (su camión es el 1: 71-AK-3D)
$t = (Invoke-RestMethod -Method Post http://localhost:8000/api/auth/token -Body @{username="juan"; password="juan123"}).access_token
$h = @{Authorization = "Bearer $t"}

# 2. Su propia ruta: funciona (si el camión tiene asignación activa; si no, ejecuta antes el modelo como admin)
Invoke-RestMethod http://localhost:8000/api/rutas/mi-ruta -Headers $h

# 3. Intento IDOR: cambia el id por el de otro camión -> 404 "No se encontró camión con id 2"
Invoke-RestMethod http://localhost:8000/api/rutas/camion/2 -Headers $h

# 4. Intento de leer catálogos sin permiso -> 403 (falta catalogos:leer)
Invoke-RestMethod http://localhost:8000/api/envios -Headers $h
```

Rate limit del login (el intento 11 dentro del mismo minuto responde 429):

```powershell
1..11 | ForEach-Object { try { Invoke-RestMethod -Method Post http://localhost:8000/api/auth/token -Body @{username="admin"; password="mala"} } catch { $_.Exception.Response.StatusCode.value__ } }
```

## 6. Pendientes para producción

- Servir la API con **HTTPS** detrás de un proxy (Nginx o Caddy): sin HTTPS los tokens viajan en texto plano.
- Pasar el rate limit a **Redis** si se usan varios procesos o servidores.
- Agregar **refresh tokens** y una lista de revocación de JWT si se necesitan sesiones largas.
- Registrar en una bitácora los intentos de acceso denegados (401, 403 y 404 por BOLA) para detectar ataques.
