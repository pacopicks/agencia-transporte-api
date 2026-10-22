@echo off
REM Arranca la API en Windows. Queda accesible desde otros equipos de tu red en el puerto 8000.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual de Python...
    python -m venv .venv || goto :error
)
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt || goto :error

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Se creo el archivo .env: pon la contrasena de tu usuario postgres en DATABASE_URL
    echo y vuelve a ejecutar este archivo.
    pause
    exit /b 1
)

echo.
echo   Documentacion en esta computadora:  http://localhost:8000/docs
echo   Desde otro equipo de tu red:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=* delims= " %%b in ("%%a") do echo      http://%%b:8000/docs
echo   (Ctrl+C para detener)
echo.
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
goto :eof

:error
echo Ocurrio un error. Revisa el mensaje de arriba.
pause
exit /b 1
