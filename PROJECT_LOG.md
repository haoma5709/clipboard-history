# 历史剪贴板 (Clipboard History) — 项目日志

## 概述

一个 Windows 本地剪贴板历史管理工具。后台静默记录最近复制过的文字和图片，按 `Ctrl+Shift+V` 弹出浮层查看历史、点击即可粘贴。设计理念：轻量、本地、无依赖。

**当前版本**: 1.0.0  
**创建日期**: 2026-05  
**状态**: 功能完整，可日常使用

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33 |
| 存储 | JSON 文件 (`%APPDATA%/clipboard-history/data/clips.json`) |
| 图片存储 | PNG 文件 (`%APPDATA%/clipboard-history/data/images/`) |
| 前端 | 原生 HTML/CSS/JS（无框架） |
| 构建 | 无构建工具，直接 `electron .` |

**刻意不引入的依赖**：
- 未使用 SQLite（最终用了更简单的 JSON 文件存储）
- 未使用 `@nut-tree/nut-js`（去掉了自动粘贴功能，见下方设计决策）

---

## 目录结构

```
clipboard-history/
├── main.js                  # Electron 主进程（所有核心逻辑）
├── preload.js               # contextBridge 暴露 API 给渲染进程
├── package.json             # 仅依赖 electron
├── assets/
│   └── icon.png             # 32×32 白色剪贴板轮廓图标（托盘用）
├── renderer/
│   ├── index.html           # UI 骨架
│   ├── app.js               # 渲染进程逻辑
│   └── styles.css           # 毛玻璃浅色主题样式
└── scripts/
    └── generate-icon.js     # 独立脚本：生成 icon.png（纯 Node，无需依赖）
```

**运行时数据目录**（自动创建）：
```
%APPDATA%/clipboard-history/data/
├── clips.json               # 所有剪贴板记录（JSON 数组）
└── images/                  # 图片记录对应的 PNG 文件
```

---

## 架构

### 主进程 (`main.js`)

所有核心功能都在主进程，约 284 行。

**模块划分**：

| 模块 | 函数 | 职责 |
|---|---|---|
| 存储 | `loadClips()`, `saveClips()`, `addClip()`, `queryClips()` | JSON 读写、新增记录、查询 |
| 清理 | `cleanupOldClips()`, `cleanOrphanedImages()` | 3 天过期 + 100 条上限 + 孤儿图片清理 |
| 剪贴板监控 | `checkClipboard()` | 每 500ms 轮询，检测文字/图片变化 |
| 窗口管理 | `createWindow()`, `showWindow()`, `toggleWindow()` | 无边框透明浮层，鼠标旁弹出 |
| 系统托盘 | `createTray()` | 托盘图标 + 右键菜单 + 左键切换窗口 |
| 图片协议 | `registerImageProtocol()` | 自定义 `clipboard-image://` 协议加载本地图片 |
| IPC | `setupIPC()` | `get-clips`, `paste-clip`, `hide-window` 三个接口 |
| 生命周期 | `app.whenReady()`, `before-quit`, `will-quit` | 启动初始化、退出前保存 |

### 预加载 (`preload.js`)

通过 `contextBridge.exposeInMainWorld` 暴露 4 个方法：
- `getClips()` — 获取全部历史
- `pasteClip(id)` — 复制到剪贴板（不再模拟 Ctrl+V）
- `hideWindow()` — 隐藏窗口
- `onWindowShown(cb)` — 窗口显示时回调（用于刷新数据）

### 渲染进程 (`renderer/`)

极简 UI，无搜索栏、无分组、无收藏/删除：
- 文字卡片：最多 3 行截断，`white-space: pre-wrap` 保留换行
- 图片卡片：缩略图预览（max-height: 100px）
- 点击卡片 → `pasteClip` → 窗口自动隐藏
- `Escape` 键隐藏窗口
- 每次窗口出现时重新加载数据

---

## 关键设计决策

### 1. JSON 文件而非 SQLite

**最初计划**用 `better-sqlite3`，但最终用 JSON 文件。原因：
- 数据量极小（最多 100 条，每条几百字节）
- 避免原生模块编译问题
- 启动更快，代码更简单

**权衡**：如果未来需要全文搜索或数据量增大，可能需要迁移。

### 2. 去掉了自动粘贴功能

**最初计划**点击历史项后自动模拟 Ctrl+V 粘贴到上一个应用。最终只做"复制到剪贴板"，让用户自己 Ctrl+V。

**原因**：
- 去掉 `@nut-tree/nut-js` 依赖
- 避免跨应用输入的安全问题
- 简化实现，减少出错可能

