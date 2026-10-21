"""Pruebas automáticas de BOLA/IDOR (y de autorización por función) de la API.

Uso (con la API encendida):
    .venv\\Scripts\\python pruebas\\bola_idor.py                 # http://localhost:8000
    .venv\\Scripts\\python pruebas\\bola_idor.py http://otro:8000

Necesita los datos de ejemplo (CARGAR_DEMO=true). Inicia sesión como dos conductores
(juan = atacante, maria = víctima) y como admin. Si alguno no tiene un viaje activo,
ejecuta el modelo de asignación como admin para crearlo (eso sí modifica la base).

Los ataques intentan leer o modificar datos de María y TODOS deben fallar.
Solo usa la librería estándar de Python.
"""
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
sys.stdout.reconfigure(encoding="utf-8")


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
        with urllib.request.urlopen(peticion) as r:
            codigo, texto = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        codigo, texto = e.code, e.read().decode()
    try:
        return codigo, json.loads(texto) if texto else None
    except json.JSONDecodeError:
        return codigo, texto


def login(usuario, password, scope=None):
    form = {"username": usuario, "password": password}
    if scope:
        form["scope"] = scope
    codigo, datos = pedir("POST", "/api/auth/token", form=form)
    if codigo != 200:
        sys.exit(f"No se pudo iniciar sesión como {usuario} ({codigo}): {datos}. ¿Están cargados los datos de ejemplo?")
    return datos["access_token"]


def alterar_token(token, **cambios):
    """Cambia el contenido del JWT sin volver a firmarlo (lo que haría un atacante)."""
    cabecera, contenido, firma = token.split(".")
    datos = json.loads(base64.urlsafe_b64decode(contenido + "=" * (-len(contenido) % 4)))
    datos.update(cambios)
    nuevo = base64.urlsafe_b64encode(json.dumps(datos).encode()).decode().rstrip("=")
    return f"{cabecera}.{nuevo}.{firma}"


# ---------- Preparación ----------
admin = login("admin", "admin123")
juan = login("juan", "juan123")
maria = login("maria", "maria123")

viajes = {}
for nombre, token in (("juan", juan), ("maria", maria)):
    codigo, viaje = pedir("GET", "/api/conductor/viaje", token)
    if codigo == 404:
        print(f"(preparación) {nombre} no tiene viaje activo: ejecutando el modelo de asignación como admin…")
        pedir("POST", "/api/asignaciones/automatica", admin)
        codigo, viaje = pedir("GET", "/api/conductor/viaje", token)
    if codigo != 200:
        sys.exit(f"{nombre} no tiene un viaje activo ni después de correr el modelo ({codigo}: {viaje}).")
    viajes[nombre] = viaje

viaje_maria = viajes["maria"]["asignacion_id"]
camion_maria = viajes["maria"]["camion_id"]
camion_juan = viajes["juan"]["camion_id"]
_, usuarios = pedir("GET", "/api/usuarios", admin)
id_usuario_maria = next(u["id"] for u in usuarios if u["usuario"] == "maria")
_, antes = pedir("GET", f"/api/asignaciones/{viaje_maria}", admin)

# ---------- Pruebas ----------
resultados = []


def prueba(descripcion, esperado, obtenido, condicion_extra=True, detalle=""):
    ok = obtenido == esperado and condicion_extra
    resultados.append((descripcion, esperado, obtenido, ok, detalle))


codigo, datos = pedir("GET", "/api/conductor/viaje", juan)
prueba("Control: Juan ve SU viaje actual", 200, codigo, datos and datos["camion_id"] == camion_juan)

codigo, datos_ajeno = pedir("GET", f"/api/conductor/viajes/{viaje_maria}", juan)
prueba(f"IDOR: Juan lee el viaje {viaje_maria} de María cambiando el id", 404, codigo)

codigo, datos_inexistente = pedir("GET", "/api/conductor/viajes/999999", juan)
mismo_mensaje = (datos_ajeno or {}).get("detail", "").replace(str(viaje_maria), "N") == (
    (datos_inexistente or {}).get("detail", "").replace("999999", "N")
)
prueba("Enumeración: viaje ajeno y viaje inexistente responden igual", 404, codigo, mismo_mensaje)

codigo, _ = pedir("POST", f"/api/conductor/viajes/{viaje_maria}/iniciar", juan)
prueba("BOLA: Juan inicia el viaje de María", 404, codigo)

