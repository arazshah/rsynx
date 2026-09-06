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
    export_line="export PATH=\"$INSTALL_DIR:\$PATH\""
    updated=""

    add_to_rc() {
      rc="$1"
      [ -f "$rc" ] || return 1
      if ! grep -qF "$export_line" "$rc" 2>/dev/null; then
        printf '\n# added by the rsynx installer\n%s\n' "$export_line" >> "$rc"
      fi
      updated="$updated $rc"
    }

    case "$(basename "${SHELL:-}")" in
      zsh) add_to_rc "$HOME/.zshrc" || true ;;
      bash) add_to_rc "$HOME/.bashrc" || add_to_rc "$HOME/.bash_profile" || true ;;
    esac
    # .profile is read by login shells across bash/dash/sh and is a safe
    # fallback so PATH is fixed even if $SHELL doesn't match a case above.
    add_to_rc "$HOME/.profile" || { touch "$HOME/.profile" && add_to_rc "$HOME/.profile"; }

    echo ""
    echo "Added rsynx to your PATH in:$updated"
    echo "Start a new shell, or run this now:"
    echo "  $export_line"
    ;;
esac
