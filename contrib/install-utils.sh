#!/usr/bin/env bash
# Install OFTerm utilities.
#
#   curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | bash
#
# Optional environment:
#   PREFIX=$HOME/.local/bin     installation directory
#   OFTERM_UTILS_URL=...        alternate raw base URL for the shell helpers
#   OFTERM_RELEASE_URL=...      alternate base URL for the native binaries
#   FORCE=1                     overwrite existing files
#
# The native imgcat/imgls binary is downloaded for this machine's OS and CPU
# and verified with --selftest. When no binary matches (or it cannot run), the
# shell implementations are installed instead and everything still works.
set -euo pipefail

BASE="${OFTERM_UTILS_URL:-https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib}"
RELEASE="${OFTERM_RELEASE_URL:-https://github.com/melchior-voidwolf/ofterm/releases/latest/download}"
PREFIX="${PREFIX:-$HOME/.local/bin}"
FILES="imgcat imgls ofn-copy ofn-notify ofn-dl ofn-title ofn-check"

mkdir -p "$PREFIX"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for name in $FILES; do
  dest="$PREFIX/$name"
  if [ -e "$dest" ] && [ "${FORCE:-0}" != "1" ] && [ ! -L "$dest" ]; then
    echo "skip $dest (exists; set FORCE=1 to overwrite)"
    continue
  fi
  echo "download $name"
  curl -fsSL "$BASE/$name" -o "$tmp/$name"
  chmod 0755 "$tmp/$name"
  mv "$tmp/$name" "$dest"
done

os="$(uname -s 2>/dev/null || echo unknown)"
arch="$(uname -m 2>/dev/null || echo unknown)"
case "$os/$arch" in
  Linux/x86_64 | Linux/amd64) binary=ofterm-utils-linux-x86_64 ;;
  Linux/aarch64 | Linux/arm64) binary=ofterm-utils-linux-aarch64 ;;
  Linux/armv7l | Linux/armv71 | Linux/armhf) binary=ofterm-utils-linux-armv7 ;;
  Darwin/x86_64) binary=ofterm-utils-darwin-x86_64 ;;
  Darwin/arm64) binary=ofterm-utils-darwin-arm64 ;;
  *) binary="" ;;
esac

installed_native=0
if [ -n "$binary" ]; then
  echo "download $binary"
  if curl -fsSL "$RELEASE/$binary" -o "$tmp/ofterm-utils" 2>/dev/null && chmod 0755 "$tmp/ofterm-utils"; then
    if "$tmp/ofterm-utils" --selftest >/dev/null 2>&1; then
      mv "$tmp/ofterm-utils" "$PREFIX/ofterm-utils"
      rm -f "$PREFIX/imgcat" "$PREFIX/imgls"
      ln -sf ofterm-utils "$PREFIX/imgcat"
      ln -sf ofterm-utils "$PREFIX/imgls"
      installed_native=1
    fi
  fi
fi

for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
  [ -f "$rc" ] || continue
  grep -q "OFTerm utilities PATH" "$rc" || {
    echo "# OFTerm utilities PATH" >> "$rc"
    echo "export PATH=\"$PREFIX:\$PATH\"" >> "$rc"
  }
done

echo
echo "Installed OFTerm utilities in $PREFIX"
if [ "$installed_native" = "1" ]; then
  echo "imgcat/imgls: native binary ($os/$arch)"
else
  echo "imgcat/imgls: shell scripts (no matching binary for $os/$arch)"
fi
echo "PATH updated for this shell and future shells."
echo
echo "Try: imgcat image.png   imgls .   ofn-notify 'build done'   ofn-dl report.pdf"
