param(
    [switch]$DebugBuild
)
$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    if ($DebugBuild) {
        cargo build -p robochibi-web --target wasm32-unknown-unknown
        wasm-bindgen --target web --out-dir public/pkg target/wasm32-unknown-unknown/debug/robochibi_web.wasm
    } else {
        cargo build -p robochibi-web --target wasm32-unknown-unknown --release
        wasm-bindgen --target web --out-dir public/pkg target/wasm32-unknown-unknown/release/robochibi_web.wasm
    }
    Write-Host "✅ RoboChibiLand WASM (WebGL2 + WebGPU) generado en public/pkg/" -ForegroundColor Green
} finally {
    Pop-Location
}
