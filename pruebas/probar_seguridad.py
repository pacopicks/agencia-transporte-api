"""Prueba los requisitos de seguridad de la tarea desde un cliente externo:
JWT, roles, BOLA/IDOR, API key y rate limit.

Uso (desde cualquier computadora que llegue al servidor):
    python3 pruebas/probar_seguridad.py http://IP-DEL-SERVIDOR:8000

Necesita los datos de ejemplo (CARGAR_DEMO=true). Solo usa la librería estándar de Python.
La última prueba agota a propósito el límite de login: espera 1 minuto antes de volver a correrlo.
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
        with urllib.request.urlopen(peticion, timeout=15) as r:
            codigo, texto, hdrs = r.status, r.read().decode(), dict(r.headers)
    except urllib.error.HTTPError as e:
        codigo, texto, hdrs = e.code, e.read().decode(), dict(e.headers)
    except urllib.error.URLError as e:
        sys.exit(f"No se pudo conectar a {BASE}: {e.reason}. ¿La API está encendida y el puerto abierto?")
    try:
        return codigo, json.loads(texto) if texto else None, hdrs
    except json.JSONDecodeError:
        return codigo, texto, hdrs


def login(usuario, password):
    codigo, datos, _ = pedir("POST", "/api/auth/login", form={"username": usuario, "password": password})
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


# ---------- Preparación (3 inicios de sesión) ----------
admin = login("admin", "admin123")
cliente1 = login("cliente1", "cliente123")
juan = login("juan", "juan123")

_, usuarios, _ = pedir("GET", "/api/usuarios", admin)
_, camiones, _ = pedir("GET", "/api/camiones", admin)
_, envios, _ = pedir("GET", "/api/envios", admin)
ids = {u["usuario"]: u["id"] for u in usuarios}
camion_maria = next(c["id"] for c in camiones if c["conductor_id"] == ids["maria"])
envio_cliente2 = next(e for e in envios if e["cliente_id"] == ids["cliente2"] and e["estado"] in ("pendiente", "asignado"))
envio_maria = next(e for e in envios if e["camion_id"] == camion_maria and e["estado"] == "asignado")

resultados = []


def prueba(requisito, descripcion, esperado, obtenido, extra=True):
    resultados.append((requisito, descripcion, esperado, obtenido, obtenido == esperado and extra))


# ---------- JWT ----------
codigo, _, _ = pedir("GET", "/api/envios")
prueba("JWT", "Pedir envíos sin token", 401, codigo)
codigo, _, _ = pedir("GET", "/api/envios", alterar_token(cliente1, sub=str(ids["admin"]), rol="admin"))
prueba("JWT", "Token alterado para hacerse pasar por admin", 401, codigo)
codigo, _, _ = pedir("POST", "/api/auth/login", form={"username": "admin", "password": "incorrecta"})
prueba("JWT", "Login con contraseña incorrecta", 401, codigo)
codigo, yo, _ = pedir("GET", "/api/auth/yo", cliente1)
prueba("JWT", "Control: con token válido sí entra", 200, codigo, yo and yo["usuario"] == "cliente1")

# ---------- Roles ----------
codigo, _, _ = pedir("GET", "/api/usuarios", cliente1)
prueba("Roles", "Cliente intenta ver la lista de usuarios", 403, codigo)
codigo, _, _ = pedir("POST", "/api/camiones", cliente1, datos={"placa": "HACK-1", "capacidad_kg": 1})
prueba("Roles", "Cliente intenta registrar un camión", 403, codigo)
codigo, _, _ = pedir("POST", "/api/envios/asignar-automatico", juan)
prueba("Roles", "Conductor intenta ejecutar la asignación", 403, codigo)
codigo, _, _ = pedir("POST", "/api/envios", juan, datos={"origen": "A", "destino": "B", "peso_kg": 1})
prueba("Roles", "Conductor intenta crear un envío", 403, codigo)
codigo, _, _ = pedir("GET", "/api/usuarios", admin)
prueba("Roles", "Control: el admin sí ve los usuarios", 200, codigo)

# ---------- BOLA / IDOR ----------
codigo, lista, _ = pedir("GET", "/api/envios", cliente1)
prueba("BOLA/IDOR", "La lista de cliente1 solo trae SUS envíos", 200, codigo,
       bool(lista) and all(e["cliente_id"] == ids["cliente1"] for e in lista))
codigo, ajeno, _ = pedir("GET", f"/api/envios/{envio_cliente2['id']}", cliente1)
prueba("BOLA/IDOR", f"Cliente1 abre el envío {envio_cliente2['id']} de cliente2 cambiando el id", 404, codigo)
codigo, inexistente, _ = pedir("GET", "/api/envios/999999", cliente1)
igual = (ajeno or {}).get("detail", "").replace(str(envio_cliente2["id"]), "N") == (inexistente or {}).get("detail", "").replace("999999", "N")
prueba("BOLA/IDOR", "Envío ajeno e inexistente responden igual (no se pueden enumerar)", 404, codigo, igual)
codigo, _, _ = pedir("POST", f"/api/envios/{envio_cliente2['id']}/cancelar", cliente1)
prueba("BOLA/IDOR", "Cliente1 cancela el envío de cliente2", 404, codigo)
codigo, _, _ = pedir("POST", "/api/envios", cliente1,
                     datos={"origen": "A", "destino": "B", "peso_kg": 1, "cliente_id": ids["cliente2"]})
prueba("BOLA/IDOR", "Cliente1 crea un envío a nombre de cliente2 (cliente_id en el cuerpo)", 422, codigo)
codigo, _, _ = pedir("GET", f"/api/envios/{envio_maria['id']}", juan)
prueba("BOLA/IDOR", f"Juan abre el envío {envio_maria['id']} del camión de María", 404, codigo)
codigo, _, _ = pedir("POST", f"/api/envios/{envio_maria['id']}/entregar", juan)
prueba("BOLA/IDOR", "Juan marca como entregado el envío de María", 404, codigo)
codigo, lista_juan, _ = pedir("GET", "/api/envios", juan)
prueba("BOLA/IDOR", "La lista de Juan solo trae envíos de SU camión", 200, codigo,
       all(e["camion_id"] != camion_maria for e in lista_juan or []))
_, despues, _ = pedir("GET", f"/api/envios/{envio_maria['id']}", admin)
_, despues2, _ = pedir("GET", f"/api/envios/{envio_cliente2['id']}", admin)
prueba("BOLA/IDOR", "Los envíos atacados no cambiaron de estado", "sin cambios",
       "sin cambios" if despues["estado"] == envio_maria["estado"] and despues2["estado"] == envio_cliente2["estado"] else "cambiaron")

# ---------- API key ----------
codigo_rastreo = envio_cliente2["codigo"]
codigo, _, _ = pedir("GET", f"/api/rastreo/{codigo_rastreo}")
prueba("API key", "Rastreo sin el encabezado X-API-Key", 401, codigo)
codigo, _, _ = pedir("GET", f"/api/rastreo/{codigo_rastreo}", api_key="atk_inventada")
prueba("API key", "Rastreo con una API key inventada", 401, codigo)
codigo, _, _ = pedir("POST", "/api/api-keys", cliente1, datos={"nombre": "intento"})
prueba("API key", "Un cliente intenta crear una API key", 403, codigo)
codigo, llave, _ = pedir("POST", "/api/api-keys", admin, datos={"nombre": "Prueba de seguridad"})
prueba("API key", "El admin crea una API key", 201, codigo)
codigo, rastreo, _ = pedir("GET", f"/api/rastreo/{codigo_rastreo}", api_key=llave["clave"])
prueba("API key", "Rastreo con la API key válida (sin datos del cliente)", 200, codigo,
       rastreo and "cliente_id" not in rastreo and "camion_id" not in rastreo)
pedir("DELETE", f"/api/api-keys/{llave['id']}", admin)
codigo, _, _ = pedir("GET", f"/api/rastreo/{codigo_rastreo}", api_key=llave["clave"])
prueba("API key", "Rastreo con la API key ya revocada", 401, codigo)

# ---------- Rate limit (al final: deja bloqueado el login 1 minuto) ----------
codigo, intentos, reintentar = None, 0, None
while codigo != 429 and intentos < 10:
    codigo, _, hdrs = pedir("POST", "/api/auth/login", form={"username": "admin", "password": "incorrecta"})
    reintentar = {k.lower(): v for k, v in hdrs.items()}.get("retry-after")
    intentos += 1
prueba("Rate limit", f"Intentos de login seguidos hasta el bloqueo ({intentos} más)", 429, codigo, reintentar is not None)

# ---------- Reporte ----------
print(f"\nPruebas de seguridad contra {BASE}\n")
print("| # | Requisito | Prueba | Esperado | Obtenido | Resultado |")
print("|---|---|---|---|---|---|")
for i, (requisito, descripcion, esperado, obtenido, ok) in enumerate(resultados, 1):
    print(f"| {i} | {requisito} | {descripcion} | {esperado} | {obtenido} | {'✅ Pasa' if ok else '❌ FALLA'} |")
aprobadas = sum(1 for r in resultados if r[4])
print(f"\n{aprobadas}/{len(resultados)} pruebas pasaron.")
sys.exit(0 if aprobadas == len(resultados) else 1)
