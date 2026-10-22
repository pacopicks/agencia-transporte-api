# Análisis de seguridad BOLA / IDOR

**Proyecto:** API de la Agencia de Transporte (API REST, panel web y app móvil)
**Fecha:** 21 de octubre de 2026
**Alcance:** todos los endpoints de `/api`, con atención especial a los que usa la app móvil de los conductores (`/api/conductor/*`)
**Resultado:** no se encontraron vulnerabilidades BOLA/IDOR abiertas. Las **20 pruebas** automáticas de ataque pasan (sección 8). Quedan riesgos residuales bajos, descritos en la sección 9 con sus recomendaciones.

---

## 1. ¿Qué es BOLA / IDOR?

**BOLA** (*Broken Object Level Authorization*) es el riesgo **#1** del OWASP API Security Top 10 (2023). También se conoce como **IDOR** (*Insecure Direct Object Reference*, CWE-639). Ocurre cuando una API recibe el identificador de un objeto y lo entrega o lo modifica **sin comprobar que ese usuario tiene derecho sobre ese objeto en particular**.

Ejemplo en este sistema: el conductor Juan abre su viaje en la app y el teléfono pide `GET /api/conductor/viajes/1`. Si Juan cambia el `1` por un `2` y la API le responde con el viaje de María (su envío, su cliente, su ruta), eso es BOLA. Si además puede hacer `POST /api/conductor/viajes/2/entregar`, puede marcar como entregada una carga que nunca llegó.

Los ids de esta API son **números consecutivos** (1, 2, 3…), fáciles de adivinar. Por eso la protección no puede depender de que el id sea secreto: **cada endpoint que recibe un id tiene que verificar a quién pertenece el objeto**.

## 2. Actores y supuestos

| Actor | Cómo se autentica | Permisos (scopes) |
|---|---|---|
| Administrador | JWT | todos menos `conductor:viaje` |
| Operador | JWT | catálogos y asignaciones (lectura y escritura) y rutas |
| Consulta | JWT | solo lectura |
| **Conductor** | JWT desde la **app móvil** | `rutas:leer` y `conductor:viaje`, **solo sobre lo suyo** |
| Aplicación externa | API key (`X-API-Key`) | los scopes que le asignó el admin; nunca `usuarios:admin` ni `conductor:viaje` |

**Atacante considerado:** un conductor con sesión válida (Juan) que quiere ver o alterar los viajes de otro conductor (María) o hacer acciones de administrador. Se supone que **controla por completo su teléfono**:

- Puede leer su token.
- Puede interceptar y modificar las peticiones (por ejemplo con mitmproxy o Burp).
- Puede cambiar ids en la URL, agregar campos al JSON y editar el contenido de su JWT.

Por lo tanto, **ocultar botones en la app no cuenta como protección**: toda la autorización se valida en la API.

## 3. Metodología

1. **Inventario.** Se listaron todos los endpoints que reciben identificadores de objetos, ya sea en la ruta (`/{id}`), en el query string, en el cuerpo JSON o implícitos en el token.
2. **Modelo de propiedad.** Para cada tipo de objeto se definió quién es su dueño y quién puede leerlo o modificarlo (sección 4).
3. **Revisión de código.** Se verificó en cada endpoint que el control de propiedad exista **en el servidor** y que se aplique **antes** de leer o modificar los datos.
4. **Pruebas dinámicas con dos cuentas del mismo rol** (`juan` como atacante y `maria` como víctima) más el administrador. Las pruebas están automatizadas en [`pruebas/bola_idor.py`](pruebas/bola_idor.py).
5. **Clasificación** de cada hallazgo y de los riesgos residuales.

## 4. Modelo de propiedad

