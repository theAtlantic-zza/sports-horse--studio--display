# EQUIVISION · 运动马 AI 辅助诊疗演示

一个用于中期汇报的运动马影像工作台，主流程为演示登录、已标注影像导入或人工标注、选择检查信息、AI 模拟分析、百分比诊疗报告、人工复核及看板归档。界面沿用深绿色侧边栏和浅色工作台，保留原有标注工具与记录增删改查。遵循用户提供的 `CLAUDE.md`。

## 在线演示与数据范围

GitHub 仓库：<https://github.com/theAtlantic-zza/sports-horse--studio--display>。

GitHub Pages 展示入口：<https://theatlantic-zza.github.io/sports-horse--studio--display/?presentation=1#clinical>。数据看板仍可通过 `#dashboard` 进入。仓库 Settings → Pages 的 Source 设为 GitHub Actions 后，推送 main 分支会自动测试、构建并发布。

Sites 备用入口：<https://equivision-xray-studio.zza1343538124.chatgpt.site/#dashboard>，已由平台确认发布成功；此地址在本次浏览器检查中遇到 Cloudflare 访问拦截。Sites 访问权限默认为站点所有者。

线上版本使用浏览器 IndexedDB 保存演示数据，首次访问预置 8 张影像和 5 份标注档案。演示标注人为王一伊、朱诗嘉、阿里米热、李其杭；已有缓存中的旧演示姓名会在刷新后自动更新。每个浏览器独立保存数据，刷新后保留；清除网站数据后恢复初始演示。分析结果固定生成，未接入真实模型、真实诊断或业务认证。

本地还提供同一套业务规则的 Express 模拟 API，使用 JSON 文件持久化。线上版本无需本地服务保持运行。

## 功能与验收路径

1. **演示登录**：选择王一伊、朱诗嘉、阿里米热或李其杭，点击“登录工作台”。无需密码，身份只在当前标签页会话中留存，不提供真实认证或权限控制。
2. **准备影像**：载入内置已标注示例，或上传已标注 PNG / JPG / WebP（最大 10 MB、8000 × 8000）；也可点击“进入标注界面”在原图上拖动矩形框。上传即分配 `IMG-000001` 等编号，上传不会自动启动分析。
3. **选择上下文**：填写马匹，选择检查部位及关注病变类型，然后点击“开始 AI 辅助分析”。人工标注方式必须先至少绘制一个区域。
4. **模拟分析**：约 4.8 秒，展示准备影像、核对部位和病变、计算病变倾向、生成报告四个阶段。没有模型调用，也不分析像素；固定演示分布为 82% / 12% / 6%，随选择的关注病变排列。
5. **查看报告**：生成 `EV-000001` 等编号的待复核报告，展示影像、部位、百分比、模拟发现及建议；明显提示“AI 仅提供参考，最终结论由人工复核确认”。AI 百分比并非真实患病概率。
6. **人工复核**：点击“人工复核”，选择复核人、填写复核意见，确认后在同一记录中写入已复核状态、意见和北京时间。AI 结果与人工意见分别保留。
7. **看板留存**：“查看数据看板”自动定位并高亮本次诊疗记录。显示关联图片编号、病变百分比、状态、操作人和复核人；支持诊疗报告筛选、详情复看、搜索、修改和删除。清除搜索恢复完整趋势图。

已有数据无需重置：首次访问仍预置 8 张影像与 5 份人工标注档案，诊疗报告按后续操作新增。不同浏览器数据独立，刷新保留。上传已标注图片不猜测几何位置，允许零个可编辑标注框；内置示例有已知的演示标注。

修改检查部位、标注图形或标注图片时，相关旧 AI 报告及复核状态失效，保留图片、记录编号和创建时间，需重新分析。删除标注/诊疗记录保留原始影像；删除影像同时移除其关联记录。编号不会在删除后重复使用。

原有“总览工作台”和“影像标注”入口保留：矩形框（R）、多边形（P）、线段（L）、选择移动（V）、Delete 删除、⌘Z / Ctrl+Z 撤销；支持原图/标注图对照和 PNG 下载。

## 中期汇报视频

汇报视图：<https://theatlantic-zza.github.io/sports-horse--studio--display/?presentation=1>。

视频入口：<https://theatlantic-zza.github.io/sports-horse--studio--display/demo/equivision-midterm-demo.mp4>。

视频主线：登录 → 载入已标注示例 → 展开检查部位与病变类型选项并选择 → AI 模拟分析等待 → 百分比诊疗报告 → 人工复核 → 看板新增一条记录。全部使用独立浏览器中的演示数据，不上传真实影像或调用分析模型。当前成片约 19.4 秒、1920 × 1080、30 fps、中文字幕、无配音。

右上角“汇报模式”可切换适合桌面录屏的紧凑布局。归档信息与画布、病变属性同屏；退出模式保留当前标注与填写信息。

与参考站 `elfaw775/equivision-preview` 的区别：本站当前以影像、模拟 AI 报告和人工复核形成闭环；参考站以马匹、病例、多体位阅片和版本化人工报告草稿为核心。参考站的数据标注、专家复核仍是二期结构预览，AI 未接入。本次只借鉴其视觉层次和步骤提示，没有移植尚未实现的菜单。

当前视频主文件为 `public/demo/equivision-midterm-demo.mp4`，随 GitHub Pages 一同发布。可复用录制脚本在 `scripts/record-midterm.mjs`；原始录屏、字幕素材、抽帧和校验记录放在忽略提交的 `work/midterm-video/`。

需要重录时，先执行 `npm run build`，另一个终端启动 `npx vite preview --host 127.0.0.1 --port 4176 --strictPort`，再执行：

```sh
npm run record:midterm -- 'http://127.0.0.1:4176/?presentation=1'
```

录制需要已安装的 Google Chrome、FFmpeg 和 FFprobe。脚本以真实鼠标操作完成登录、分析、复核及看板查询，验证等待时长、百分比、复核状态与刷新留存，再加速、叠加字幕并输出 MP4；不会访问用户现有浏览器数据。

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

- `src/App.tsx`：导航、主流程入口和原有标注工作台。
- `src/components/ClinicalWorkflow.tsx`：演示登录、影像输入、检查信息、分阶段模拟分析。
- `src/components/DiagnosticReport.tsx`：百分比报告与人工复核。
- `src/clinical.css`：辅助诊疗页面与报告的响应式样式。
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
- `tests/api.test.ts`：21 项 API 测试。
- `tests/e2e/`：7 项原有标注流程与 Express 诊疗集成测试。
- `tests/demo/`：10 项部署版本诊疗、看板、CRUD 与汇报模式浏览器测试。
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
- `POST /api/studies/:id/analyze`：原标注工作台约 900 ms 后返回固定示例提示。
- `POST /api/studies/:id/diagnose`：约 4.8 秒后根据选择的部位/病变返回明确标记为 mock 的诊疗报告。
- `POST /api/records/:id/review`：对同一报告登记人工复核人、意见和时间。
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

当前验证：严格类型检查和两种构建均通过；21 项 API、7 项本地集成浏览器测试、10 项线上演示模式测试全部通过。测试使用本机已安装的 Chrome，无需下载 Chromium。

验证覆盖编号留存、无效输入、模拟分析、三种绘制方式、移动 / 撤销 / 缩放、完整归档、修改后保留编号、搜索筛选分页、删除与关联清理、刷新和服务重启留存、PNG 下载格式与尺寸，以及手机和平板布局。测试数据和正式本地数据隔离。
