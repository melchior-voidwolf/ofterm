# OFTerm Utilities

类似 [iTerm2 Utilities](https://iterm2.com/documentation-utilities.html)，但面向 OFTerm 的浏览器终端。所有脚本通过 OSC 序列工作，可运行在本地 Shell 或任意 SSH 主机上。

## 一键安装

OFTerm 的 Settings → Help 内置“在当前终端安装辅助工具”按钮：shell 脚本作为静态资源随应用分发（`utilities.b64`），点击后命令在当前终端可见地执行——先安装脚本，再按当前终端所在机器的系统与 CPU 从 GitHub Releases 下载匹配的原生二进制并以 `--selftest` 验证；下载失败或不匹配时保留 shell 实现，功能不受影响。

也可以从 GitHub 下载安装：

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
| `imgcat` | 在终端内显示图片（自动缩图） | OSC 1337 File / MultipartFile |
| `imgls` | 自适应多列缩略图网格，文件名与像素尺寸在图片下方 | OSC 1337 |
| `ofn-copy` | 复制文本到浏览器剪贴板 | OSC 52 |
| `ofn-notify` | 显示桌面通知 | OSC 9 |
| `ofn-dl` | 从 NAS/远程主机下载文件到浏览器 | OSC 1337 File=inline=0 |
| `ofn-title` | 设置标签标题 | OSC 0 |
| `ofn-check` | 检查终端与辅助脚本能力 | OSC 9 / 52 |

## 原生实现与回退

`imgcat` / `imgls` 优先使用原生二进制 `ofterm-utils`（Rust，静态链接），由安装命令从 GitHub Releases 按架构下载：

- 一个多调用二进制，按 `argv[0]` 分发；安装时创建 `imgcat` / `imgls` 符号链接。
- 自带 PNG/JPEG/GIF/WebP/BMP/TIFF/ICO/PNM/TGA/DDS/HDR/QOI/EXR 解码，不依赖 `sips` 或 ImageMagick。
- 支持平台：Linux x86_64 / aarch64 / armv7，macOS x86_64 / arm64（静态 musl 构建，不挑发行版）。
- 安装脚本用 `uname -s` / `uname -m` 精确选型，下载后先跑 `--selftest`；**下载失败、不匹配或无法执行时自动回退到同目录下的 shell 脚本**，功能不受影响，只是大图缩图依赖 `sips`/ImageMagick。
- 二进制不嵌入安装包（注入终端太慢），随 GitHub Release 独立分发，应用内安装与 `contrib/install-utils.sh` 使用同一下载地址。

## 尺寸与性能

- `imgcat` 默认按当前终端尺寸缩图，避免把 4000×3000 原图整包 base64 传给浏览器。可用 `--no-shrink` 或 `OFN_IMG_MAX_PX=0` 关闭。
- 原生实现会读取终端真实像素尺寸（`TIOCGWINSZ` 的 `ws_xpixel`）；拿不到时按 80×24 单元格估算。
- EXIF 方向会被应用（手机照片不会躺倒）；动画 GIF/WebP **不缩图、原样透传**，保证动画不丢。
- 传输前若仍超过约 6.8 MB，会进一步缩小或在无法缩小时报错，避免撞上前端 xterm 单条 OSC 10 MB 上限后“静默不显示”。
- `imgls` 默认按 20×10 单元格生成缩略图，列数随终端宽度自适应（80 列 3 列、100 列 4 列、110 列 5 列），文件名与像素尺寸显示在图片下方（`--no-dimensions` 关闭尺寸行，`--columns N` 限制列数）。已渲染的网格不会随窗口拖动重排——宽高按单元格下发会跟随缩放，重跑一次 `imgls` 即按新宽度重排。
- 实测（180 个文件 / 195 MB 漫画目录）：原生实现 12.1 s / 29 MB 峰值内存，shell 版 27.9 s / 157 MB。
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

- `imgcat` 基于 iTerm2 的 `imgcat`（GPL-2.0）修改：增加了传输前缩图与 `--no-shrink`；`imgls` 是 OFTerm 独立实现（GPL-2.0），命令行与其兼容并增加了 `--dimensions`。OFTerm 前端使用 MIT 的 `@xterm/addon-image` 渲染。
- iTerm2 新版 `imgcat` 默认使用 `MultipartFile` 分块协议；OFTerm 前端会拼装后再交给 image addon，因此无需 `-l`。
- 在 tmux/screen 内运行时，`imgcat` 会自动加 tmux DCS 包装；OFTerm 按终端实际支持处理。
- 其他终端若不支持 OSC 1337，图片不会显示，但不会破坏终端会话。

## 安全

- `ofn-dl` 会把文件内容 base64 后经终端传给浏览器；大文件会产生较大输出，建议只用于中小文件。
- 不要在不可信的终端里运行来源不明的 OSC 脚本。
- 安装脚本使用 `curl | bash` 仅为方便；生产环境建议先下载、审阅、再执行。

iTerm2 是 George Nachman 的商标；OFTerm 与 iTerm2 无隶属关系。