| Objeto | ¿De quién es? | Regla de acceso |
|---|---|---|
| Viaje (asignación) | Del conductor que tiene asignado (`asignaciones.conductor_id`) | El conductor solo ve y opera **sus** viajes. El personal ve todos según su scope. |
| Ruta de un camión | Del conductor asignado al camión (`camiones.conductor_id`) | El conductor solo consulta la de **su** camión. |
| Ubicación GPS | Del camión del conductor que la reporta | Solo se puede **escribir** en el camión propio; solo el personal puede **leer** las de la flota. |
| Contraseña de un usuario | Del propio usuario | Cada quien cambia la suya; el admin administra las demás. |
| API keys y usuarios | De la organización | Solo `usuarios:admin`. |
| Catálogos y envíos | De la organización (un solo inquilino) | Todo el personal, según su scope de lectura o escritura. |

## 5. Inventario de endpoints con identificadores

| Endpoint | De dónde sale el id | Control aplicado | Prueba |
|---|---|---|---|
| `GET /api/conductor/viaje` | **Sesión** (sin id) | El viaje activo se busca con el `conductor_id` del token | 1 |
| `GET /api/conductor/camion` | **Sesión** | El camión se busca con el `conductor_id` del token | — |
| `GET /api/conductor/viajes` | **Sesión** | El filtro por dueño va **dentro de la consulta SQL**: los viajes ajenos nunca se leen | 9 |
| `GET /api/conductor/viajes/{id}` | Ruta (controlable por el atacante) | `_mi_viaje()` compara `asignacion.conductor_id` con el del token; si no coincide, **404** | 2, 3 |
| `POST /api/conductor/viajes/{id}/iniciar` | Ruta | Mismo `_mi_viaje()`, **antes** de cambiar el estado, más validación del estado actual | 4, 20 |
| `POST /api/conductor/viajes/{id}/entregar` | Ruta | Igual | 5, 20 |
| `POST /api/conductor/ubicacion` | **Sesión**; el cuerpo solo trae coordenadas | El camión se toma del token. El esquema tiene `extra="forbid"`, así que mandar `camion_id` responde **422** | 10, 11 |
| `GET /api/rutas/mi-ruta` | **Sesión** | Igual que `/conductor/viaje` | — |
| `GET /api/rutas/camion/{id}` | Ruta | Con rol conductor, compara `camion.conductor_id`; si no es suyo, **404** igual al de un camión inexistente | 8 |
| `GET /api/asignaciones/{id}` y acciones | Ruta | Exige `asignaciones:leer` o `asignaciones:escribir`, que el conductor no tiene (**403**) | 6, 7 |
| `GET /api/posiciones` | — (lista) | Exige `catalogos:leer`; un conductor no puede ver dónde andan los demás | 12 |
| `GET/PUT/DELETE /api/{camiones, envios, …}/{id}` | Ruta | Exige `catalogos:*`, que el conductor no tiene | 13 |
| `PUT /api/usuarios/{id}` | Ruta | Exige `usuarios:admin` | 14 |
| `PUT /api/auth/yo/password` | **Sesión** | Sin id; además pide la contraseña actual | — |
| `PUT/DELETE /api/api-keys/{id}` | Ruta | Exige `usuarios:admin`, que una API key nunca puede tener | — |
| `POST /api/asignaciones` (`envio_id`, `camion_id` en el cuerpo) | Cuerpo | Exige `asignaciones:escribir` (personal). Un solo inquilino: el personal opera toda la flota por diseño | — |

**Patrón de diseño aplicado:** lo que le pertenece al conductor **no se identifica con un id que él mande, sino con su sesión**. En los pocos endpoints donde el id viaja en la URL (detalle de un viaje del historial e iniciar o entregar), el servidor verifica la propiedad y responde **404**, el mismo error que si el objeto no existiera. Responder 403 confirmaría que ese viaje existe.

## 6. Hallazgos y controles

