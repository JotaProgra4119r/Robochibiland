@echo off
title RoboChibi 3D - Servidor Rust
cd /d "%~dp0"

echo =========================================================
echo    ROBO CHIBI 3D - CYBERPUP WORLD (RUST + WEBGL2/WEBGPU)
echo =========================================================

echo [1/3] Verificando puerto 3000 y procesos previos...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   Liberando puerto 3000 ocupado por proceso PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1

echo [2/3] Verificando compilacion WebAssembly (public\pkg)...
where cargo >nul 2>&1
if not errorlevel 1 (
    if not exist "public\pkg\robochibi_web.js" (
        echo   Generando WASM (WebGL2 + WebGPU)...
        powershell -ExecutionPolicy Bypass -File ".\build_web.ps1"
    )
    echo [3/3] Iniciando Servidor Rust (robochibi-server)...
    start http://localhost:3000
    cargo run --release -p robochibi-server
    goto :end
)

echo [AVISO] Cargo no encontrado en PATH; usando servidor Node.js de respaldo...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR CRITICO] Ni Rust (cargo) ni Node.js estan instalados en PATH.
    pause
    exit /b 1
)
if not exist "node_modules\express" (
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
