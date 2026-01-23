# Dockerfile for building macOS packages on Linux/Windows
# Uses electron-builder's Docker support for cross-platform builds

FROM node:18-slim

# Install dependencies required for electron-builder and native modules
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Use npm install instead of npm ci to handle platform-specific optional dependencies gracefully
RUN npm install --legacy-peer-deps

# Copy source files
COPY . .

# Default command (can be overridden)
# Use zip format instead of dmg since hdiutil (macOS tool) is not available on Linux
CMD ["npm", "run", "package:mac:zip"]