### 3. 去重策略

- **文字去重**：完全相同内容只保留最新一条，旧记录删除并移到顶部
- **图片去重**：基于 SHA-256 哈希，相同图片不重复存储
- **剪贴板轮询去重**：`lastText` / `lastImageDataUrl` 变量防止同一内容在连续轮询中重复触发

### 4. 窗口设计

- `frame: false` + `transparent: true` — 无边框透明窗口
- `alwaysOnTop: true` — 始终在最前
- `skipTaskbar: true` — 不显示在任务栏
- `show()` 时定位到鼠标光标附近，边界检测防止溢出屏幕
- `blur` 事件自动隐藏

### 5. UI 风格（毛玻璃浅色）

- 背景：`rgba(255, 255, 255, 0.72)` + `backdrop-filter: blur(24px)`
- 圆角：12px（窗口）、8px（卡片）
- 滚动条：4px 细滚动条，半透明
- 卡片入场动画：`slideIn` 12ms ease-out

### 6. 托盘图标

- 优先加载 `assets/icon.png`（32×32 白色剪贴板轮廓）
- 如果文件不存在，用 `nativeImage.createFromBitmap()` 动态绘制相同图案（硬编码像素数据）
- 图标包含：顶部夹子条、板面 2px 轮廓、三条半透明文字线（模拟内容）
- `scripts/generate-icon.js` 可重新生成 `icon.png`

### 7. 开机自启

通过 `app.setLoginItemSettings({ openAtLogin: true })` 实现，无需手动创建快捷方式。

### 8. 关闭 ≠ 退出

点击窗口 × 按钮 → 隐藏到托盘（拦截 `close` 事件）。  
右键托盘 → "退出" → 真正退出。

---

## 数据格式

`clips.json` 中每条记录：

```json
{
  "id": "uuid-v4",
  "type": "text | image",
  "text_content": "文字内容（图片为 null）",
  "image_filename": "uuid.png（文字为 null）",
  "image_hash": "sha256-hex（文字为 null）",
  "created_at": "ISO 8601 时间戳"
}
```

---

## IPC 接口

| 接口 | 方向 | 参数 | 返回 |
|---|---|---|---|
| `get-clips` | 渲染→主 | 无 | 所有 clip 数组（含 `image_url` 字段） |
| `paste-clip` | 渲染→主 | `id: string` | 无 |
| `hide-window` | 渲染→主 | 无 | 无 |
| `window-shown` | 主→渲染 | 无 | 信号，触发数据刷新 |

---

## 已知问题

### 1. 图片文件缺失时的 ERR_FILE_NOT_FOUND

**现象**：启动时控制台偶尔报 `ERR_FILE_NOT_FOUND`  
**原因**：`clips.json` 中引用的图片文件已被 `cleanOrphanedImages()` 清理，但记录还在（或反过来）。不影响功能，图片项不显示缩略图而已。  
**修复方向**：在 `cleanupOldClips` 或 `loadClips` 中做一次引用完整性校验。

### 2. 托盘图标尺寸

32×32 在 4K 高 DPI 屏幕上可能显小。`nativeImage.createFromBitmap` 不支持多尺寸。如果之后需要高清图标，可生成 64×64 的 PNG。

### 3. 窗口在部分应用中可能不弹出

`alwaysOnTop: true` 的窗口在部分全屏应用（游戏、视频播放器）中可能被遮挡。这是 Electron 的限制，不是 bug。

---

## 开发指南

### 启动

```bash
cd clipboard-history
npm start
```

### 重新生成托盘图标

```bash
node scripts/generate-icon.js
```

### 查看运行数据

数据在 `%APPDATA%/clipboard-history/data/` 下，可以直接打开 `clips.json` 查看。

### 调试

修改 `main.js` 中的 `createWindow()`，将 `show: false` 临时改为 `show: true`，窗口会直接显示。

---

## 变更历史

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-05 | 初版完成 | — |
| 2026-05 | 去掉自动粘贴（删除 nut-js 依赖） | 简化实现，减少安全问题 |
| 2026-05 | JSON 存储替代 SQLite | 数据量小，避免原生模块编译 |
| 2026-05 | 修复去重不一致 bug | `checkClipboard` 的 `recentTexts` 检查与 `addClip` 内部去重冲突 |
| 2026-05 | 托盘图标从紫色圆形改为白色剪贴板轮廓 | 用户审美偏好 |
| 2026-05 | UI 从深色主题改为毛玻璃浅色主题 | 用户审美偏好 |
