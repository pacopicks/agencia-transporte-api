@echo off
REM Arranca la API y la abre a tu red Wi-Fi para probar la app movil desde el celular.
REM OJO: cualquiera en tu red podra entrar; cambia las contrasenas de prueba si la red no es de confianza.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Primero ejecuta iniciar.bat una vez para instalar todo.
    pause
    exit /b 1
)
if not exist "frontend\dist\movil\index.html" (
    echo Primero ejecuta iniciar.bat una vez para compilar el panel y la app.
    pause
    exit /b 1
)

echo.
echo   En tu celular (conectado a la MISMA red Wi-Fi) abre:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=* delims= " %%b in ("%%a") do echo      http://%%b:8000/movil/
echo.
echo   Si Windows pregunta por el firewall, permite el acceso en redes privadas.
echo   Sin https el navegador no deja usar el GPS ni instalar la app (ver README).
echo   (Ctrl+C para detener)
echo.
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000