#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SVG="$ROOT_DIR/public/app-icon.svg"
BUILD_DIR="$ROOT_DIR/build"
ICONSET_DIR="$BUILD_DIR/icon.iconset"
TMP_DIR="$BUILD_DIR/.icon-tmp"
BASE_PNG="$TMP_DIR/favicon-1024.png"

if ! command -v qlmanage >/dev/null 2>&1; then
  echo "qlmanage is required to render the SVG source."
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required to resize icon assets."
  exit 1
fi

if ! command -v iconutil >/dev/null 2>&1; then
  echo "iconutil is required to build the .icns file."
  exit 1
fi

mkdir -p "$ICONSET_DIR" "$TMP_DIR"
rm -f "$ICONSET_DIR"/*.png
rm -f "$TMP_DIR"/*.png

qlmanage -t -s 1024 -o "$TMP_DIR" "$SOURCE_SVG" >/dev/null
mv "$TMP_DIR/$(basename "$SOURCE_SVG").png" "$BASE_PNG"

for size in 16 32 64 128 256 512; do
  sips -z "$size" "$size" "$BASE_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
done

cp "$ICONSET_DIR/icon_32x32.png" "$ICONSET_DIR/icon_16x16@2x.png"
cp "$ICONSET_DIR/icon_64x64.png" "$ICONSET_DIR/icon_32x32@2x.png"
cp "$ICONSET_DIR/icon_256x256.png" "$ICONSET_DIR/icon_128x128@2x.png"
cp "$ICONSET_DIR/icon_512x512.png" "$ICONSET_DIR/icon_256x256@2x.png"
cp "$BASE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
cp "$BASE_PNG" "$BUILD_DIR/icon.png"
rm -f "$TMP_DIR"/*.png

echo "Generated:"
echo "  $BUILD_DIR/icon.icns"
echo "  $BUILD_DIR/icon.png"
