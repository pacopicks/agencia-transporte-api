# Análisis BOLA / IDOR

**Proyecto:** API de la Agencia de Transporte
**Fecha:** 22 de octubre de 2026
**Resultado:** no hay vulnerabilidades BOLA/IDOR abiertas. Las 9 pruebas de ataque de objetos ajenos fallan como deben, igual que el resto de las 25 pruebas de seguridad (sección 6).

## 1. ¿Qué es BOLA / IDOR?

**BOLA** (*Broken Object Level Authorization*) es el riesgo **#1** del OWASP API Security Top 10 (2023). También se le llama **IDOR** (*Insecure Direct Object Reference*). Ocurre cuando la API recibe el id de un objeto y lo entrega o lo modifica **sin revisar si ese usuario tiene derecho sobre ese objeto**.

**Ejemplo en esta API:** `cliente1` consulta su envío con `GET /api/envios/1`. Si cambia el `1` por un `3` y la API le muestra el envío de `cliente2` (origen, destino, peso), eso es BOLA. Si además puede hacer `POST /api/envios/3/cancelar`, puede cancelar el envío de otra empresa.

Los ids de la API son consecutivos (1, 2, 3…) y fáciles de adivinar, así que la protección no puede depender de que el id sea secreto: **hay que revisar quién es el dueño en cada petición**.

## 2. Roles y dueños de los datos

| Rol | Puede ver | Puede modificar |
|---|---|---|
| `admin` | Todo | Todo; además asigna camiones, crea usuarios, camiones y API keys |
| `cliente` | **Sus** envíos (`envio.cliente_id` = su id) | Crear envíos y cancelar **sus** envíos pendientes |
| `conductor` | Los envíos asignados a **su** camión (`camion.conductor_id` = su id) | Marcar como entregados **esos** envíos |
| Sistema externo (API key) | Solo el estado de un envío por su código de rastreo, sin datos del cliente | Nada |

**Atacante considerado:** un cliente o conductor con sesión válida que manda peticiones a mano desde Postman, curl o Swagger. Puede cambiar ids en la URL, agregar campos al JSON y editar su token.

## 3. Inventario de endpoints que reciben un identificador

| Endpoint | Identificador | Control | Prueba |
|---|---|---|---|
| `GET /api/envios` | Ninguno (lista) | El filtro por dueño va **dentro de la consulta SQL**; los envíos ajenos nunca se leen | 10, 17 |
| `GET /api/envios/{id}` | `id` en la URL | `obtener_envio()` revisa el dueño; si no es suyo responde **404**, igual que si no existiera | 11, 12, 15 |
| `POST /api/envios/{id}/cancelar` | `id` en la URL | Mismo control de dueño **antes** de modificar, y luego se revisa el rol | 13, 18 |
| `POST /api/envios/{id}/entregar` | `id` en la URL | Mismo control: el conductor solo entrega envíos de su camión | 16, 18 |
| `POST /api/envios` | `cliente_id` (si alguien lo manda en el JSON) | El dueño sale del **token**; el esquema tiene `extra="forbid"` y rechaza `cliente_id` con **422** | 14 |
| `GET /api/rastreo/{codigo}` | Código de rastreo | Pide API key. El código es **aleatorio** (`TR-` y 8 caracteres, unos 1.1 billones de combinaciones, no consecutivo) y hay un límite de 20 consultas por minuto, así que no se puede adivinar. Solo regresa datos públicos | 19–24 |
| `/api/usuarios`, `/api/camiones`, `/api/api-keys/{id}` | Varios | Solo el rol `admin` (**403** para los demás) | 5, 6, 21 |

## 4. Controles aplicados

1. **Verificación de dueño en cada petición.** La función `obtener_envio()` en [`app/routers/envios.py`](app/routers/envios.py) es el único camino para leer o modificar un envío por id.
2. **404 en lugar de 403.** Responder "no tienes permiso" confirmaría que el envío existe. Con el mismo 404 para "ajeno" e "inexistente", el atacante no puede enumerar ids (prueba 12).
3. **El dueño sale del token, nunca del cuerpo.** Al crear un envío, `cliente_id` se toma del JWT. Si alguien lo manda en el JSON, la API responde 422 (asignación masiva bloqueada).
4. **Filtro en la consulta SQL.** Las listas filtran por dueño en la base de datos, no después en Python.
5. **Roles por endpoint.** `requiere_rol("admin")` protege las funciones de administración (BFLA).
6. **El token no se puede falsificar.** El JWT va firmado con HS256. Si alguien edita su contenido (por ejemplo `"rol": "admin"`), la firma deja de coincidir y la API responde 401 (prueba 2). Además, el usuario se vuelve a leer de la base en cada petición.
7. **Mínimos datos con API key.** El rastreo no regresa `cliente_id` ni `camion_id` (prueba 23).

## 5. Riesgos que quedan

