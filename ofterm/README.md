# OFTerm 终端

OFTerm 是面向飞牛 fnOS 的开源终端应用。界面与偏好设置参考 iTerm2，应用外观遵循飞牛官方设计语言。

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

## 许可

GPL-2.0。第三方组件与主题许可见仓库 `NOTICE` 与 `THIRD_PARTY_LICENSES.md`。
