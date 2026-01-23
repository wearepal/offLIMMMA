# PowerShell script to build macOS package using Docker

Write-Host "Building macOS package using Docker..." -ForegroundColor Cyan

# Build the Docker image
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build -t offlimmma-builder .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed!" -ForegroundColor Red
    exit 1
}

# Run the container to build macOS package
Write-Host "Building macOS package..." -ForegroundColor Yellow
docker run --rm `
    -v "${PWD}/release:/app/release" `
    -v electron-builder-cache:/app/.cache/electron-builder `
    offlimmma-builder `
    npm run package:mac:zip

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "macOS package built successfully!" -ForegroundColor Green
Write-Host "Check the release/ directory for your macOS ZIP file." -ForegroundColor Green
