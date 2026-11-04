# OFTerm Utilities

`imgcat` / `imgls` 来自 iTerm2（GPL-2.0，未修改）；`ofn-*` 是 OFTerm 的轻量辅助脚本。一键安装：

```bash
curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | bash
```

完整说明见 `docs/UTILITIES.md`。

性能：`ofn-imgcat` / `ofn-imgls` 会按终端尺寸缩图；原始 `imgcat` / `imgls` 仍保留，用于需要原图的场景。

## Inline image helpers

`imgcat` and `imgls` are vendored from the iTerm2 project:

- Source: https://github.com/gnachman/iTerm2 (under `OtherResources/Utilities/`)
- License: GNU General Public License v2.0 (see the repository `LICENSE`)

They are unmodified upstream scripts. They emit the iTerm2 OSC 1337 inline
image protocol, which OFTerm renders with the MIT-licensed
`@xterm/addon-image`.

Usage inside an OFTerm shell:

```bash
./imgcat path/to/image.png
./imgls --width 40 --height 20 .
```

For convenience, copy both scripts to `/usr/local/bin` on the machine where the
shell runs (the NAS itself for local sessions, or the SSH host):

```bash
install -m 0755 imgcat imgls /usr/local/bin/
```

iTerm2 is a trademark of George Nachman. OFTerm is not affiliated with
iTerm2.
