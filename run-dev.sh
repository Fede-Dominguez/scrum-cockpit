#!/usr/bin/env bash
# Levanta Scrum Cockpit en modo desarrollo (ventana nativa + hot reload del front).
#
# Uso:
#   ./run-dev.sh              # levanta la app
#   ./run-dev.sh --check      # sólo diagnostica el entorno y los tokens, no levanta nada
#
# Los tokens salen de variables de entorno (la app nunca los guarda en disco).
# Si tenés varios proyectos con tokens distintos, podés dejarlos en un archivo
# .env.local en la raíz del repo — ya está ignorado por git (patrón *.local):
#
#     # .env.local
#     export AZURE_DEVOPS_EXT_PAT="token-de-la-org-A"
#     export SCRUM_COCKPIT_PAT_MOBILE="token-de-la-org-B"
#
set -euo pipefail
cd "$(dirname "$0")"

# Usa el toolchain de rustup, no el del sistema (igual que build-windows.sh).
export PATH="$HOME/.cargo/bin:$PATH"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
amber() { printf '\033[33m%s\033[0m\n' "$1"; }
dim()   { printf '\033[2m%s\033[0m\n' "$1"; }

fail=0

echo "▶ Entorno"
for cmd in node npm cargo; do
  if command -v "$cmd" >/dev/null 2>&1; then
    green "  ✓ $cmd  $("$cmd" --version 2>&1 | head -1)"
  else
    red   "  ✗ $cmd no encontrado"
    fail=1
  fi
done

if [ "$fail" = 1 ]; then
  echo
  red "Faltan dependencias. Instalá Node (https://nodejs.org) y Rust (https://rustup.rs)."
  exit 1
fi

# Tokens del archivo local, si existe (nunca se versiona: .gitignore tiene *.local).
if [ -f .env.local ]; then
  echo
  echo "▶ Cargando .env.local"
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
  green "  ✓ cargado"
fi

echo
echo "▶ Tokens visibles (sólo nombres — el valor nunca se imprime)"
# Mismo criterio que la capa nativa: algún segmento separado por "_" que
# termine en PAT o TOKEN. Así "PATH" no cuenta como credencial.
found=0
while IFS= read -r name; do
  echo "$name" | tr '_' '\n' | grep -qE '(PAT|TOKEN)$' || continue
  green "  ✓ $name"
  found=$((found + 1))
done < <(compgen -v | grep -E '^[A-Z0-9_]+$' | sort)

if [ "$found" = 0 ]; then
  amber "  ⚠ Ninguna. La app va a abrir en Configuración y no va a poder conectarse."
  echo
  dim   "     Definí al menos una y volvé a correr el script:"
  dim   "       export AZURE_DEVOPS_EXT_PAT=\"tu-token\""
  dim   "     O dejala en .env.local (ver el encabezado de este script)."
else
  dim   "  ($found disponible(s). En la app, cada proyecto elige cuál usa.)"
fi

if [ ! -d node_modules ]; then
  echo
  echo "▶ Instalando dependencias de Node (primera vez, tarda un rato)…"
  npm install
fi

if [ "$CHECK_ONLY" = 1 ]; then
  echo
  green "✅ Chequeo listo (no se levantó la app)."
  exit 0
fi

echo
echo "▶ Levantando Scrum Cockpit…"
dim   "  La primera compilación de Rust tarda varios minutos; después es casi instantánea."
dim   "  Ctrl+C para cerrar."
echo
exec npm run tauri dev
