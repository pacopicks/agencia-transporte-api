"""Prueba los requisitos de seguridad de la tarea desde un cliente externo:
JWT, roles, BOLA/IDOR, API key y rate limit.

Uso (desde cualquier computadora que llegue al servidor):
    python3 pruebas/probar_seguridad.py http://IP-DEL-SERVIDOR:8000

Necesita los datos de ejemplo (CARGAR_DEMO=true). Solo usa la librería estándar de Python.
Si los conductores no tienen viaje activo, ejecuta el modelo de asignación como admin.
La última prueba agota a propósito el límite de login: espera 1 minuto antes de volver a correrlo.
El análisis BOLA completo (20 ataques) está en pruebas/bola_idor.py.
"""
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass


def pedir(metodo, ruta, token=None, datos=None, form=None, api_key=None):
    encabezados = {}
    cuerpo = None
    if token:
        encabezados["Authorization"] = f"Bearer {token}"
    if api_key:
        encabezados["X-API-Key"] = api_key
    if datos is not None:
        cuerpo = json.dumps(datos).encode()
        encabezados["Content-Type"] = "application/json"
    if form is not None:
        cuerpo = urllib.parse.urlencode(form).encode()
        encabezados["Content-Type"] = "application/x-www-form-urlencoded"
    peticion = urllib.request.Request(BASE + ruta, data=cuerpo, headers=encabezados, method=metodo)
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            codigo, texto, hdrs = r.status, r.read().decode(), dict(r.headers)
    except urllib.error.HTTPError as e:
        codigo, texto, hdrs = e.code, e.read().decode(), dict(e.headers)
    except urllib.error.URLError as e:
        sys.exit(f"No se pudo conectar a {BASE}: {e.reason}. ¿La API está encendida y el puerto abierto?")
    try:
        return codigo, json.loads(texto) if texto else None, {k.lower(): v for k, v in hdrs.items()}
    except json.JSONDecodeError:
        return codigo, texto, {k.lower(): v for k, v in hdrs.items()}


def login(usuario, password):
    codigo, datos, _ = pedir("POST", "/api/auth/token", form={"username": usuario, "password": password})
    if codigo != 200:
        sys.exit(f"No se pudo entrar como {usuario} ({codigo}): {datos}. ¿Están los datos de ejemplo? ¿Esperaste 1 minuto?")
    return datos["access_token"]


def alterar_token(token, **cambios):
    """Cambia el contenido del JWT sin volver a firmarlo (lo que intentaría un atacante)."""
    cabecera, contenido, firma = token.split(".")
    datos = json.loads(base64.urlsafe_b64decode(contenido + "=" * (-len(contenido) % 4)))
    datos.update(cambios)
    nuevo = base64.urlsafe_b64encode(json.dumps(datos).encode()).decode().rstrip("=")
    return f"{cabecera}.{nuevo}.{firma}"


# ---------- Preparación (5 inicios de sesión) ----------
admin = login("admin", "admin123")
operador = login("operador", "operador123")
consulta = login("consulta", "consulta123")
juan = login("juan", "juan123")
maria = login("maria", "maria123")

viajes = {}
for nombre, token in (("juan", juan), ("maria", maria)):
    codigo, viaje, _ = pedir("GET", "/api/conductor/viaje", token)
    if codigo == 404:
        print(f"(preparación) {nombre} no tiene viaje activo: ejecutando el modelo de asignación como admin…")
        pedir("POST", "/api/asignaciones/automatica", admin)
        codigo, viaje, _ = pedir("GET", "/api/conductor/viaje", token)
    if codigo != 200:
        sys.exit(f"{nombre} no tiene viaje activo ni después de correr el modelo ({codigo}: {viaje}).")
    viajes[nombre] = viaje
viaje_maria, camion_maria = viajes["maria"]["asignacion_id"], viajes["maria"]["camion_id"]
_, antes, _ = pedir("GET", f"/api/asignaciones/{viaje_maria}", admin)

resultados = []


def prueba(requisito, descripcion, esperado, obtenido, extra=True):
    resultados.append((requisito, descripcion, esperado, obtenido, obtenido == esperado and bool(extra)))


# ---------- JWT ----------
codigo, _, _ = pedir("GET", "/api/envios")
prueba("JWT", "Pedir envíos sin token", 401, codigo)
codigo, _, _ = pedir("GET", "/api/envios", alterar_token(consulta, sub="admin", scope="usuarios:admin catalogos:escribir"))
prueba("JWT", "Token alterado para hacerse pasar por admin", 401, codigo)
codigo, _, _ = pedir("POST", "/api/auth/token", form={"username": "admin", "password": "incorrecta"})
prueba("JWT", "Login con contraseña incorrecta", 401, codigo)
codigo, yo, _ = pedir("GET", "/api/auth/yo", consulta)
prueba("JWT", "Control: con token válido sí entra", 200, codigo, yo and yo["usuario"] == "consulta")

