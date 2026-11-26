@echo off
title RoboChibi 3D - Cliente Nativo Vulkan (Rust)
cd /d "%~dp0"

echo =========================================================
echo    ROBO CHIBI 3D - NATIVO RUST (VULKAN / DX12 + EGUI)
echo =========================================================

where cargo >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Rust (cargo) no esta instalado en PATH.
    pause
    exit /b 1
)

cargo run --release -p robochibi-native -- --gfx vulkan

if errorlevel 1 (
    echo.
    echo [AVISO] La aplicacion nativa se ha cerrado con error.
    pause
)
