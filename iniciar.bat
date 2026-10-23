@echo off
title RoboChibi 3D - Servidor
cd /d "%~dp0"

echo =========================================================
echo    ROBO CHIBI 3D - MUNDO VIRTUAL CON IA
echo =========================================================

echo [1/3] Verificando Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR CRITICO] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Node.js version LTS desde https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [2/3] Verificando puerto 3000 y procesos previos...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   Liberando puerto 3000 ocupado por proceso PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1

echo [3/3] Verificando dependencias y frontend...
if not exist "node_modules\express" (
    echo   Instalando dependencias de Node.js...
    call npm install
)

if not exist "public\bundle.js" (
    echo   Compilando recursos del juego...
    call npm run build
)

echo.
echo =========================================================
echo   Iniciando Servidor RoboChibi...
echo =========================================================
echo.
echo Abriendo navegador en tu PC...
start http://localhost:3000

node server.js

if errorlevel 1 (
    echo.
    echo [AVISO] El servidor se ha detenido inesperadamente.
    pause
)
