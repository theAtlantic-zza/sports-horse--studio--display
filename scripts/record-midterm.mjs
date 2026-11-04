import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Run against a browser-demo build. All interactions use an isolated browser.
const root = fileURLToPath(new URL("../", import.meta.url));
const work = path.join(root, "work/midterm-video");
const output = path.join(root, "public/demo/equivision-midterm-demo.mp4");
const url = process.argv[2] || "http://127.0.0.1:4176/?presentation=1";
const framesDirectory = path.join(work, "raw/frames");
for (const directory of [work, path.join(work, "qa"), framesDirectory, path.dirname(output)])
  await mkdir(directory, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 840 },
  locale: "zh-CN",
  timezoneId: "Asia/Shanghai",
});
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const cursor = document.createElement("div");
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.cssText = "position:fixed;left:-100px;top:-100px;width:26px;height:26px;border:2px solid #c3ca95;border-radius:50%;background:#c3ca9533;box-shadow:0 0 0 2px #173f3570;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);transition:background .15s";
    document.body.append(cursor);
    document.addEventListener("pointermove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    }, true);
    document.addEventListener("pointerdown", () => {
      cursor.style.background = "#c3ca95bb";
      cursor.animate([{ transform: "translate(-50%,-50%) scale(1)" }, { transform: "translate(-50%,-50%) scale(1.7)" }, { transform: "translate(-50%,-50%) scale(1)" }], 330);
    }, true);
    document.addEventListener("pointerup", () => { cursor.style.background = "#c3ca9533"; }, true);
  });
});

