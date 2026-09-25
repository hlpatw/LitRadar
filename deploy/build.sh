#!/usr/bin/env bash
set -e

echo "=== LitRadar Standalone Build ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "[1/5] Copying source code..."
rsync -a --exclude='node_modules' --exclude='dist' --exclude='.git' --exclude='deploy' "$PROJECT_ROOT/" "$BUILD_DIR/"

echo "[2/5] Applying standalone overlay..."
cp -r "$SCRIPT_DIR/overlay/"* "$BUILD_DIR/"

echo "[3/5] Installing dependencies..."
cd "$BUILD_DIR"
npm install

echo "[4/5] Building server and client..."
npm run build:server
npm run build:client

echo "[5/5] Cleaning up devDependencies..."
cp package.json package.json.bak
npm prune --omit=dev
mv package.json.bak package.json

echo ""
echo "=== Build complete ==="
echo "Run: cd $SCRIPT_DIR && docker compose up -d"