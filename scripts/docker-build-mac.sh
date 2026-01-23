#!/bin/bash
# Script to build macOS package using Docker

set -e

echo "🐳 Building macOS package using Docker..."

# Build the Docker image
echo "📦 Building Docker image..."
docker build -t offlimmma-builder .

# Run the container to build macOS package
echo "🔨 Building macOS package..."
docker run --rm \
  -v "$(pwd)/release:/app/release" \
  -v electron-builder-cache:/app/.cache/electron-builder \
  offlimmma-builder \
  npm run package:mac:zip

echo "✅ macOS package built successfully!"
echo "📦 Check the release/ directory for your macOS ZIP file."
