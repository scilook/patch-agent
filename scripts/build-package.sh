#!/bin/bash
set -eu

# Move to the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "=== Packaging and Building Start ==="

# 1. Clean previous build artifacts
echo "[1/3] Cleaning dist directory..."
mkdir -p dist
rm -f dist/vuln-patch-agent_0.1.0_all.deb dist/vuln-patch-agent_0.1.0.tar.gz

# 2. Copy to a temporary location in native WSL Linux filesystem to solve NTFS mount permission issues
echo "Preparing native build directory in native filesystem..."
BUILD_DIR="/tmp/vuln-patch-agent-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cp -r vuln-patch-agent_0.1.0 "$BUILD_DIR/pkg"

echo "Converting CRLF to LF line endings for all files..."
find "$BUILD_DIR/pkg" -type f -exec sed -i 's/\r$//' {} +

echo "Fixing permissions on native build directory..."
find "$BUILD_DIR/pkg" -type d -exec chmod 0755 {} +
find "$BUILD_DIR/pkg" -type f -exec chmod 0644 {} +

# Set executable permissions on scripts and binaries
chmod 0755 "$BUILD_DIR/pkg/DEBIAN/postinst"
chmod 0755 "$BUILD_DIR/pkg/DEBIAN/postrm"
chmod 0755 "$BUILD_DIR/pkg/usr/bin/patch-agent"
chmod 0755 "$BUILD_DIR/pkg/usr/bin/vuln-patch-agent"
chmod 0755 "$BUILD_DIR/pkg/usr/lib/vuln-patch-agent/patch_agent.py"

# Remove any compiled python cache files before building
find "$BUILD_DIR/pkg" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR/pkg" -name "*.pyc" -type f -delete 2>/dev/null || true

# 3. Build deb package and tar.gz
echo "[3/3] Building .deb package and .tar.gz archive..."
dpkg-deb --build "$BUILD_DIR/pkg" "$BUILD_DIR/vuln-patch-agent_0.1.0_all.deb"

# Create tar.gz archive
tar -czf "$BUILD_DIR/vuln-patch-agent_0.1.0.tar.gz" -C "$BUILD_DIR/pkg" etc usr

# Copy products back to Windows workspace dist/
cp "$BUILD_DIR/vuln-patch-agent_0.1.0_all.deb" dist/vuln-patch-agent_0.1.0_all.deb
cp "$BUILD_DIR/vuln-patch-agent_0.1.0.tar.gz" dist/vuln-patch-agent_0.1.0.tar.gz

# Clean up
rm -rf "$BUILD_DIR"

echo "=== Packaging and Building Completed ==="