codigo, _ = pedir("POST", f"/api/conductor/viajes/{viaje_maria}/entregar", juan)
prueba("BOLA: Juan marca como entregado el viaje de María", 404, codigo)

codigo, _ = pedir("POST", f"/api/asignaciones/{viaje_maria}/cancelar", juan)
prueba("BFLA: Juan usa el endpoint de admin para cancelar el viaje de María", 403, codigo)

codigo, _ = pedir("GET", f"/api/asignaciones/{viaje_maria}", juan)
prueba("BFLA: Juan consulta la asignación de María en el endpoint de admin", 403, codigo)

codigo, _ = pedir("GET", f"/api/rutas/camion/{camion_maria}", juan)
prueba(f"IDOR: Juan pide la ruta del camión {camion_maria} de María", 404, codigo)

codigo, historial = pedir("GET", "/api/conductor/viajes", juan)
ids = {v["id"] for v in historial or []}
prueba("Fuga en listas: el historial de Juan no trae viajes de María", 200, codigo, viaje_maria not in ids)

codigo, _ = pedir(
    "POST", "/api/conductor/ubicacion", juan, datos={"latitud": 19.43, "longitud": -99.13, "camion_id": camion_maria}
)
prueba("Asignación masiva: Juan manda camion_id de María al reportar ubicación", 422, codigo)

codigo, posicion = pedir("POST", "/api/conductor/ubicacion", juan, datos={"latitud": 19.43, "longitud": -99.13})
prueba("Control: la ubicación de Juan se guarda en SU camión", 201, codigo, posicion and posicion["camion_id"] == camion_juan)

codigo, _ = pedir("GET", "/api/posiciones", juan)
prueba("Privacidad: Juan consulta el GPS de todos los camiones", 403, codigo)

codigo, _ = pedir("GET", f"/api/camiones/{camion_maria}", juan)
prueba("BFLA: Juan lee el camión de María en el catálogo", 403, codigo)

codigo, _ = pedir(
    "PUT", f"/api/usuarios/{id_usuario_maria}", juan,
    datos={"usuario": "maria", "nombre": "x", "rol": "conductor", "conductor_id": 2, "activo": True, "password": "hackeada1"},
)
prueba("BFLA: Juan cambia la contraseña de María por /api/usuarios", 403, codigo)

codigo, _ = pedir("GET", "/api/conductor/viaje", alterar_token(juan, sub="maria"))
prueba("Suplantación: Juan edita su JWT para decir que es María", 401, codigo)

codigo, _ = pedir("GET", "/api/conductor/viaje", alterar_token(juan, scope="usuarios:admin conductor:viaje"))
prueba("Escalada: Juan se agrega scopes de admin editando su JWT", 401, codigo)

codigo, _ = pedir("POST", "/api/auth/token", form={"username": "juan", "password": "juan123", "scope": "usuarios:admin"})
prueba("Escalada: Juan pide un token con scope usuarios:admin", 403, codigo)

codigo, llave = pedir("POST", "/api/api-keys", admin, datos={"nombre": "prueba BOLA", "scopes": ["rutas:leer"]})
if codigo == 201:
    codigo, _ = pedir("GET", "/api/conductor/viaje", api_key=llave["clave"])
    prueba("Una API key no puede usar los endpoints del conductor", 403, codigo)
    pedir("DELETE", f"/api/api-keys/{llave['id']}", admin)

codigo, _ = pedir("GET", "/api/conductor/viaje", admin)
prueba("El admin no puede operar viajes como si fuera conductor", 403, codigo)

_, despues = pedir("GET", f"/api/asignaciones/{viaje_maria}", admin)
prueba(
    "Integridad: el viaje de María no cambió después de los ataques", antes["estado"], despues["estado"],
)

# ---------- Reporte ----------
print(f"\nPruebas BOLA/IDOR contra {BASE}\n")
print("| # | Prueba | Esperado | Obtenido | Resultado |")
print("|---|---|---|---|---|")
for i, (descripcion, esperado, obtenido, ok, _) in enumerate(resultados, 1):
    print(f"| {i} | {descripcion} | {esperado} | {obtenido} | {'✅ Pasa' if ok else '❌ FALLA'} |")
aprobadas = sum(1 for r in resultados if r[3])
print(f"\n{aprobadas}/{len(resultados)} pruebas pasaron.")
sys.exit(0 if aprobadas == len(resultados) else 1)
