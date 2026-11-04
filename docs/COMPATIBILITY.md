# 兼容性

## fnOS

- 仅支持**最新版** fnOS（统一网关模型：Unix Socket + `X-Trim-*`）。
- 不使用旧版端口注册、旧版 `Authorization` JWT、旧版 iframe 端口路径。
- `os_min_version` 由发布流程写入实际测试过的最低版本；未经真机验证不宣称兼容。
- 直连 TCP 仅用于本地开发/调试，默认关闭。

## 架构

| 目标 | Go | fnOS platform | 产物 |
|---|---|---|---|
| x86_64 | `linux/amd64` | `x86` | `ofterm_x86.fpk` |
| arm64 | `linux/arm64` | `arm` | `ofterm_arm.fpk` |
| 龙芯（未来） | `linux/loong64` | 待官方定义 | 预留矩阵项 |

架构只在 `build/architectures.json` 中定义；后端无架构分支。新增架构不需要改 Go 代码。fnpack 的 arch 字符串与 FnDepot 的 `platform` 值分开映射，避免写死。

## 浏览器

- Safari 15+ / iOS Safari 15+
- Chrome/Edge 100+
- Firefox 100+

降级：WebGL 不可用或上下文丢失时使用 DOM renderer；不支持 WebGL 不影响终端功能。

## 会话语义

- 无持久会话；WebSocket 断开后 15s 内可重连，超时结束。
- 页面刷新/关闭会结束会话（有 `beforeunload` 提示）。
- 需要持久化请在 Shell 内自行运行 tmux/screen。

## 数据兼容

- 不读取/不迁移 FntermX 私有数据库作为主路径；导入命令片段与设置。
- 自有备份为版本化 JSON，导入时校验 schema 与大小。
