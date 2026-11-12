<div align="center">

# Tomatodo

**一个好看的本地待办 + 便签应用，菜单栏快速记录是一等公民**

Electron + Vue 3 + SQLite（`node:sqlite` 内建驱动，零原生编译）

[![License: MIT](https://img.shields.io/badge/License-MIT-2EA043.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/humbertcheung/Tomatodo?color=E14B4B)](https://github.com/humbertcheung/Tomatodo/releases/latest)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-555)

[下载安装](#下载安装) · [功能](#功能) · [界面预览](#界面预览) · [从源码构建](#从源码构建) · [常见问题](#常见问题)

</div>

---

## 简介

Tomatodo 是一个面向个人日常的待办与便签桌面应用：待办、便签、番茄钟三合一，菜单栏（托盘）快速记录面板让你不用切走当前窗口就能随手记一条，便签则像 macOS 备忘录的便签墙一样按颜色铺开。macOS 上还自带三个 WidgetKit 桌面小组件，把当天要做的事直接摆在桌面上。

- **数据 100% 本地**：无账号、无遥测，SQLite（WAL）+ 每条便签一个 RTF 文档
- **每条便签 = 一个 RTF 文档**：富文本与图片在 Word / Pages / Curiota 之间自由粘贴
- **桌面小组件（macOS）**：今日待办 / 已计划 / 便签三块，实时数据，勾选即完成
- **定时备份 + 一键恢复**：所有待办（JSON）+ 全部便签 RTF 打成一个 zip，按天/工作日/每周自动覆盖
- 原创实现：仅借鉴功能行为，不含任何第三方应用的代码或素材

## 功能

**待办**
- 智能列表：我的一天 / 重要 / 已计划 / 未完成 / 所有任务 / 已完成，计数实时对账
- 步骤、富文本备注、附件（文件 + 链接）、提醒、重复任务（完成后自动派生下一次）
- 备注编辑器支持格式刷快捷键：`⌥⌘C` 复制光标处样式、`⌥⌘V` 刷到选中文本（待办备注与便签编辑器通用）
- 自然语言日期：输入「明天 3点 买菜」自动识别截止与提醒
- 「已计划」页自带截止日 + 提醒字段，新增即落在计划视图里
- 卡片按状态着色（重要 / 逾期 / 今日 / 明日 / 我的一天 / 提醒）

**便签**
- 便签墙六色穿插，置顶、搜索、独立便签弹窗（可拖拽、可缩放、位置记忆）
- 富文本粘贴：HTML / RTF（含 GBK 中文转义与内嵌图片）/ 截图，通通吃得下
- 每条便签在磁盘上就是一个 RTF 文档；缺失的文档启动时自动重建，删除便签会同步删除文档
- 侧栏列出纯文本预览

**菜单栏快速记录**
- 左键点击菜单栏番茄图标即弹出：待办 / 便签双通道速记
- 行内展开查看详情、勾选即完成（与点击展开手势隔离）、便签筛选
- 窗口尺寸自由调节（拖拽边缘），大小与位置都记忆
- 标题栏内嵌一张番茄钟小卡片：番茄 logo + 倒计时 + 启停按钮，点「开始」直接切到极简番茄卡片
- 全局快捷键 `⌥⌘T` 开关面板（可自定义），可置顶（置顶后不再点空白关闭）、可拖动，位置与模块顺序均可记忆
- 标题栏内嵌番茄钟小卡片，点「开始」直接切到极简番茄卡片

**桌面小组件（macOS 14+）**
- 三块组件：今日待办、已计划、便签；小号 / 中号 / 大号三种尺寸
- 实时数据：组件直接向运行中的 App 取数，倒计时逐秒走动
- 组件上直接勾选完成待办，点标题跳回 App 对应条目（深链 `tomatodo://`）
- 「今日待办」组件带一张番茄卡片：番茄里的倒计时 + 专注胶囊 + 阶段进度条
- 组件语言跟随 App 语言，浅色 / 深色跟随系统

**天气（我的一天页首）**
- Open-Meteo 免 Key，IP 定位（多源回退）+ 系统时区 + 手动城市三种定位方式
- 24 小时 / 7 日 ECharts 温差图，动画天气图标：阶梯式动画 + 失焦自动暂停，空闲 CPU 接近 0
- **恶劣 / 极端天气提醒**：高温、低温、大风、雷暴、强降雨、强降雪命中时发系统通知（每天去重，可在设置里关掉）

**其他**
- 番茄钟：主进程计时（隐藏窗口也走时准确），25/5 循环 + **极简模式**（320×140 番茄卡片，暂停 / 重置 / 退出）
- 定时备份与「从备份恢复」（见下文「数据与备份」）、JSON 导出、Curiota 一键迁移脚本
- 主题：浅色（柔和多彩）/ 赛博朋克深色 / 跟随系统；内容区壁纸 + 模糊

## 界面预览

### 我的一天 · 天气

温度曲线按 3 小时采样，点、标签、柱与横轴完全对齐；天气图标按当前天气动画。

![我的一天](docs/screenshot-myday.png)

### 便签墙

每条便签一个 RTF 文档，颜色穿插、置顶分组、卡片墙 + 独立便签弹窗。

![便签](docs/screenshot-notes.png)

### 菜单栏快速记录

免切窗口随手记：标题栏里直接启停番茄钟，行内展开看详情，勾选圆圈直接完成。

![快速记录](docs/screenshot-quick.png)

### 桌面小组件

今日待办 / 已计划 / 便签三块组件，实时数据 + 可勾选 + 深链回 App。

![桌面小组件](docs/screenshot-widget.png)

### 极简番茄卡片

启动番茄钟后的极简模式：番茄里的倒计时、专注胶囊、阶段进度条与三个圆形按钮。

![极简番茄卡片](docs/screenshot-pomodoro.png)

### 定时备份与恢复

设置 → 数据：开关、频次（每天 / 工作日 / 每周一）、时间一目了然，还能整包恢复。

![定时备份](docs/screenshot-backup.png)

### 赛博朋克深色

![深色模式](docs/screenshot-dark.png)

## 项目结构

```
src/
├─ main/                主进程
│  ├─ index.js            IPC、窗口、启动调度
│  ├─ db.js               SQLite 数据层（node:sqlite，智能列表查询）
│  ├─ tray.js             菜单栏图标、快速记录面板
│  ├─ menu.js             应用菜单（快捷键与命令）
│  ├─ widget.js           小组件数据快照（buildSnapshot）
│  ├─ widget-server.js    小组件本地数据通道（127.0.0.1，只绑回环）
│  ├─ backup.js           定时备份（调度 + 归档 + 恢复）
│  ├─ zip.js              零依赖 ZIP 写入器（deflate/store + CRC32）
│  ├─ zip-read.js         零依赖 ZIP 读取器（备份还原用）
│  ├─ pomodoro.js         番茄钟（主进程计时）
│  ├─ weather.js          Open-Meteo 天气（30 分钟缓存 + 极端天气预警）
│  └─ reminders.js        提醒轮询
├─ preload/index.js     contextBridge 白名单 API
├─ renderer/            Vue 3 界面
│  └─ components/         TaskListView / TaskRow / NotesView / NotePopup
│                          WeatherPanel / QuickApp / PomodoroFocus
│                          SettingsModal …
└─ shared/              前后端共享
   ├─ rtf.js              自研 RTF 引擎（读写、图片内嵌、GBK 解码）
   ├─ nlp.js              中文自然语言日期解析
   ├─ recurrence.js       重复任务派生
   └─ i18n-mini.js        中英双语
widget/                 macOS WidgetKit 扩展（Swift）
├─ TomatodoWidget/       扩展源码（3 个组件 + 本地数据通道）
└─ generate-project.mjs  手写 .pbxproj（无需 xcodegen）
scripts/
├─ gen-icons.js          全套图标生成（应用图标 / 菜单栏图标）
├─ migrate-curiota.mjs   从 Curiota 迁移便签（--wipe / --reset / --dry-run）
├─ bundle-widget.mjs     把扩展塞进 App 的 Contents/PlugIns
├─ after-pack.js         打包后给 .appex 单独签名（带沙盒 + network.client）
├─ test-rtf.mjs          RTF 引擎回归测试
├─ test-counts.mjs       智能列表计数对账
├─ test-weather.mjs      极端天气预警与去重测试
├─ test-backup.mjs       备份与删除联动测试
└─ test-restore.mjs      备份还原端到端测试
```

## 下载安装

到 [Releases](https://github.com/humbertcheung/Tomatodo/releases/latest) 下载：

| 平台 | 文件 | 说明 |
|---|---|---|
| macOS (Apple Silicon) | `Tomatodo-x.y.z-arm64.dmg` | 拖入 Applications |
| Windows x64 | `Tomatodo x.y.z.exe` | 免安装单文件（portable） |
| Windows x64 | `Tomatodo-x.y.z-win.zip` | 解压即用 |

应用未做公证/签名，首次打开：

- **macOS**：右键 → 打开，或在「系统设置 → 隐私与安全性」中允许
- **Windows**：SmartScreen 弹窗选择「仍要运行」

数据目录：macOS `~/Library/Application Support/Tomatodo/`，Windows `%APPDATA%/Tomatodo/`。

> 桌面小组件需要 macOS 14 或更高版本；把 App 拖进「应用程序」后，在桌面右键 →「编辑小组件」里搜 **Tomatodo** 即可添加。

## 从源码构建

```bash
npm install            # 国内网络可加 --registry=https://registry.npmmirror.com
npm run dev            # 开发模式
npm run build          # 构建到 out/
npm run dist           # 打包：macOS dmg / Windows portable + zip

npm test               # RTF 引擎 + 计数对账（离线）
npm run test:backup    # 备份引擎（需要 Electron）
npm run test:restore   # 备份还原端到端
npm run test:weather   # 极端天气预警
```

macOS 小组件需要单独构建并随包一起打进去：

```bash
npm run widget:build   # xcodebuild 编译 WidgetKit 扩展
npm run widget:bundle  # 复制到 resources/widget/
npx electron-builder --mac
```

- 图标由 `scripts/gen-icons.js` 生成（`npx electron scripts/gen-icons.js`），产物已提交，可直接构建
- 打包镜像：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
- 小组件扩展必须带沙盒权限才会被系统图库收录，因此它无法直接读 App 的文件，改走 `127.0.0.1` 上的本地数据通道

## 数据与备份

定时备份把全部数据归档为一个 zip（路径 `~/Documents/Tomatodo/Tomatodo-backup.zip`，每次覆盖）：

```
Tomatodo-backup.zip
├── tasks.json      待办 / 列表 / 步骤 / 附件 / 便签元信息
└── notes/
    ├── <id>.rtf    每条便签对应的 RTF 文档
    └── …
```

- 便签本体存放在 `数据目录/notes/<id>.rtf`，设置 → 数据 → 「打开便签目录」可直接查看
- 删除便签会同时删除其 RTF 文件
- 设置 → 数据 → 「选择备份包并恢复」可把整个备份整包还原（待办 + 便签 + 文档）
- 从 Curiota 迁移：`node scripts/migrate-curiota.mjs --wipe`（一条记录 = 一个便签，含图片；源目录只读）

## 常见问题

**桌面小组件里搜不到 Tomatodo？** 确认用的是 `/Applications` 里的 App（不是解压出来的副本），然后重启一次 App —— 它启动时会把自己注册进系统的组件数据库。macOS 只收录**带沙盒**的组件扩展，Tomatodo 的扩展已带沙盒 + 本地网络权限。

**小组件显示「打开 Tomatodo 以同步数据」？** 组件的数据来自正在运行的 App，先把 Tomatodo 打开即可。

**菜单栏图标没出现？** macOS 菜单栏空间不足时会隐藏图标，建议隐藏几个不常用的菜单栏项；也可以在设置 → 菜单栏里切换图标的单色 / 彩色样式。

**天气不显示？** 首次加载需要网络（Open-Meteo，免 Key）；可在设置 → Weather 中切换手动城市，或直接填城市名搜索。

**番茄钟不跟着窗口走？** 计时跑在主进程里，窗口隐藏或切到极简卡片都不会走偏。

**换电脑迁移？** 拷贝整个数据目录，或用「导出数据 (JSON)」+ 便签目录一起打包；定时备份的 zip 就是完整的可迁移快照。

## License

[MIT](LICENSE)
