# Guía: subir la API a Ubuntu Server en una máquina virtual

Al terminar, la API, el **panel web** y la **app móvil** van a quedar corriendo en la máquina virtual (VM) como un servicio que arranca solo. Se van a poder usar desde **otra computadora o un celular** (el cliente externo):

| Qué | Dirección |
|---|---|
| Panel web | `http://IP-DE-LA-VM:8000` |
| App móvil | `http://IP-DE-LA-VM:8000/movil/` |
| Documentación de la API (Swagger) | `http://IP-DE-LA-VM:8000/docs` |

**No hace falta Node.js:** el panel y la app ya van compilados en el repositorio (`frontend/dist`). El servidor solo necesita Python y PostgreSQL.

Tiempo aproximado: 30 a 45 minutos.

---

## 0. Antes de empezar

- **El repositorio es público:** no necesitas cuenta de GitHub ni invitación para descargarlo.
- **Software de la VM:** [VirtualBox](https://www.virtualbox.org/) (esta guía lo usa) o VMware.
- **Ubuntu Server 24.04 LTS:** [descarga la ISO](https://ubuntu.com/download/server). 22.04 también funciona.
- **VM recomendada:** 2 GB de RAM, 2 CPU y 20 GB de disco.

En los comandos, lo que está en `MAYÚSCULAS` lo cambias por tus datos.

## 1. Crear la VM e instalar Ubuntu Server

1. En VirtualBox: **Nueva**, elige la ISO de Ubuntu Server y asigna la RAM, las CPU y el disco.
2. Instala Ubuntu con las opciones normales. Dos cosas importantes:
   - Crea tu usuario y contraseña. Los vas a usar para entrar.
   - Cuando pregunte por **SSH**, marca **"Install OpenSSH server"**.
3. Al terminar, reinicia y entra con tu usuario.

## 2. Configurar la red de la VM (lo más importante)

Para que otra computadora pueda entrar a la API, la VM necesita su propia IP en la red.

1. Apaga la VM.
2. En VirtualBox: VM → **Configuración → Red → Adaptador 1**.
3. **Conectado a:** `Adaptador puente` (*Bridged Adapter*).
4. **Nombre:** elige la tarjeta con la que tu computadora tiene internet (normalmente la de **Wi-Fi**).
5. Enciende la VM y consulta su IP:
   ```bash
   ip -4 addr show | grep inet
   ```
   Busca una como `192.168.x.x` o `10.x.x.x`; ignora `127.0.0.1`. **Esa es la IP-DE-LA-VM.**

> **En VMware** elige *Bridged*; **en Hyper-V**, un *switch virtual externo*.
>
> **Si la red no le da IP a la VM** (pasa en algunas redes escolares): conecta la computadora a la **zona Wi-Fi de un celular**, o mira *"No puedo entrar desde otra compu"* en Problemas comunes.

## 3. Conectarte por SSH (para copiar y pegar comandos)

Escribir en la ventana de la VM es incómodo. Desde tu computadora (PowerShell en Windows o la Terminal en Mac/Linux):

```bash
ssh TU_USUARIO@IP-DE-LA-VM
```

Escribe `yes` la primera vez y luego tu contraseña de Ubuntu. Desde aquí todos los comandos se pegan en esa sesión.

## 4. Instalar los programas

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip postgresql git curl
```

## 5. Crear la base de datos

Elige una contraseña para la base, **solo con letras y números** (los símbolos como `@ : / #` rompen la conexión), y guárdala en una variable:

```bash
DB_PASS='ESCRIBE_AQUI_TU_CLAVE'
sudo -u postgres psql -c "CREATE USER transporte WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE transporte OWNER transporte;"
```

Deben salir `CREATE ROLE` y `CREATE DATABASE`.

> La variable `DB_PASS` solo dura mientras no cierres la sesión SSH. Si te desconectas antes del paso 8, vuelve a escribir la línea `DB_PASS=...`.

## 6. Descargar el código

El repositorio es público, así que se descarga sin iniciar sesión:

```bash
cd ~
git clone https://github.com/pacopicks/agencia-transporte-api.git
cd agencia-transporte-api
ls
```

Debes ver `app`, `frontend`, `pruebas`, `requirements.txt`, etc.

## 7. Instalar las dependencias de Python

```bash
cd ~/agencia-transporte-api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Tarda un par de minutos porque descarga NumPy y SciPy (los usa el modelo de asignación).

## 8. Configurar el archivo `.env`

```bash
cd ~/agencia-transporte-api
cp .env.example .env
SECRETO=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$SECRETO|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql+psycopg://transporte:$DB_PASS@localhost:5432/transporte|" .env
cat .env
```

Revisa que `DATABASE_URL` tenga tu contraseña y que `SECRET_KEY` sea un texto largo. Si quieres editar algo más: `nano .env` (guardas con `Ctrl+O`, `Enter` y sales con `Ctrl+X`).

> Para la presentación deja `ADMIN_PASSWORD=admin123` y `CARGAR_DEMO=true`, porque los scripts de prueba usan los usuarios de ejemplo. En un uso real se cambian.

## 9. Prueba rápida

```bash
cd ~/agencia-transporte-api
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Debe decir `Application startup complete`. En **otra computadora** de la red abre `http://IP-DE-LA-VM:8000`: debe salir el login del panel. Regresa a la terminal y detén la prueba con **`Ctrl+C`**.

## 10. Dejarla como servicio (arranca sola)

Copia y pega todo el bloque tal cual. Toma tu usuario y tu carpeta automáticamente:

```bash
sudo tee /etc/systemd/system/transporte-api.service > /dev/null << EOF
[Unit]
Description=API Agencia de Transporte
After=network.target postgresql.service

[Service]
User=$USER
WorkingDirectory=$HOME/agencia-transporte-api
ExecStart=$HOME/agencia-transporte-api/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now transporte-api
systemctl status transporte-api --no-pager
```

Debe decir **`active (running)`** en verde. Desde ahora la API arranca sola cada vez que se prende la VM.

> Usa un solo proceso de uvicorn (no agregues `--workers`): el rate limiter guarda sus contadores en memoria.

## 11. Abrir el firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8000/tcp
sudo ufw --force enable
sudo ufw status
```

Deben aparecer `OpenSSH` y `8000/tcp` como `ALLOW`. El orden importa: si activas el firewall sin permitir `OpenSSH`, se cae tu sesión SSH.

## 12. Probar desde el cliente externo

Usuarios de ejemplo:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | admin (todo, incluidas las API keys) |
| `operador` | `operador123` | operador |
| `consulta` | `consulta123` | solo lectura |
| `juan` / `maria` | `juan123` / `maria123` | conductores (app móvil) |

**Panel web:** abre `http://IP-DE-LA-VM:8000` en otra computadora y entra como `admin`.

**App móvil:** abre `http://IP-DE-LA-VM:8000/movil/` en un celular conectado a la **misma red** y entra como `juan`. Funciona por `http`, pero el navegador solo permite **GPS e "Instalar app"** con `https` (paso 13).

**Swagger:**
1. Abre `http://IP-DE-LA-VM:8000/docs`.
2. Da clic en **Authorize → OAuth2PasswordBearer**, escribe usuario y contraseña (deja los scopes sin marcar) y da **Authorize**.

**Scripts de prueba** (en la computadora que tiene el proyecto y Python):

```bash
python pruebas/probar_seguridad.py http://IP-DE-LA-VM:8000   # 23/23: JWT, roles, BOLA, API key, rate limit
python pruebas/bola_idor.py http://IP-DE-LA-VM:8000          # 20/20: ataques BOLA/IDOR
```

`probar_seguridad.py` deja el login bloqueado 1 minuto al final (prueba del rate limit). Corre primero `bola_idor.py`, o espera ese minuto entre uno y otro.

**Con curl** (desde Linux o Mac, o desde el *Símbolo del sistema* `cmd` de Windows; en PowerShell es más fácil usar Swagger):

```bash
# 1. Iniciar sesión (JWT)
curl -X POST http://IP-DE-LA-VM:8000/api/auth/token -d "username=admin&password=admin123"

# 2. Usar el token
curl http://IP-DE-LA-VM:8000/api/envios -H "Authorization: Bearer PEGA_AQUI_EL_TOKEN"

# 3. Crear una API key de solo lectura (con el token del admin) y usarla
curl -X POST http://IP-DE-LA-VM:8000/api/api-keys -H "Authorization: Bearer TOKEN_ADMIN" -H "Content-Type: application/json" -d "{\"nombre\": \"demo\", \"scopes\": [\"catalogos:leer\"]}"
curl http://IP-DE-LA-VM:8000/api/envios -H "X-API-Key: PEGA_AQUI_LA_LLAVE"
```

## 13. (Opcional) App móvil con GPS: https con Cloudflare

Para que el celular pueda **instalar la app y mandar el GPS** hace falta `https`. Lo más fácil es un túnel temporal de Cloudflare, sin cuenta:

```bash
cd ~
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared tunnel --url http://localhost:8000
```

Aparece una dirección `https://….trycloudflare.com`. Ábrela en el celular, agrégale `/movil/` al final y elige **"Instalar app"** o **"Agregar a pantalla principal"**.

> Mientras el túnel esté abierto, **cualquiera con el enlace puede llegar a la API**. Úsalo solo para la demostración y ciérralo con `Ctrl+C`. Si la VM es ARM (por ejemplo en una Mac con chip M), cambia `amd64` por `arm64`.

## 14. Comandos útiles

| Para… | Comando |
|---|---|
| Ver si está corriendo | `systemctl status transporte-api --no-pager` |
| Ver los logs en vivo | `journalctl -u transporte-api -f` (`Ctrl+C` para salir) |
| Reiniciar (por ejemplo después de editar `.env`) | `sudo systemctl restart transporte-api` |
| Quitar el bloqueo del rate limit antes del minuto | `sudo systemctl restart transporte-api` |
| Actualizar a la última versión del repo | `cd ~/agencia-transporte-api && git pull && .venv/bin/pip install -r requirements.txt && sudo systemctl restart transporte-api` |
| Ver la IP de la VM | `ip -4 addr show \| grep inet` |

**Dejar los datos de ejemplo como nuevos** (por ejemplo antes de presentar):

```bash
sudo systemctl stop transporte-api
sudo -u postgres psql -c "DROP DATABASE transporte;"
sudo -u postgres psql -c "CREATE DATABASE transporte OWNER transporte;"
sudo systemctl start transporte-api
```

## 15. Problemas comunes

| Problema | Solución |
|---|---|
| **No puedo entrar desde otra compu** | 1) Adentro de la VM, `curl http://localhost:8000/api/salud` debe responder `{"estado":"ok"}`; si no, revisa el servicio (paso 10). 2) La red de la VM debe estar en **Adaptador puente** (paso 2). 3) `sudo ufw status` debe permitir `8000/tcp`. 4) Las dos computadoras deben estar en la **misma red**. Algunas redes escolares bloquean la comunicación entre equipos; usa la zona Wi-Fi de un celular. |
| La VM no recibe IP con Adaptador puente | Cambia en *Nombre* la tarjeta correcta (Wi-Fi o Ethernet), o usa **NAT con reenvío de puertos**: *Red → Adaptador 1 → NAT → Avanzadas → Reenvío de puertos*, regla TCP con puerto anfitrión `8000` y puerto invitado `8000`. Así se entra con `http://IP-DE-TU-COMPU:8000`, y Windows debe permitir VirtualBox en su firewall. Con NAT, todos los clientes comparten el mismo contador del rate limit. |
| Se abre `/docs` pero `http://IP:8000` sale en blanco o con 404 | Falta la carpeta `frontend/dist`. Revisa que el `git clone` o el `git pull` terminaran bien (`ls frontend/dist` debe mostrar `index.html`). |
| `status` dice `failed` | Revisa el error con `journalctl -u transporte-api -n 50 --no-pager`. |
| `password authentication failed for user "transporte"` | La contraseña de `DATABASE_URL` en `.env` no coincide con la del paso 5. Corrige `.env` y reinicia el servicio. |
| `No module named ...` | Te faltó el paso 7 o lo corriste en otra carpeta. |
| `429 Demasiadas peticiones` | Es el rate limit funcionando. Espera 1 minuto o reinicia el servicio. |
| En la app el GPS dice que necesita https | Es normal por `http`. Usa el paso 13. |
| El mapa sale gris | El fondo del mapa necesita que el **navegador** tenga internet; las rutas se dibujan igual. |
