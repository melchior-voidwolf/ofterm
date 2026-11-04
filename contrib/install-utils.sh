#!/usr/bin/env bash
# Install OFTerm utilities from the GitHub repository.
#
#   curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | bash
#
# Optional environment:
#   PREFIX=$HOME/.local/bin     installation directory
#   OFTERM_UTILS_URL=...    alternate raw base URL
#   FORCE=1                     overwrite existing files
#
# The imgcat/imgls scripts are vendored from iTerm2 (GPL-2.0); the ofn-* helpers
# are part of OFTerm (GPL-2.0). Review scripts before piping curl to bash.
set -euo pipefail

BASE="${OFTERM_UTILS_URL:-https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib}"
PREFIX="${PREFIX:-$HOME/.local/bin}"
FILES="imgcat imgls ofn-imgcat ofn-imgls ofn-copy ofn-notify ofn-dl ofn-title ofn-check"

mkdir -p "$PREFIX"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for name in $FILES; do
  dest="$PREFIX/$name"
  if [ -e "$dest" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "skip $dest (exists; set FORCE=1 to overwrite)"
    continue
  fi
  echo "download $name"
  curl -fsSL "$BASE/$name" -o "$tmp/$name"
  chmod 0755 "$tmp/$name"
  mv "$tmp/$name" "$dest"
done

echo
echo "Installed OFTerm utilities in $PREFIX"
case ":$PATH:" in
  *":$PREFIX:"*) ;;
  *) echo "Add this to your shell profile: export PATH=\"$PREFIX:\$PATH\"" ;;
esac
echo
echo "Try: imgcat image.png   imgls .   ofn-notify 'build done'   ofn-dl report.pdf"