| Id | Riesgo | Severidad sin control | Estado | Control | Prueba |
|---|---|---|---|---|---|
| BOLA-01 | Leer viajes de otro conductor cambiando el id | Alta: expone clientes, cargas y rutas | ✅ Mitigado | Verificación de propiedad en `_mi_viaje()` ([conductor.py](app/routers/conductor.py)) | 2 |
| BOLA-02 | Iniciar o entregar viajes ajenos | **Crítica**: permitiría reportar entregas falsas | ✅ Mitigado | Misma verificación antes de cualquier cambio; el estado del viaje de María no cambia | 4, 5, 20 |
| BOLA-03 | Ver la ruta del camión de otro | Alta | ✅ Mitigado | Verificación por rol en [rutas.py](app/routers/rutas.py) | 8 |
| BOLA-04 | Fuga en listados: el historial trae viajes ajenos | Media | ✅ Mitigado | Filtro por dueño en la consulta SQL, no después | 9 |
| BOPLA-01 | Asignación masiva: mandar `camion_id` ajeno al reportar GPS | Alta: permitiría falsear la ubicación de otro camión | ✅ Mitigado | `PosicionEntrada` con `extra="forbid"` → 422; el camión sale del token | 10, 11 |
| ENUM-01 | Enumerar ids para averiguar qué viajes o camiones existen | Baja | ✅ Mitigado | Mismo 404 y mismo mensaje para "ajeno" e "inexistente"; rate limit de 120 peticiones por minuto | 3 |
| BFLA-01 | Que un conductor use endpoints de administración | Alta | ✅ Mitigado | Scopes por endpoint: el conductor solo tiene `rutas:leer` y `conductor:viaje` | 6, 7, 13, 14 |
| PRIV-01 | Que un conductor vea el GPS de toda la flota | Media (privacidad) | ✅ Mitigado | `/api/posiciones` exige `catalogos:leer` | 12 |
| AUTH-01 | Editar el JWT para hacerse pasar por otro o agregarse permisos | **Crítica** | ✅ Mitigado | Firma HS256 verificada en cada petición; el rol se vuelve a leer de la base | 15, 16 |
| AUTH-02 | Pedir en el login scopes que el rol no tiene | Alta | ✅ Mitigado | El login rechaza scopes fuera del rol (403) | 17 |
| AUTH-03 | Que una API key o el admin actúen como conductor | Media | ✅ Mitigado | `conductor:viaje` solo existe en el rol conductor y se excluye de las API keys | 18, 19 |

## 7. Controles específicos de la app móvil

- **Sin caché de datos privados.** El service worker ([sw.js](frontend/public/movil/sw.js)) nunca guarda respuestas de `/api`. Si alguien toma el teléfono después de cerrar sesión, no encuentra viajes guardados.
- **Ubicación mínima y controlada.** La app solo manda coordenadas, y como máximo una vez cada 30 s. El conductor puede apagarlo en cualquier momento. El camión al que se asocia lo decide la API, nunca la app.
- **Las pantallas no son la seguridad.** La app oculta lo que no aplica a cada rol, pero la prueba "IDOR desde la URL" demuestra que, aunque Juan escriba a mano `#/historial/2` en la app, la API le responde *"No se encontró el viaje 2"*.

## 8. Evidencia (ejecución de `pruebas/bola_idor.py`)

Se ejecutó el 21/10/2026 contra una base recién creada con los datos de ejemplo (`juan` = atacante, `maria` = víctima, `admin`):

```
.venv\Scripts\python pruebas\bola_idor.py http://127.0.0.1:8001
```

