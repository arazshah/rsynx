#!/bin/sh
set -e

REPO="arazshah/rsynx"
INSTALL_DIR="${RSYNX_INSTALL_DIR:-$HOME/.local/bin}"

os=$(uname -s)
case "$os" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *)
    echo "rsynx: unsupported OS: $os" >&2
    echo "Download a binary manually: https://github.com/$REPO/releases" >&2
    exit 1
    ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *)
    echo "rsynx: unsupported architecture: $arch" >&2
    echo "Download a binary manually: https://github.com/$REPO/releases" >&2
    exit 1
    ;;
esac

asset="rsynx-${os}-${arch}"
url="https://github.com/$REPO/releases/latest/download/$asset"

mkdir -p "$INSTALL_DIR"
tmp=$(mktemp)
echo "Downloading $asset..."
curl -fsSL "$url" -o "$tmp"
chmod +x "$tmp"
mv "$tmp" "$INSTALL_DIR/rsynx"

echo "rsynx installed to $INSTALL_DIR/rsynx"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "Add it to your PATH:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
