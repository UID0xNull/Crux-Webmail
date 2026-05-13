# Server Build Script for Windows PowerShell
# Compiles the entire project and copies outputs to dist

$projectRoot = "$env:PWD"
$serverOutDir = Join-Path $projectRoot "dist"
$webOutDir = Join-Path $projectRoot "dist-web"

Write-Host "=== Building Crux-Webmail Server ===" -ForegroundColor Cyan

# Clean previous builds if exist
if (Test-Path $serverOutDir) { Remove-Item -Recurse -Force $serverOutDir }
if (Test-Path $webOutDir) { Remove-Item -Recurse -Force $webOutDir }

# Create output directories
New-Item -ItemType Directory -Force -Path $serverOutDir | Out-Null
New-Item -ItemType Directory -Force -Path $webOutDir | Out-Null

Write-Host "Running TypeScript compiler from project root..." -ForegroundColor Yellow

# Run tsc from npm scripts (this will compile everything including server and web)
& "$projectRoot\node_modules\.bin\tsc.cmd" --noEmit

if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed!" -ForegroundColor Red
    throw "Build failed"
}

Write-Host "=== Copying compiled files to dist directories ===" -ForegroundColor Cyan

# Copy server entry point and common files
Copy-Item -Recurse "$projectRoot\src\server\distributors" $serverOutDir -ErrorAction SilentlyContinue
Copy-Item -Recurse "$projectRoot\src\server\handlers" $serverOutDir -ErrorAction SilentlyContinue

# Copy web assets to their dist location
Copy-Item -Recurse "$projectRoot\src\web\distributors" $webOutDir -ErrorAction SilentlyContinue
Copy-Item -Recurse "$projectRoot\src\web\handlers" $webOutDir -ErrorAction SilentlyContinue

Write-Host "=== Build completed successfully! ===" -ForegroundColor Green
Write-Host "Server files: $serverOutDir" -ForegroundColor Cyan
Write-Host "Web files: $webOutDir" -ForegroundColor Cyan