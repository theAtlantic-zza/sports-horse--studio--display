# EQUIVISION · 运动马影像标注与数据看板

一个可以直接展示的马匹 X 线影像工作台，包含图片加载、模拟分析、三种人工标注工具、编号归档、统计看板和记录增删改查。界面沿用深绿色侧边栏和浅色工作台。遵循用户提供的 `CLAUDE.md`，只实现演示所需的功能。

## 在线演示与数据范围

GitHub 仓库：<https://github.com/theAtlantic-zza/sports-horse--studio--display>。

GitHub Pages 展示入口：<https://theatlantic-zza.github.io/sports-horse--studio--display/#dashboard>。仓库 Settings → Pages 的 Source 设为 GitHub Actions 后，推送 main 分支会自动测试、构建并发布。

Sites 备用入口：<https://equivision-xray-studio.zza1343538124.chatgpt.site/#dashboard>，已由平台确认发布成功；此地址在本次浏览器检查中遇到 Cloudflare 访问拦截。Sites 访问权限默认为站点所有者。

线上版本使用浏览器 IndexedDB 保存演示数据，首次访问预置 8 张影像和 5 份标注档案。演示标注人为王一伊、朱诗嘉、阿里米热、李其杭；已有缓存中的旧演示姓名会在刷新后自动更新。每个浏览器独立保存数据，刷新后保留；清除网站数据后恢复初始演示。分析结果固定生成，未接入真实模型、真实诊断或业务认证。

本地还提供同一套业务规则的 Express 模拟 API，使用 JSON 文件持久化。线上版本无需本地服务保持运行。

## 功能与验收路径

1. **数据看板**：查看累计上传、模拟分析、标注归档、病变区域数量、近 7 天趋势和病变类型分布。
2. **新增图片**：点击“新增影像”，上传 PNG / JPG / WebP（最大 10 MB、8000 × 8000），也可选择内置 X 线示例。
3. **独立编号**：图片上传即分配 `IMG-000001`，不必完成标注；标注归档分配 `EV-000001`。编号不会在删除后重复使用。
4. **人工标注**：矩形框与线段拖动绘制；多边形单击添加顶点，双击或 Enter 完成，Esc 取消。支持属性、置信度、备注、移动、撤销、缩放和删除区域。
5. **完整归档**：确认马匹、部位、标注人后保存，保留原始影像、标注图片、创建和更新时间，统一显示北京时间。
6. **查询**：影像记录与标注记录分别展示，支持编号 / 马匹 / 文件名 / 标注人搜索、状态 / 来源筛选、排序和分页。
7. **修改**：记录行的编辑按钮修改信息；“继续标注”可调整已有标注图形和属性，保存时更新原记录，保留原编号和创建时间。
8. **下载**：记录详情和看板均可下载带标注的 PNG 图片。
9. **删除**：确认后删除。删除标注档案保留原始上传；删除图片同时移除关联标注，看板统计同步更新。

快捷键：`V` 选择 / 移动、`R` 矩形框、`P` 多边形、`L` 线段、`Delete` 删除、`⌘Z / Ctrl+Z` 撤销。

## 中期汇报视频

汇报视图：<https://theatlantic-zza.github.io/sports-horse--studio--display/?presentation=1>。

视频入口：<https://theatlantic-zza.github.io/sports-horse--studio--display/demo/equivision-midterm-demo.mp4>。

视频以第一站的标注闭环为主线：总览 → 选择内置示例 → 模拟分析 → 设置病变与置信度、拖动框选 → 确认归档 → 原图/结果对照与下载 → 数据看板。全部操作使用浏览器独立演示数据，不上传真实影像或调用分析模型。成片为 19 秒、1920 × 1080、30 fps、中文字幕、无配音。

右上角“汇报模式”可切换适合桌面录屏的紧凑布局。归档信息与画布、病变属性同屏；退出模式保留当前标注与填写信息。

与参考站 `elfaw775/equivision-preview` 的区别：本站以单张影像编号和标注记录为核心；参考站以马匹、病例、多体位阅片和版本化人工报告草稿为核心。参考站的数据标注、专家复核仍是二期结构预览，AI 未接入。本次只借鉴其视觉层次和步骤提示，没有移植尚未实现的菜单。

当前视频主文件为 `public/demo/equivision-midterm-demo.mp4`，随 GitHub Pages 一同发布。可复用录制脚本在 `scripts/record-midterm.mjs`；原始录屏、字幕素材、抽帧和校验记录放在忽略提交的 `work/midterm-video/`。

