@echo off
title RoboChibi 3D - Servidor WebGL 60 FPS
cd /d "%~dp0"

echo =========================================================
echo    ROBO CHIBI 3D - WEBGL 60 FPS (THREE.JS + SERVIDOR)
echo =========================================================

echo [1/3] Verificando puerto 3000 y procesos previos...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   Liberando puerto 3000 ocupado por proceso PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1

echo [2/3] Verificando bundle WebGL (public\bundle.js)...
if not exist "public\bundle.js" (
    where npm >nul 2>&1
    if not errorlevel 1 (
        if not exist "node_modules\three" (
            echo   Instalando dependencias de Node.js...
            call npm install
        )
        echo   Compilando bundle WebGL...
        call npm run build
    ) else (
        echo [AVISO] npm no encontrado y falta public\bundle.js.
    )
)

echo [3/3] Iniciando Servidor...
where cargo >nul 2>&1
if not errorlevel 1 (
    echo   Usando servidor Rust (robochibi-server)...
    start http://localhost:3000
    cargo run --release -p robochibi-server
    goto :end
)

echo [AVISO] Cargo no encontrado en PATH; usando servidor Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR CRITICO] Ni Rust (cargo) ni Node.js estan instalados en PATH.
    pause
    exit /b 1
)
if not exist "node_modules\express" (
    echo   Instalando dependencias de Node.js...
    call npm install
)
start http://localhost:3000
node server.js

:end
if errorlevel 1 (
    echo.
    echo [AVISO] El servidor se ha detenido inesperadamente.
    pause
)
