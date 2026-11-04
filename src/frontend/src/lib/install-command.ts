// Builds the shell script that installs the utilities archive, and splits it
// into batches small enough for the terminal's inbound frame limit.

export const INSTALL_BATCH_LIMIT = 300_000

export function buildInstallLines(bundle: string): string[] {
  const chunks = bundle.match(/.{1,8000}/g) ?? []
  return [
    'd="$HOME/.local/bin"; mkdir -p "$d"; f="$(mktemp)"',
    ...chunks.map((chunk) => `printf '%s' '${chunk}' >> "$f"`),
    'if command -v openssl >/dev/null 2>&1; then openssl base64 -d -A < "$f" | tar -xzf - -C "$d"; else base64 -d < "$f" | tar -xzf - -C "$d"; fi',
    'rm -f "$f"',
    'chmod +x "$d"/imgcat "$d"/imgls "$d"/ofn-copy "$d"/ofn-notify "$d"/ofn-dl "$d"/ofn-title "$d"/ofn-check',
    // Pick the native binary for this machine; anything else keeps the shell
    // scripts, which work everywhere.
    'os="$(uname -s 2>/dev/null)"; arch="$(uname -m 2>/dev/null)"',
    'case "$os/$arch" in',
    '  Linux/x86_64|Linux/amd64) b=ofterm-utils-linux-x86_64 ;;',
    '  Linux/aarch64|Linux/arm64) b=ofterm-utils-linux-aarch64 ;;',
    '  Linux/armv7l|Linux/armv71|Linux/armhf) b=ofterm-utils-linux-armv7 ;;',
    '  Darwin/x86_64) b=ofterm-utils-darwin-x86_64 ;;',
    '  Darwin/arm64) b=ofterm-utils-darwin-arm64 ;;',
    '  *) b= ;;',
    'esac',
    'if [ -n "$b" ] && [ -f "$d/$b" ] && chmod +x "$d/$b" && "$d/$b" --selftest >/dev/null 2>&1; then',
    '  rm -f "$d/imgcat" "$d/imgls"',
    '  mv "$d/$b" "$d/ofterm-utils"',
    '  ln -sf ofterm-utils "$d/imgcat"; ln -sf ofterm-utils "$d/imgls"',
    '  printf "OFTerm utilities: native binary (%s/%s)\\n" "$os" "$arch"',
    'else',
    '  rm -f "$d"/ofterm-utils-*',
    '  printf "OFTerm utilities: shell scripts (%s/%s)\\n" "$os" "$arch"',
    'fi',
    'if [ -x "$d/ofn-check" ]; then',
    '  export PATH="$d:$PATH"',
    '  hash -r 2>/dev/null || true',
    '  for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do',
    '    [ -f "$rc" ] || continue',
    '    grep -q "OFTerm utilities PATH" "$rc" || { echo "# OFTerm utilities PATH" >> "$rc"; echo \'export PATH="$HOME/.local/bin:$PATH"\' >> "$rc"; }',
    '  done',
    '  clear',
    '  printf "OFTerm utilities installed in %s\\n" "$d"',
    'else',
    '  printf "OFTerm utilities install failed\\n"',
    'fi',
  ]
}

/// Split complete lines into batches under `limit` characters. The server
/// rejects inbound WebSocket frames above 1 MiB, and the archive is larger
/// than that; splitting on line boundaries keeps every command well-formed.
export function batchScript(lines: string[], limit = INSTALL_BATCH_LIMIT): string[] {
  const batches: string[] = []
  let current: string[] = []
  let size = 0
  for (const line of lines) {
    const addition = line.length + (current.length ? 1 : 0) // + newline
    if (current.length && size + addition > limit) {
      batches.push(current.join('\n'))
      current = []
      size = 0
    }
    size += line.length + (current.length ? 1 : 0)
    current.push(line)
  }
  if (current.length) batches.push(current.join('\n'))
  return batches
}