# ---------- Roles ----------
codigo, _, _ = pedir("POST", "/api/ubicaciones", consulta, datos={"nombre": "X", "latitud": 1, "longitud": 1})
prueba("Roles", "Rol consulta intenta crear una ubicación", 403, codigo)
codigo, _, _ = pedir("GET", "/api/usuarios", operador)
prueba("Roles", "Rol operador intenta administrar usuarios", 403, codigo)
codigo, _, _ = pedir("GET", "/api/envios", juan)
prueba("Roles", "Rol conductor intenta leer el catálogo de envíos", 403, codigo)
codigo, _, _ = pedir("POST", "/api/asignaciones/automatica", consulta)
prueba("Roles", "Rol consulta intenta ejecutar el modelo", 403, codigo)
codigo, _, _ = pedir("GET", "/api/usuarios", admin)
prueba("Roles", "Control: el admin sí administra usuarios", 200, codigo)

# ---------- BOLA / IDOR ----------
codigo, propio, _ = pedir("GET", "/api/conductor/viaje", juan)
prueba("BOLA/IDOR", "Control: Juan ve SU viaje", 200, codigo, propio and propio["camion_id"] != camion_maria)
codigo, ajeno, _ = pedir("GET", f"/api/conductor/viajes/{viaje_maria}", juan)
prueba("BOLA/IDOR", f"Juan abre el viaje {viaje_maria} de María cambiando el id", 404, codigo)
codigo, inexistente, _ = pedir("GET", "/api/conductor/viajes/999999", juan)
igual = (ajeno or {}).get("detail", "").replace(str(viaje_maria), "N") == (inexistente or {}).get("detail", "").replace("999999", "N")
prueba("BOLA/IDOR", "Viaje ajeno e inexistente responden igual (no se pueden enumerar)", 404, codigo, igual)
codigo, _, _ = pedir("POST", f"/api/conductor/viajes/{viaje_maria}/iniciar", juan)
prueba("BOLA/IDOR", "Juan inicia el viaje de María", 404, codigo)
codigo, _, _ = pedir("GET", f"/api/rutas/camion/{camion_maria}", juan)
prueba("BOLA/IDOR", f"Juan pide la ruta del camión {camion_maria} de María", 404, codigo)
codigo, _, _ = pedir("POST", "/api/conductor/ubicacion", juan, datos={"latitud": 19.4, "longitud": -99.1, "camion_id": camion_maria})
prueba("BOLA/IDOR", "Juan manda el camion_id de María al reportar su GPS", 422, codigo)
_, despues, _ = pedir("GET", f"/api/asignaciones/{viaje_maria}", admin)
prueba("BOLA/IDOR", "El viaje de María no cambió después de los ataques", antes["estado"], despues["estado"])

# ---------- API key ----------
codigo, _, _ = pedir("GET", "/api/envios", api_key="atk_inventada")
prueba("API key", "Usar una API key inventada", 401, codigo)
codigo, _, _ = pedir("POST", "/api/api-keys", consulta, datos={"nombre": "intento", "scopes": ["catalogos:leer"]})
prueba("API key", "Rol consulta intenta crear una API key", 403, codigo)
codigo, llave, _ = pedir("POST", "/api/api-keys", admin, datos={"nombre": "Prueba de seguridad", "scopes": ["catalogos:leer"]})
prueba("API key", "El admin crea una API key de solo lectura", 201, codigo)
codigo, _, _ = pedir("GET", "/api/envios", api_key=llave["clave"])
prueba("API key", "Leer envíos con la API key", 200, codigo)
codigo, _, _ = pedir("POST", "/api/ubicaciones", api_key=llave["clave"], datos={"nombre": "X", "latitud": 1, "longitud": 1})
prueba("API key", "Escribir con la API key de solo lectura", 403, codigo)
pedir("PUT", f"/api/api-keys/{llave['id']}", admin, datos={"nombre": "Prueba de seguridad", "scopes": ["catalogos:leer"], "activo": False})
codigo, _, _ = pedir("GET", "/api/envios", api_key=llave["clave"])
prueba("API key", "Usar la API key ya revocada", 401, codigo)
pedir("DELETE", f"/api/api-keys/{llave['id']}", admin)

# ---------- Rate limit (al final: deja bloqueado el login 1 minuto) ----------
codigo, intentos, reintentar = None, 0, None
while codigo != 429 and intentos < 15:
    codigo, _, hdrs = pedir("POST", "/api/auth/token", form={"username": "admin", "password": "incorrecta"})
    reintentar = hdrs.get("retry-after")
    intentos += 1
prueba("Rate limit", f"Intentos de login seguidos hasta el bloqueo ({intentos} más)", 429, codigo, reintentar)

# ---------- Reporte ----------
print(f"\nPruebas de seguridad contra {BASE}\n")
print("| # | Requisito | Prueba | Esperado | Obtenido | Resultado |")
print("|---|---|---|---|---|---|")
for i, (requisito, descripcion, esperado, obtenido, ok) in enumerate(resultados, 1):
    print(f"| {i} | {requisito} | {descripcion} | {esperado} | {obtenido} | {'✅ Pasa' if ok else '❌ FALLA'} |")
aprobadas = sum(1 for r in resultados if r[4])
print(f"\n{aprobadas}/{len(resultados)} pruebas pasaron.")
sys.exit(0 if aprobadas == len(resultados) else 1)
