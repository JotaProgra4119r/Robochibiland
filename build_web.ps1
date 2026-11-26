param(
    [switch]$DebugBuild
)
$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    if ($DebugBuild) {
        cargo build -p robochibi-web --target wasm32-unknown-unknown
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        wasm-bindgen --target web --out-dir public/pkg target/wasm32-unknown-unknown/debug/robochibi_web.wasm
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
        cargo build -p robochibi-web --target wasm32-unknown-unknown --release
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        wasm-bindgen --target web --out-dir public/pkg target/wasm32-unknown-unknown/release/robochibi_web.wasm
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    Write-Host "✅ RoboChibiLand WASM (WebGL2 + WebGPU) generado en public/pkg/" -ForegroundColor Green
} finally {
    Pop-Location
}