const page = await context.newPage();
const session = await context.newCDPSession(page);
// Chrome's headless window includes an invisible title bar. Calibrate the
// visible capture surface before recording to avoid a cropped/grey bottom.
const calibration = new Promise((resolve) => session.once("Page.screencastFrame", resolve));
await session.send("Page.startScreencast", { format: "png", maxWidth: 1600, maxHeight: 840 });
const first = await calibration;
await session.send("Page.screencastFrameAck", { sessionId: first.sessionId });
await session.send("Page.stopScreencast");
const window = await session.send("Browser.getWindowForTarget");
await session.send("Browser.setWindowBounds", { windowId: window.windowId, bounds: { width: window.bounds.width, height: window.bounds.height + 840 - first.metadata.deviceHeight } });
const frames = [];
const writes = [];
let recordingStart = 0;
const elapsed = () => Date.now() / 1000 - recordingStart;
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const scenes = [];
const pause = (milliseconds) => page.waitForTimeout(milliseconds);
let mouse = { x: 900, y: 700 };
async function moveTo(x, y, duration = 350) {
  const from = { ...mouse };
  const steps = Math.max(6, Math.round(duration / 30));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const smooth = t * t * (3 - 2 * t);
    await page.mouse.move(from.x + (x - from.x) * smooth, from.y + (y - from.y) * smooth);
    await pause(duration / steps);
  }
  mouse = { x, y };
}
async function click(locator, duration = 350) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Recording target is not visible");
  await moveTo(box.x + box.width / 2, box.y + box.height / 2, duration);
  await page.mouse.down();
  await pause(90);
  await page.mouse.up();
}
async function scene(label, caption, duration, action) {
  const start = elapsed();
  await action();
  scenes.push({ label, caption, duration, start, end: elapsed() });
  await page.screenshot({ path: path.join(work, `qa/${label}.png`) });
}
async function imagePoint(x, y) {
  return page.getByTestId("annotation-canvas").evaluate((node, point) => {
    const svg = node;
    const result = new DOMPoint(svg.viewBox.baseVal.width * point.x, svg.viewBox.baseVal.height * point.y).matrixTransform(svg.getScreenCTM());
    return { x: result.x, y: result.y };
  }, { x, y });
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".stat-value").first()).toContainText("05");
  const recordingReady = new Promise((resolve) => {
    session.on("Page.screencastFrame", (frame) => {
      const filename = path.join(framesDirectory, `frame-${String(frames.length).padStart(5, "0")}.png`);
      if (!recordingStart) recordingStart = frame.metadata.timestamp;
      frames.push({ filename, timestamp: frame.metadata.timestamp });
      writes.push(writeFile(filename, Buffer.from(frame.data, "base64")));
      void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
      resolve();
    });
  });
  await session.send("Page.startScreencast", { format: "png", maxWidth: 1600, maxHeight: 840, everyNthFrame: 1 });
  await recordingReady;
  await page.mouse.move(mouse.x, mouse.y);
  await pause(300);

  await scene("01-overview", "从一张影像，开始一次完整的标注记录", 2.1, async () => {
    await pause(1400);
    await moveTo(400, 570, 450);
    await pause(350);
  });

  await scene("02-analysis", "选择内置示例，完成模拟分析", 3.0, async () => {
    await click(page.getByRole("button", { name: "开始分析", exact: true }));
    await expect(page.getByRole("dialog")).toBeVisible();
    await pause(650);
    await click(page.locator(".demo-file"));
    await expect(page.getByText("模拟分析已完成", { exact: true })).toBeVisible();
    await pause(600);
  });

  await scene("03-annotation", "填写病变类型与置信度，拖动鼠标标记关注区域", 4.4, async () => {
    const lesion = page.getByLabel("病变类型", { exact: true });
    await click(lesion);
    await page.keyboard.press("Escape");
    await lesion.selectOption("关节间隙异常");
    await pause(350);
    const slider = page.getByRole("slider", { name: "置信程度" });
    await click(slider);
    await slider.focus();
    await page.keyboard.press("End");
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveValue("92");
    await pause(300);
    const start = await imagePoint(0.29, 0.25);
    const end = await imagePoint(0.53, 0.43);
    await moveTo(start.x, start.y, 450);
    await page.mouse.down();
    await moveTo(end.x, end.y, 1100);
    await page.mouse.up();
    await expect(page.locator("[data-shape-id]")).toHaveCount(1);
    await pause(650);
  });

  await scene("04-confirmation", "核对标注人和标注信息，确认归档", 2.1, async () => {
    await click(page.getByRole("button", { name: "确认并保存", exact: true }));
    await expect(page.getByRole("dialog")).toContainText("王一伊");
    await pause(1250);
    await click(page.getByRole("button", { name: "确认保存标注", exact: true }));
    await expect(page.getByRole("dialog")).toHaveAccessibleName("影像标注档案");
  });

  await scene("05-archive", "原图与标注结果一同留存，按编号下载", 4.4, async () => {
    await expect(page.getByRole("dialog")).toContainText("EV-000006");
    await expect(page.getByRole("img", { name: "保存的标注结果图片" })).toBeVisible();
    await pause(1900);
    const downloadEvent = page.waitForEvent("download");
    await click(page.getByRole("link", { name: "下载标注图片", exact: true }));
    const download = await downloadEvent;
    await download.saveAs(path.join(work, "qa/recorded-annotation.png"));
    const png = await readFile(path.join(work, "qa/recorded-annotation.png"));
    expect(png.readUInt32BE(16)).toBe(1183);
    expect(png.readUInt32BE(20)).toBe(1024);
    await pause(950);
  });

  await scene("06-dashboard", "编号归档、统计看板与记录管理，形成完整闭环", 3.0, async () => {
    await click(page.getByRole("button", { name: "关闭对话框", exact: true }), 250);
    await click(page.getByRole("button", { name: "数据看板", exact: true }), 300);
    await expect(page.locator(".dashboard-metric").first()).toContainText("09");
    await expect(page.locator(".dashboard-metric").nth(2)).toContainText("06");
    await pause(550);
    await click(page.getByRole("button", { name: "标注记录 6", exact: true }), 250);
    await expect(page.locator(".dashboard-table")).toContainText("EV-000006");
    await expect(page.locator(".dashboard-table")).toContainText("王一伊");
    await page.locator(".dashboard-table tbody tr").first().scrollIntoViewIfNeeded();
    await pause(1450);
  });
  expect(errors).toEqual([]);
  await pause(200);
} finally {
  await session.send("Page.stopScreencast");
  await Promise.all(writes);
  await context.close();
}