需要重录时，先执行 `npm run build`，另一个终端启动 `npx vite preview --host 127.0.0.1 --port 4176 --strictPort`，再执行：

```sh
npm run record:midterm -- 'http://127.0.0.1:4176/?presentation=1'
```

录制需要已安装的 Google Chrome、FFmpeg 和 FFprobe。脚本以真实鼠标操作完成标注与下载，并验证新增编号及看板计数，再加速、叠加字幕并输出 MP4；不会访问用户现有浏览器数据。

## 本地运行

需要 Node.js 22.12 或更新版本。已在 Node.js 25.9.0 和 Google Chrome 下验证。

```sh
npm ci
npm run build:server
npm start
```

打开 <http://127.0.0.1:4173>。Express 只监听本机，前端和 API 使用同一端口。

开发时运行 `npm run dev`：前端 `127.0.0.1:5173` 自动代理 `/api` 到 `127.0.0.1:4001`。

构建完全独立的浏览器演示版本：

```sh
npm run build
npx vite preview --host 127.0.0.1
```

浏览器演示输出为 `dist/`；本地 API 版本输出为 `dist-server/`。不同运行模式不会覆盖彼此的记录。

## 目录与当前主文件

- `src/App.tsx`：原有工作台与标注流程。
- `src/components/DataDashboard.tsx`：统计看板、记录列表、查询、编辑与删除确认。
- `src/components/AnnotationCanvas.tsx`：SVG 标注画布，使用相对原图的归一化坐标。
- `src/imaging.ts`：示例影像提取、上传文件读取和标注 PNG 渲染。
- `src/api.ts`：统一接口；本地请求 Express，演示构建使用浏览器存储。
- `src/demo-store.ts`：IndexedDB 持久化与首次访问的示例数据。
- `shared/archive.ts`：两种运行方式共用的编号、校验、状态与增删改查规则。
- `server/app.ts`：模拟 API、串行写入、原子文件替换与旧数据导入。
- `data/image-archive.json`：本地版本的当前主数据，保存上传图片、分析状态及标注档案。首次修改后生成，不上传 GitHub。
- `data/annotation-records.json`：旧版本原始数据，若存在则自动导入，原文件保留不动；后续以 `image-archive.json` 为准。
- `public/demo/horse-xray-source.png`：用户授权的 X 线示例截图。运行时提取其中影像区域，源文件未修改。
- `tests/api.test.ts`：14 项 API 测试。
- `tests/e2e/`：6 项原有标注流程浏览器回归测试。
- `tests/demo/`：7 项部署版本看板、CRUD 与汇报模式浏览器测试。
- `work/qa/`：测试隔离数据、截图、下载样品与失败诊断。
- `.openai/hosting.json`：Sites 托管标识与静态部署目录，不包含凭据。
- `outputs/`：发布时生成的部署包，不纳入源码版本管理。

`data/`、`work/`、构建目录、依赖、环境文件和部署包都被 `.gitignore` 排除。GitHub 仅保存源码、必要示例素材、配置和说明。

## 模拟 API

- `GET /api/health`：演示服务状态。
- `GET /api/studies`：图片摘要及关联标注统计。
- `POST /api/studies`：保存上传图片并立即分配图片编号。
- `GET /api/studies/:id`：原图、编号、属性与分析状态。
- `PATCH /api/studies/:id`：修改影像名称、马匹、部位和标注人。
- `DELETE /api/studies/:id`：删除图片及关联标注。
- `POST /api/studies/:id/analyze`：约 900 ms 后返回固定模拟结果并更新状态。
- `GET /api/records`：标注档案摘要。
- `POST /api/records`：创建标注档案。
- `GET /api/records/:id`：完整档案和原图 / 标注图。
- `PATCH /api/records/:id`：修改档案信息或完整标注。
- `DELETE /api/records/:id`：删除标注档案，保留源图片。
- `GET /api/records/:id/download`：下载标注图片。

## 验证

```sh
npm run build:server
npm run build
npm test
npm run test:e2e
npm run test:demo
```

当前验证：严格类型检查和两种构建均通过；14 项 API、6 项原有标注流程、7 项线上演示模式测试全部通过。测试使用本机已安装的 Chrome，无需下载 Chromium。

验证覆盖编号留存、无效输入、模拟分析、三种绘制方式、移动 / 撤销 / 缩放、完整归档、修改后保留编号、搜索筛选分页、删除与关联清理、刷新和服务重启留存、PNG 下载格式与尺寸，以及手机和平板布局。测试数据和正式本地数据隔离。
