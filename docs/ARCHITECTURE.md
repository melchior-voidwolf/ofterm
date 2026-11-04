# 架构概览

## 进程模型

- 单个 Go 静态二进制 `ofterm`。
- 官方模式：监听 `${TRIM_APPDEST}/ofterm.sock`，由 fnOS 统一网关转发。
- 开发模式：`OFTERM_LISTEN=127.0.0.1:5122`，直接使用当前系统用户。
- 每个 WebSocket 对应一个本地 PTY 会话；无落盘、无持久化会话。
- 断开后最多保留 15s grace 用于重连；超时终止进程树。

## 后端

```
cmd/ofterm       启动、信号、子命令
internal/app         配置与装配
internal/gateway     Unix/TCP listener、网关前缀
internal/auth        网关身份、一次性 WebSocket ticket
internal/httpapi     REST API
internal/term        会话接口与限额
internal/term/local  PTY + 进程收敛
internal/store       bbolt 持久化
internal/web         内嵌前端资源
```

## 会话协议

WebSocket 二进制帧，1 字节 opcode：

- `0x01 DATA`：终端数据；服务端帧带 8 字节 seq
- `0x02 RESIZE`：uvarint cols/rows
- `0x03 EXIT`：退出码/信号
- `0x04 ERROR`：错误码 + 文本
- `0x05/0x06 PING/PONG`
- `0x07 READY`：会话 ID、模式、尺寸
- `0x08 ACK`：客户端确认字节数
- `0x09 RESUME`：携带 sessionId/resumeToken/lastSeq

## 前端

- React + TypeScript + Vite + xterm.js。
- 终端实例在 React 外，标签只渲染稳定容器。
- WebGL 渲染，失败降级 DOM renderer。
- 主题由 `themes/presets.json` 生成 TypeScript；支持导入 `.itermcolors`。

## 存储

bbolt 单文件，schema 版本化；secrets 加密；会话不落盘。
