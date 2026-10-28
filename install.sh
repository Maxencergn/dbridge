#!/bin/sh
set -eu

repo="Maxencergn/dbridge"
os=$(uname -s)
arch=$(uname -m)

case "$os" in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *)
    echo "This installer supports macOS and Linux. On Windows, run install.ps1." >&2
    exit 1
    ;;
esac

case "$arch" in
  arm64|aarch64) cpu=arm64 ;;
  x86_64|amd64) cpu=x64 ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

suffix=""
if [ "$platform" = "linux" ] && command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then
  suffix="-musl"
fi

asset="dbridge-${platform}-${cpu}${suffix}"
url="https://github.com/${repo}/releases/latest/download/${asset}"
dest="${HOME}/.local/bin/dbridge"
tmp=$(mktemp)

cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

mkdir -p "${HOME}/.local/bin"
curl -fsSL "$url" -o "$tmp"
chmod +x "$tmp"
mv "$tmp" "$dest"
trap - EXIT

echo "Installed ${dest}"
case ":${PATH}:" in
  *":${HOME}/.local/bin:"*) ;;
  *) echo "Add ${HOME}/.local/bin to your PATH, then open a new terminal." ;;
esac
