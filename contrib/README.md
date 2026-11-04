# OFTerm Utilities

`imgcat` / `imgls` 在 iTerm2 版本的基础上扩展（默认按终端尺寸缩图、显示图片像素尺寸），`ofn-*` 是 OFTerm 的轻量辅助脚本。一键安装：

```bash
curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | bash
```

完整说明见 `docs/UTILITIES.md`。

## Inline image helpers

`imgcat` and `imgls` speak the OSC 1337 inline-image protocol, which OFTerm
renders with the MIT-licensed `@xterm/addon-image`.

- `imgcat` is derived from iTerm2's `imgcat`
  (https://github.com/gnachman/iTerm2, `OtherResources/Utilities/imgcat`,
  GPL-2.0) and remains under GPL-2.0. Changes: images are downscaled to fit
  the terminal before transfer; `--no-shrink` sends the original bytes.
- `imgls` is an independent OFTerm implementation (GPL-2.0) with the same
  command line as iTerm2's `imgls`, plus `--dimensions` (default on) to show
  each image's pixel size.

Both downscale before transfer, so a 4000×3000 photo costs a thumbnail's worth
of base64 instead of megabytes. Downscaling uses `sips` (macOS) or
`magick`/`convert` (ImageMagick) when present; without them the original bytes
are sent.

Usage inside an OFTerm shell:

```bash
imgcat path/to/image.png
imgls --width 40 --height 20 .
imgls --no-dimensions ~/Pictures
```

For convenience, copy both scripts to `/usr/local/bin` on the machine where the
shell runs (the NAS itself for local sessions, or the SSH host):

```bash
install -m 0755 imgcat imgls /usr/local/bin/
```

iTerm2 is a trademark of George Nachman. OFTerm is not affiliated with
iTerm2.
