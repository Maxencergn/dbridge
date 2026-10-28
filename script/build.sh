#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"
mkdir -p dist

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is required to build dbridge binaries." >&2
  exit 1
fi

build() {
  target=$1
  outfile=$2
  echo "Building ${outfile}"
  bun build ./bin/dbridge.js --compile --target="$target" --outfile="$outfile"
}

build bun-darwin-arm64 dist/dbridge-darwin-arm64
build bun-darwin-x64 dist/dbridge-darwin-x64
build bun-linux-arm64 dist/dbridge-linux-arm64
build bun-linux-x64 dist/dbridge-linux-x64
build bun-linux-arm64-musl dist/dbridge-linux-arm64-musl
build bun-linux-x64-musl dist/dbridge-linux-x64-musl
build bun-windows-x64 dist/dbridge-windows-x64.exe
