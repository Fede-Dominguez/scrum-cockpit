#!/usr/bin/env bash
# Cross-compila Scrum Cockpit para Windows desde Linux (target x86_64-pc-windows-msvc)
# y arma una carpeta PORTABLE (.exe autonomo, sin instalador) + un .zip para entregar.
#
# Requisitos (una sola vez):
#   - rustup + target:  rustup target add x86_64-pc-windows-msvc
#   - cargo-xwin:       cargo install --locked cargo-xwin
#   - LLVM:  clang-cl + llvm-lib (paquete `llvm`) Y lld-link (paquete `lld`)
#            OJO: `lld` es un paquete aparte de `llvm` y se cae en updates del
#            sistema. Si el link falla, chequear `command -v lld-link`.
#            En Arch:  sudo pacman -S --needed llvm clang lld
#   - 7z (para el .zip)
#
# Uso:  ./build-windows.sh
set -euo pipefail

# Usa el toolchain de rustup (no el del sistema)
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")"

TARGET="x86_64-pc-windows-msvc"
OUT_EXE="src-tauri/target/$TARGET/release/scrum-cockpit.exe"
DIST="ScrumCockpit-portable"

echo "▶ Cross-compilando a Windows ($TARGET), sin instalador…"
npm run tauri build -- --runner cargo-xwin --target "$TARGET" --no-bundle

echo "▶ Armando carpeta portable…"
rm -rf "$DIST" "$DIST.zip"
mkdir -p "$DIST"
cp "$OUT_EXE" "$DIST/ScrumCockpit.exe"
# El LEEME.txt fuente se versiona en la raiz del proyecto
[ -f "LEEME-portable.txt" ] && cp "LEEME-portable.txt" "$DIST/LEEME.txt"

echo "▶ Comprimiendo…"
7z a -tzip "$DIST.zip" "$DIST" >/dev/null

echo
echo "✅ Listo:"
echo "   Carpeta:  $DIST/"
echo "   Zip:      $DIST.zip   (esto es lo que le pasas a la persona)"
