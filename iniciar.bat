@echo off
REM Arranca la API y el panel web en http://localhost:8000
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual de Python...
    python -m venv .venv || goto :error
)
echo Instalando dependencias de Python...
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt || goto :error

if not exist "frontend\dist\index.html" (
    echo Compilando el panel web ^(React^)...
    pushd frontend
    call npm install || goto :error
    call npm run build || goto :error
    popd
)

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo.
    echo Se creo el archivo .env. Abrelo, pon la contrasena de tu usuario postgres
    echo en DATABASE_URL y vuelve a ejecutar este archivo.
    pause
    exit /b 1
)

echo.
echo   Panel web:      http://localhost:8000
echo   Documentacion:  http://localhost:8000/docs
echo   (Ctrl+C para detener)
echo.
".venv\Scripts\python.exe" -m uvicorn app.main:app --reload
goto :eof

:error
echo.
echo Ocurrio un error. Revisa el mensaje de arriba.
pause
exit /b 1