const rawPath = path.join(work, "raw/frames.ffconcat");
await writeFile(rawPath, "ffconcat version 1.0\n" + frames.map((frame, index) => `file '${frame.filename}'\nduration ${index + 1 < frames.length ? Math.max(0.001, frames[index + 1].timestamp - frame.timestamp) : recordingStart + scenes.at(-1).end - frame.timestamp + 0.3}\n`).join("") + `file '${frames.at(-1).filename}'\n`);
const subtitlePage = await browser.newPage({ viewport: { width: 1920, height: 72 } });
for (const [index, scene] of scenes.entries()) {
  await subtitlePage.setContent(`<!DOCTYPE html><html lang="zh-CN"><style>
    *{box-sizing:border-box}body{margin:0;width:1920px;height:72px;background:#173f35;color:#f4f7ed;font-family:"PingFang SC","Microsoft YaHei",sans-serif;display:flex;align-items:center;padding:0 38px;gap:24px}
    .step{font:600 19px "Avenir Next",sans-serif;letter-spacing:2px;color:#c3ca95;border-right:1px solid #557464;padding-right:24px;min-width:140px}
    .caption{font-size:28px;letter-spacing:1px}.note{margin-left:auto;color:#c1d2c2;font-size:17px;letter-spacing:1px}
    </style><body><span class="step">0${index + 1} / 06</span><span class="caption">${scene.caption}</span><span class="note">演示数据 · 模拟分析</span></body></html>`);
  await subtitlePage.evaluate(() => document.fonts.ready);
  scene.captionPath = path.join(work, `${scene.label}-caption.png`);
  await subtitlePage.screenshot({ path: scene.captionPath });
}
await browser.close();
await writeFile(path.join(work, "timeline.json"), JSON.stringify({ url, rawPath, scenes }, null, 2));

const inputs = ["-f", "concat", "-safe", "0", "-i", rawPath, ...scenes.flatMap((scene) => ["-loop", "1", "-i", scene.captionPath])];
const filters = [`[0:v]fps=30,split=${scenes.length}${scenes.map((_, i) => `[r${i}]`).join("")}`];
for (const [index, scene] of scenes.entries()) {
  const factor = scene.duration / (scene.end - scene.start);
  filters.push(`[r${index}]trim=start=${scene.start}:end=${scene.end},setpts=(PTS-STARTPTS)*${factor},fps=30,scale=1920:1008:flags=lanczos,pad=1920:1080:0:0:color=0x173f35,setsar=1[b${index}]`);
  filters.push(`[b${index}][${index + 1}:v]overlay=0:1008:shortest=1[s${index}]`);
}
filters.push(`${scenes.map((_, i) => `[s${i}]`).join("")}concat=n=${scenes.length}:v=1:a=0,format=yuv420p[v]`);
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", "-t", "19", output], { stdio: "inherit" });
const metadata = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", output], { encoding: "utf8" }));
const stream = metadata.streams.find((item) => item.codec_type === "video");
expect(stream.width).toBe(1920);
expect(stream.height).toBe(1080);
expect(stream.pix_fmt).toBe("yuv420p");
expect(Number(metadata.format.duration)).toBeGreaterThanOrEqual(18.8);
expect(Number(metadata.format.duration)).toBeLessThanOrEqual(19.1);
await writeFile(path.join(work, "qa/video-metadata.json"), JSON.stringify(metadata, null, 2));
for (const seconds of [1, 4, 8, 11, 14, 18])
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(seconds), "-i", output, "-frames:v", "1", "-update", "1", path.join(work, `qa/frame-${seconds}s.png`)]);
console.log(JSON.stringify({ output, duration: metadata.format.duration, width: stream.width, height: stream.height, workflowVerified: true, browserErrors: errors }, null, 2));
