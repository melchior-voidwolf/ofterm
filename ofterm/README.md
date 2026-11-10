# OFTerm 终端

OFTerm 是面向飞牛 fnOS 的开源终端应用。界面与偏好设置参考 iTerm2，应用外观遵循飞牛官方设计语言。

**项目主页：** https://melchior-voidwolf.github.io/ofterm/
**源码仓库：** https://github.com/melchior-voidwolf/ofterm

[项目主页](https://melchior-voidwolf.github.io/ofterm/) · [GitHub 源码](https://github.com/melchior-voidwolf/ofterm) · [下载](https://github.com/melchior-voidwolf/ofterm/releases) · [问题反馈](https://github.com/melchior-voidwolf/ofterm/issues)

[![CI](https://github.com/melchior-voidwolf/ofterm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/melchior-voidwolf/ofterm/actions/workflows/ci.yml)
[![Release](https://github.com/melchior-voidwolf/ofterm/actions/workflows/release.yml/badge.svg)](https://github.com/melchior-voidwolf/ofterm/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/melchior-voidwolf/ofterm?sort=semver&label=release)](https://github.com/melchior-voidwolf/ofterm/releases/latest)
![License](https://img.shields.io/badge/license-GPL--2.0-blue)

## 主要功能

- 打开即终端，iTerm2 式标签窗口，不区分“本地/远程”首页
- 本地 Shell；SSH 直接在 Shell 中使用 `ssh`，主机与密钥由用户/fnOS 管理
- iTerm2 内置配色 + Material Design 默认主题
- 字体、光标、滚动、快捷键、配色、命令片段完整设置
- 最新版 fnOS 统一网关；访问控制由 fnOS 负责
- 无持久会话：断线短暂重连，超时结束；可自行在 Shell 内运行 tmux

## 支持环境

- 飞牛 fnOS：最新版（以发布说明为准）
- 架构：x86_64、arm64；构建矩阵可扩展至后续官方架构（含 loong64）
- 浏览器：Safari 15+/iOS 15+、Chrome/Firefox/Edge 100+

## 数据与隐私

- 无遥测、无外部请求（用户主动发起 SSH 除外）
- 数据保存在应用私有目录；不保存 SSH 主机或凭据
- 详见仓库 `docs/PRIVACY.md`

## 链接

- 项目主页（GitHub Pages）：https://melchior-voidwolf.github.io/ofterm/
- 源码仓库：https://github.com/melchior-voidwolf/ofterm
- 下载与更新：https://github.com/melchior-voidwolf/ofterm/releases
- 问题反馈：https://github.com/melchior-voidwolf/ofterm/issues
- 使用文档：[docs/UTILITIES.md](https://github.com/melchior-voidwolf/ofterm/blob/main/docs/UTILITIES.md)
- 隐私与安全：[docs/PRIVACY.md](https://github.com/melchior-voidwolf/ofterm/blob/main/docs/PRIVACY.md)、[docs/SECURITY.md](https://github.com/melchior-voidwolf/ofterm/blob/main/docs/SECURITY.md)

## 常见问题

**OFTerm 是免费的吗？** 是。OFTerm 以 GPL-2.0 协议开源，源码托管在 GitHub，安装和使用不收费。

**支持哪些架构？** 飞牛 fnOS x86_64 与 arm64 安装包；浏览器端支持 Safari 15+、Chrome/Edge 100+、Firefox 100+。

**会收集数据吗？** 不会。无遥测、无第三方分析、无 CDN 依赖；访问控制由 fnOS 负责，SSH 凭据不保存在应用中。

**如何安装？** 在 fnOS 应用中心添加自定义应用源（fnpack.json），或从 GitHub Releases 下载 fpk 手动安装。

## 许可

GPL-2.0。第三方组件与主题许可见仓库 `NOTICE` 与 `THIRD_PARTY_LICENSES.md`。