| # | Prueba | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 1 | Control: Juan ve SU viaje actual | 200 | 200 | ✅ Pasa |
| 2 | IDOR: Juan lee el viaje 2 de María cambiando el id | 404 | 404 | ✅ Pasa |
| 3 | Enumeración: viaje ajeno y viaje inexistente responden igual | 404 | 404 | ✅ Pasa |
| 4 | BOLA: Juan inicia el viaje de María | 404 | 404 | ✅ Pasa |
| 5 | BOLA: Juan marca como entregado el viaje de María | 404 | 404 | ✅ Pasa |
| 6 | BFLA: Juan usa el endpoint de admin para cancelar el viaje de María | 403 | 403 | ✅ Pasa |
| 7 | BFLA: Juan consulta la asignación de María en el endpoint de admin | 403 | 403 | ✅ Pasa |
| 8 | IDOR: Juan pide la ruta del camión 2 de María | 404 | 404 | ✅ Pasa |
| 9 | Fuga en listas: el historial de Juan no trae viajes de María | 200 | 200 | ✅ Pasa |
| 10 | Asignación masiva: Juan manda camion_id de María al reportar ubicación | 422 | 422 | ✅ Pasa |
| 11 | Control: la ubicación de Juan se guarda en SU camión | 201 | 201 | ✅ Pasa |
| 12 | Privacidad: Juan consulta el GPS de todos los camiones | 403 | 403 | ✅ Pasa |
| 13 | BFLA: Juan lee el camión de María en el catálogo | 403 | 403 | ✅ Pasa |
| 14 | BFLA: Juan cambia la contraseña de María por /api/usuarios | 403 | 403 | ✅ Pasa |
| 15 | Suplantación: Juan edita su JWT para decir que es María | 401 | 401 | ✅ Pasa |
| 16 | Escalada: Juan se agrega scopes de admin editando su JWT | 401 | 401 | ✅ Pasa |
| 17 | Escalada: Juan pide un token con scope usuarios:admin | 403 | 403 | ✅ Pasa |
| 18 | Una API key no puede usar los endpoints del conductor | 403 | 403 | ✅ Pasa |
| 19 | El admin no puede operar viajes como si fuera conductor | 403 | 403 | ✅ Pasa |
| 20 | Integridad: el viaje de María no cambió después de los ataques | planificada | planificada | ✅ Pasa |

**20/20 pruebas pasaron.** Las pruebas 1 y 11 son controles positivos: confirman que el dueño legítimo **sí** puede usar sus datos, así que los bloqueos no se deben a que todo esté apagado.

### Cómo reproducirlo

1. Arranca la API con los datos de ejemplo (`iniciar.bat`).
2. En otra terminal: `.venv\Scripts\python pruebas\bola_idor.py`.
3. A mano, desde la app móvil: entra como `juan` (`juan123`) en `http://localhost:8000/movil/`, ve a *Historial* y cambia la dirección a `…/movil/#/historial/2`. Verás *"No se encontró el viaje 2"*.

> El script ejecuta el modelo de asignación si los conductores no tienen viaje activo, y guarda una ubicación GPS de prueba. Úsalo en una base de demostración.

## 9. Riesgos residuales y recomendaciones

| Prioridad | Riesgo | Recomendación |
|---|---|---|
| Media | **El token vive en `localStorage` del teléfono.** Un ataque XSS podría robarlo. Hoy se mitiga porque React escapa todo el contenido, no se usa HTML del usuario y el token expira en 8 h. | Usar cookies `HttpOnly` + `SameSite` con protección CSRF, o el almacenamiento seguro del sistema si la app se empaqueta como nativa (Capacitor). Usar tokens más cortos con refresh token. |
| Baja | **Ids consecutivos.** Están protegidos por la verificación de propiedad, pero revelan cuántos viajes hay. | Como defensa en profundidad, exponer ids opacos (UUID) en la API pública. |
| Baja | **Sin bitácora de intentos denegados.** Un ataque de enumeración no deja rastro fuera del log del servidor. | Registrar los 403 y 404 de objetos ajenos con usuario, endpoint e IP, y alertar si se repiten. |
| Baja | **Rate limit en memoria**, por proceso. | Con varios servidores, moverlo a Redis. |
| Informativa | **Un solo inquilino.** Operadores y admins ven toda la flota (es una sola empresa, por diseño). | Si la API se volviera multiempresa: agregar `empresa_id` a cada tabla y filtrarlo en **todas** las consultas. Sería el siguiente punto crítico de BOLA. |
| Informativa | **La propiedad de un viaje es del conductor asignado en ese momento.** Si se cambia el conductor de un camión, el anterior conserva su historial y el nuevo no lo ve. | Es una decisión de diseño intencional (privacidad). Si el admin reasigna un viaje activo, debe cancelarlo y volver a asignarlo. |

## 10. Referencias

- OWASP API Security Top 10 (2023): **API1** Broken Object Level Authorization, **API3** Broken Object Property Level Authorization, **API5** Broken Function Level Authorization.
- CWE-639: *Authorization Bypass Through User-Controlled Key*.
- CWE-915: *Improperly Controlled Modification of Dynamically-Determined Object Attributes* (asignación masiva).
