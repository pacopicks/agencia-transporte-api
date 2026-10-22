# Cómo correr la API de transporte

Pasos para encender la API en la laptop y usarla desde el panel web, la app móvil y la documentación, más las pruebas de seguridad para la presentación.

> Hay una versión de esta guía para abrir en el navegador: [`docs/como-correr-la-api.html`](docs/como-correr-la-api.html). Para subir la API a un servidor Ubuntu en VirtualBox, ve [GUIA-UBUNTU.md](GUIA-UBUNTU.md).

## Referencia rápida

| Qué | Dirección |
|---|---|
| Panel web | `http://192.168.100.43:8000` |
| App móvil | `http://192.168.100.43:8000/movil/` |
| Documentación (Swagger) | `http://192.168.100.43:8000/docs` |
| Solo en la laptop | `http://localhost:8000` |

La IP `192.168.100.43` es la de la red de casa. Si cambias de red (por ejemplo en la escuela), usa la que muestre `iniciar-red.bat` en ese momento.

| Usuario | Contraseña | Rol | Dónde se usa |
|---|---|---|---|
| `admin` | `admin123` | Administrador | Todo, incluidos usuarios y API keys |
| `operador` | `operador123` | Operador | Editar catálogos y ejecutar el modelo |
| `consulta` | `consulta123` | Consulta | Solo lectura, sin botones de edición |
| `juan` | `juan123` | Conductor | App móvil, camión 71-AK-3D |
| `maria` | `maria123` | Conductor | App móvil, camión 52-BN-8F |

## 1. Encender la API

En la laptop donde está el proyecto. PostgreSQL arranca solo con Windows.

1. Abre PowerShell (o la terminal de VS Code) y escribe:
   ```powershell
   cd B:\API
   .\iniciar-red.bat
   ```
2. Espera a que aparezca `Uvicorn running on http://0.0.0.0:8000`.
3. Anota la dirección que muestra y que empieza con `192.168.100.`. Ignora la `192.168.56.1`, que es de VirtualBox.
4. Si Windows pregunta por el firewall, da clic en **Permitir**.

> ⚠️ No cierres esa ventana: si la cierras, la API se apaga.

## 2. Panel web

1. Abre en el navegador `http://localhost:8000` si estás en la laptop, o `http://192.168.100.43:8000` desde otra computadora del mismo Wi-Fi.
2. Entra con `admin` / `admin123`.
3. Ve a **Asignaciones → Ejecutar modelo** para que los camiones reciban sus viajes.
4. Revisa **Mapa y rutas**, **Envíos**, **Camiones**, **Usuarios** y **API keys**.
5. Cierra sesión con el ícono de salir (arriba a la derecha) y entra como `consulta` / `consulta123`: ya no aparecen los botones de editar.

## 3. App móvil

1. Conecta el celular al **mismo Wi-Fi** que la laptop.
2. Abre Safari o Chrome en `http://192.168.100.43:8000/movil/`.
3. Entra como `juan` / `juan123`. Escribe la contraseña a mano y en minúsculas, sin elegir sugerencias del teclado.
4. En **Mi viaje**: revisa el mapa, toca **Iniciar viaje** y después **Confirmar entrega**.
5. Para probar BOLA/IDOR:
   - Ve a **Historial** y abre un viaje.
   - En la barra de direcciones cambia el número del final por el de un viaje de María (por ejemplo `#/historial/2`).
   - Debe salir **"No se encontró el viaje"**.
6. En **Perfil → Cerrar sesión**, y entra como `admin`: verás las pestañas Inicio, Asignaciones, Envíos y Flota.

Por `http` la app funciona completa, pero el navegador no permite el GPS ni el botón "Instalar app": esas dos cosas necesitan `https`.

## 4. Documentación de la API (Swagger)

1. Abre `http://192.168.100.43:8000/docs`.
2. Da clic en **Authorize**, escribe usuario y contraseña (deja los scopes sin marcar) y da **Authorize**.
3. En cualquier endpoint usa **Try it out → Execute** para probarlo.

## 5. Pruebas automáticas de seguridad

Opcional, para la presentación. Con la API encendida, abre **otra** terminal y corre las dos pruebas en este orden:

```powershell
cd B:\API
.venv\Scripts\python pruebas\bola_idor.py http://192.168.100.43:8000
.venv\Scripts\python pruebas\probar_seguridad.py http://192.168.100.43:8000
```

Deben terminar con **20/20** y **23/23** pruebas pasadas. La segunda deja el login bloqueado 1 minuto al final, porque así se demuestra el rate limit.

## 6. Apagar

En la terminal donde corre la API presiona `Ctrl+C`, o cierra esa ventana.

## Para la presentación

| Requisito | Cómo mostrarlo |
|---|---|
| **JWT** | El login del panel o de la app. En Swagger, un endpoint sin *Authorize* responde 401. |
| **Roles** | Entrar como `admin`, `consulta` y `juan`: cada uno ve un menú distinto, y `consulta` no puede editar. |
| **BOLA/IDOR** | En la app, `juan` cambia el número del viaje en la dirección: "No se encontró el viaje". Explicado en [ANALISIS-BOLA-IDOR.md](ANALISIS-BOLA-IDOR.md). |
| **API key** | Panel web, sección **API keys**: crear una (se ve una sola vez) y revocarla. |
| **Rate limit** | Equivocarse 10 veces seguidas en el login: aparece "Demasiadas peticiones. Intenta de nuevo en N s." |

## Si algo falla

| Problema | Solución |
|---|---|
| "No se pudo conectar a PostgreSQL" | Busca **Servicios** en el menú Inicio de Windows y enciende `postgresql-x64-18`. |
| En el celular o en la otra computadora no carga | Revisa que estén en el mismo Wi-Fi y que uses la IP, no `localhost`. Si sigue sin cargar, abre PowerShell como administrador y abre el puerto con el comando de abajo. |
| "Usuario o contraseña incorrectos" con datos correctos | El teclado del celular pudo poner mayúscula o un espacio. Borra la contraseña y escríbela a mano: `admin123` son exactamente 8 caracteres. |
| "Demasiadas peticiones. Intenta de nuevo en N s." | Es el rate limit: se permiten 10 intentos de login por minuto. Espera los segundos que indica. |
| El conductor dice "No tienes viajes por ahora" | Entra como `admin` y ejecuta el modelo: en la web en Asignaciones, en la app en Inicio. |

Comando para abrir el puerto 8000 en el firewall (PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "API Transporte 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
```
