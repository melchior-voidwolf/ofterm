# 主题溯源

`themes/presets.json` 中的颜色是独立转录的数值数据，不包含 iTerm2 的源代码或 `.itermcolors` 文件本体。

| id | 显示名 | 来源 | 许可/说明 |
|---|---|---|---|
| high-contrast | High Contrast | iTerm2 内置预设（数值转录） | 颜色值为数据；名称用于兼容性描述 |
| regular | Regular | iTerm2 内置预设（数值转录） | 同上 |
| solarized | Solarized | iTerm2 内置预设（数值转录） | 同上；Solarized 原始配色为 MIT |
| dark-background | Dark Background | iTerm2 内置预设（数值转录） | 同上 |
| light-background | Light Background | iTerm2 内置预设（数值转录） | 同上 |
| pastel-dark-background | Pastel (Dark Background) | iTerm2 内置预设（数值转录） | 同上 |
| smoooooth | Smoooooth | iTerm2 内置预设（数值转录） | 同上 |
| solarized-dark | Solarized Dark | iTerm2 内置预设（数值转录） | 同上 |
| solarized-light | Solarized Light | iTerm2 内置预设（数值转录） | 同上 |
| tango-dark | Tango Dark | iTerm2 内置预设（数值转录） | Tango 调色板；数值转录 |
| tango-light | Tango Light | iTerm2 内置预设（数值转录） | 同上 |
| material-design-colors | Material Design Colors | https://github.com/MartinSeeler/iterm2-material-design | MIT，Copyright (c) 2015 Martin Seeler |

## 处理方式

1. 在内部分析环境中读取本机 iTerm2 的预设颜色，仅提取 Background/Foreground/Cursor/Selection/Bold/ANSI 0-15 的数值。
2. 转写为本项目自有 JSON 结构，不复制 plist 键值组织或文件。
3. 高对比度/Regular/Solarized 保留 light/dark 变体，按应用亮暗模式选择。
4. 发布物不包含 iTerm2 的 `ColorPresets.plist` 或任何 iTerm2 资源文件。

## 商标

iTerm2 是 George Nachman 的商标。OFTerm 与 iTerm2 无隶属、背书或赞助关系。预设名称仅用于描述颜色兼容性。
