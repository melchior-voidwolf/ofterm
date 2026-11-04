# OFTerm Utilities

类似 [iTerm2 Utilities](https://iterm2.com/documentation-utilities.html)，但面向 OFTerm 的浏览器终端。所有脚本通过 OSC 序列工作，可运行在本地 Shell 或任意 SSH 主机上。

## 一键安装（默认从 GitHub 下载）

```bash
curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | bash
```

默认安装到 `~/.local/bin`；可指定：

```bash
PREFIX=/usr/local/bin FORCE=1 \
  curl -fsSL https://raw.githubusercontent.com/melchior-voidwolf/ofterm/main/contrib/install-utils.sh | bash
```

安装前请先阅读脚本；也可以只下载需要的文件。

## 工具

| 命令 | 作用 | 协议 |
|---|---|---|
| `imgcat` / `ofn-imgcat` | 在终端内显示图片 | OSC 1337 File / MultipartFile |
| `imgls` / `ofn-imgls` | 带缩略图的目录列表 | OSC 1337 |
| `ofn-copy` | 复制文本到浏览器剪贴板 | OSC 52 |
| `ofn-notify` | 显示桌面通知 | OSC 9 |
| `ofn-dl` | 从 NAS/远程主机下载文件到浏览器 | OSC 1337 File=inline=0 |
| `ofn-title` | 设置标签标题 | OSC 0 |
| `ofn-check` | 检查终端与辅助脚本能力 | OSC 9 / 52 |

## 尺寸与性能

- `ofn-imgcat` 默认按当前终端尺寸缩图（取 `stty size`，约 10×20px/单元格，最长边上限 1600px），避免把 4000×3000 原图整包 base64 传给浏览器。
- `ofn-imgls` 默认按 20×10 单元格生成缩略图，最长边约 280px；实测同一目录从 72KB 降到 21KB。
- 需要原图时设置 `OFN_IMG_MAX_PX=0` 或直接使用 `imgcat`。
- 后端会把 PTY 输出按 8ms/64KB 合并为更少的 WebSocket 帧，图片和大量日志都不会逐字符排队。

## 示例

```bash
imgcat screenshot.png
imgcat -W 40 -H 20 photo.jpg
imgls --width 30 .
echo "hello" | ofn-copy
ofn-notify "编译完成"
ofn-dl build/OFTerm.fpk
ofn-title "prod-01"
```

## 兼容性说明

- `imgcat` / `imgls` 来自 iTerm2（GPL-2.0），未修改；OFTerm 前端使用 MIT 的 `@xterm/addon-image` 渲染。
- iTerm2 新版 `imgcat` 默认使用 `MultipartFile` 分块协议；OFTerm 前端会拼装后再交给 image addon，因此无需 `-l`。
- 在 tmux/screen 内运行时，`imgcat` 会自动加 tmux DCS 包装；OFTerm 按终端实际支持处理。
- 其他终端若不支持 OSC 1337，图片不会显示，但不会破坏终端会话。

## 安全

- `ofn-dl` 会把文件内容 base64 后经终端传给浏览器；大文件会产生较大输出，建议只用于中小文件。
- 不要在不可信的终端里运行来源不明的 OSC 脚本。
- 安装脚本使用 `curl | bash` 仅为方便；生产环境建议先下载、审阅、再执行。

iTerm2 是 George Nachman 的商标；OFTerm 与 iTerm2 无隶属关系。