| Riesgo | Nivel | Recomendación |
|---|---|---|
| Los ids de los envíos son consecutivos | Bajo (protegidos por el control de dueño) | Usar UUID como defensa extra |
| No hay bitácora de intentos denegados | Bajo | Registrar los 403 y 404 de objetos ajenos para detectar ataques |
| El rate limit vive en memoria | Bajo | Si se usan varios procesos o servidores, guardarlo en Redis |
| La API corre por `http` | Medio en una red real | Ponerla detrás de Nginx con HTTPS para que los tokens no viajen en texto plano |

## 6. Evidencia

Se ejecutó el 22/10/2026 desde la red, contra la IP del servidor y con los datos de ejemplo:

```
python3 pruebas/probar_seguridad.py http://192.168.100.43:8000
```

| # | Requisito | Prueba | Esperado | Obtenido | Resultado |
|---|---|---|---|---|---|
| 1 | JWT | Pedir envíos sin token | 401 | 401 | ✅ Pasa |
| 2 | JWT | Token alterado para hacerse pasar por admin | 401 | 401 | ✅ Pasa |
| 3 | JWT | Login con contraseña incorrecta | 401 | 401 | ✅ Pasa |
| 4 | JWT | Control: con token válido sí entra | 200 | 200 | ✅ Pasa |
| 5 | Roles | Cliente intenta ver la lista de usuarios | 403 | 403 | ✅ Pasa |
| 6 | Roles | Cliente intenta registrar un camión | 403 | 403 | ✅ Pasa |
| 7 | Roles | Conductor intenta ejecutar la asignación | 403 | 403 | ✅ Pasa |
| 8 | Roles | Conductor intenta crear un envío | 403 | 403 | ✅ Pasa |
| 9 | Roles | Control: el admin sí ve los usuarios | 200 | 200 | ✅ Pasa |
| 10 | BOLA/IDOR | La lista de cliente1 solo trae SUS envíos | 200 | 200 | ✅ Pasa |
| 11 | BOLA/IDOR | Cliente1 abre el envío 3 de cliente2 cambiando el id | 404 | 404 | ✅ Pasa |
| 12 | BOLA/IDOR | Envío ajeno e inexistente responden igual (no se pueden enumerar) | 404 | 404 | ✅ Pasa |
| 13 | BOLA/IDOR | Cliente1 cancela el envío de cliente2 | 404 | 404 | ✅ Pasa |
| 14 | BOLA/IDOR | Cliente1 crea un envío a nombre de cliente2 (cliente_id en el cuerpo) | 422 | 422 | ✅ Pasa |
| 15 | BOLA/IDOR | Juan abre el envío 3 del camión de María | 404 | 404 | ✅ Pasa |
| 16 | BOLA/IDOR | Juan marca como entregado el envío de María | 404 | 404 | ✅ Pasa |
| 17 | BOLA/IDOR | La lista de Juan solo trae envíos de SU camión | 200 | 200 | ✅ Pasa |
| 18 | BOLA/IDOR | Los envíos atacados no cambiaron de estado | sin cambios | sin cambios | ✅ Pasa |
| 19 | API key | Rastreo sin el encabezado X-API-Key | 401 | 401 | ✅ Pasa |
| 20 | API key | Rastreo con una API key inventada | 401 | 401 | ✅ Pasa |
| 21 | API key | Un cliente intenta crear una API key | 403 | 403 | ✅ Pasa |
| 22 | API key | El admin crea una API key | 201 | 201 | ✅ Pasa |
| 23 | API key | Rastreo con la API key válida (sin datos del cliente) | 200 | 200 | ✅ Pasa |
| 24 | API key | Rastreo con la API key ya revocada | 401 | 401 | ✅ Pasa |
| 25 | Rate limit | Intentos de login seguidos hasta el bloqueo (2 más) | 429 | 429 | ✅ Pasa |

**25/25 pruebas pasaron.** Las pruebas 4 y 9 son controles positivos: confirman que el usuario correcto **sí** puede entrar, así que los bloqueos no se deben a que todo esté cerrado.

### Cómo reproducir un ataque a mano (Swagger)

1. En `http://IP:8000/docs`, inicia sesión como `cliente1` / `cliente123` con **Authorize**.
2. `GET /api/envios`: solo aparecen los envíos de cliente1 (ids 1 y 2).
3. `GET /api/envios/{id}` con `id = 3` (es de cliente2): responde `404 No se encontró el envío 3`.
4. Cierra sesión, entra como `admin` y repite el paso 3: el admin sí lo ve. El envío existe; simplemente no es de cliente1.

## 7. Referencias

- OWASP API Security Top 10 (2023): API1 Broken Object Level Authorization, API3 Broken Object Property Level Authorization, API5 Broken Function Level Authorization.
- CWE-639: *Authorization Bypass Through User-Controlled Key*.
