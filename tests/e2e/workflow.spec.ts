import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

async function point(page: Page, x: number, y: number) {
  return page.getByTestId("annotation-canvas").evaluate(
    (node, position) => {
      const svg = node as SVGSVGElement;
      const result = new DOMPoint(
        svg.viewBox.baseVal.width * position.x,
        svg.viewBox.baseVal.height * position.y,
      ).matrixTransform(svg.getScreenCTM()!);
      return { x: result.x, y: result.y };
    },
    { x, y },
  );
}

async function drag(
  page: Page,
  start: [number, number],
  end: [number, number],
) {
  const a = await point(page, ...start);
  const b = await point(page, ...end);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "体验内置示例", exact: true }).click();
  await expect(page.getByText("模拟分析已完成", { exact: true })).toBeVisible();
}

test("dashboard, guide, empty workspace and file picker", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "影像标注工作台." }),
  ).toBeVisible();
  await mkdir("work/qa/screenshots", { recursive: true });
  await page.screenshot({
    path: "work/qa/screenshots/overview-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "演示使用指南", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "影像标注", exact: true }).click();
  await expect(page.getByText("让影像里的细节，被看见。")).toBeVisible();
  await page.getByRole("button", { name: "上传影像", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("拖拽图片到这里");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "选择图片", exact: true }).click();
  expect((await picker).isMultiple()).toBe(false);
  expect(errors).toEqual([]);
});

test("complete three-shape annotation, edit, undo, archive, persistence and PNG download", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await demo(page);
  await expect(
    page.getByRole("button", { name: "确认并保存", exact: true }),
  ).toBeDisabled();
  await page.getByRole("slider", { name: "置信程度" }).focus();
  await page.keyboard.press("End");
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
  await page
    .getByRole("textbox", { name: "标注备注" })
    .fill("演示标注：仅用于流程验收");
  await drag(page, [0.29, 0.25], [0.53, 0.43]);
  await expect(page.locator("[data-shape-id]")).toHaveCount(1);
  await expect(page.getByText("正在编辑标注 01")).toBeVisible();

  await page.getByRole("button", { name: "多边形", exact: true }).click();
  await page.getByLabel("病变类型", { exact: true }).selectOption("骨密度异常");
  for (const coordinates of [
    [0.37, 0.49],
    [0.56, 0.48],
    [0.53, 0.61],
    [0.38, 0.6],
  ]) {
    const p = await point(page, coordinates[0], coordinates[1]);
    await page.mouse.click(p.x, p.y);
  }
  await page.getByRole("button", { name: "完成多边形 ↵" }).click();
  await expect(page.locator("[data-shape-id]")).toHaveCount(2);
  await page.getByRole("button", { name: "线段", exact: true }).click();
  await page
    .getByLabel("病变类型", { exact: true })
    .selectOption("关节间隙异常");
  await drag(page, [0.33, 0.66], [0.57, 0.69]);
  await expect(page.locator("[data-shape-id]")).toHaveCount(3);
  await page.getByRole("button", { name: "撤销上一步" }).click();
  await expect(page.locator("[data-shape-id]")).toHaveCount(2);
  await drag(page, [0.33, 0.66], [0.57, 0.69]);
  await expect(page.locator("[data-shape-id]")).toHaveCount(3);

  await page.locator(".annotation-select").first().click();
  await page.getByLabel("病变类型", { exact: true }).selectOption("骨折疑似");
  await page
    .getByRole("textbox", { name: "标注人", exact: true })
    .fill("演示验收员");
  await page.screenshot({
    path: "work/qa/screenshots/annotation-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "确认并保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("3 处标注，准备归档");
  await expect(page.getByRole("dialog")).toContainText("演示验收员");
  await page.getByRole("button", { name: "确认保存标注", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("影像标注档案");
  await expect(
    page.getByRole("img", { name: "保存的原始 X 线影像" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "保存的标注结果图片" }),
  ).toBeVisible();
  await page.screenshot({
    path: "work/qa/screenshots/archive-comparison.png",
    fullPage: true,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载标注图片", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^EV-.+-annotated\.png$/);
  const output = path.resolve("work/qa/annotation-download.png");
  await download.saveAs(output);
  const png = await readFile(output);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.readUInt32BE(16)).toBe(1183);
  expect(png.readUInt32BE(20)).toBe(1024);

  const summaries = await (await page.request.get("/api/records")).json();
  const record = await (
    await page.request.get(`/api/records/${summaries[0].id}`)
  ).json();
  expect(record.annotations.map((item: { type: string }) => item.type)).toEqual(
    ["rectangle", "polygon", "line"],
  );
  expect(record.annotations[0].confidence).toBe(92);
  expect(record.annotations[0].points[0].x).toBeCloseTo(0.29, 2);
  expect(record.annotations[0].lesion).toBe("骨折疑似");
  expect(record.annotator).toBe("演示验收员");
  expect(record.annotatedImage).not.toBe(record.original.dataUrl);
  await page.reload();
  await page.getByRole("button", { name: "标注记录", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("演示验收员");
  await page
    .getByRole("textbox", { name: "搜索标注记录" })
    .fill("不存在的马匹");
  await expect(page.getByText("没有找到匹配的记录")).toBeVisible();
  await page.getByRole("textbox", { name: "搜索标注记录" }).fill("演示验收员");
  await page.getByRole("button", { name: "查看", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("骨折疑似");
  expect(errors).toEqual([]);
});

test("moving a region, undo, zoom alignment, label visibility and deletion", async ({
  page,
}) => {
  await demo(page);
  await drag(page, [0.25, 0.25], [0.5, 0.4]);
  await page.getByRole("button", { name: "选择 / 移动", exact: true }).click();
  await drag(page, [0.35, 0.33], [0.4, 0.38]);
  const movedX = Number(
    await page.locator("[data-shape-id] > rect").getAttribute("x"),
  );
  expect(movedX).toBeCloseTo(0.3 * 1183, 0);
  await page.getByRole("button", { name: "撤销上一步" }).click();
  expect(
    Number(await page.locator("[data-shape-id] > rect").getAttribute("x")),
  ).toBeCloseTo(0.25 * 1183, 0);
  await page.getByRole("button", { name: "切换标签显示" }).click();
  await expect(page.locator(".shape-label")).toHaveCount(0);
  await page.getByRole("button", { name: "切换标签显示" }).click();
  await expect(page.locator(".shape-label")).toHaveCount(1);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.locator(".viewer-options")).toContainText("125%");
  await page.getByRole("button", { name: "矩形框", exact: true }).click();
  await drag(page, [0.55, 0.45], [0.7, 0.6]);
  expect(
    Number(
      await page.locator("[data-shape-id] > rect").last().getAttribute("x"),
    ),
  ).toBeCloseTo(0.55 * 1183, 0);
  await page.getByRole("button", { name: "删除标注 2" }).click();
  await expect(page.locator("[data-shape-id]")).toHaveCount(1);
});

test("local image upload, invalid-file feedback and empty author validation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建标注", exact: true }).click();
  await page
    .getByLabel("上传本地影像文件")
    .setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
  await expect(page.getByRole("dialog")).toContainText(
    "支持 PNG、JPG、WebP 格式",
  );
  await page
    .getByLabel("上传本地影像文件")
    .setInputFiles(path.resolve("public/demo/horse-xray-source.png"));
  await expect(page.getByText("模拟分析已完成", { exact: true })).toBeVisible();
  await expect(page.getByText("本地上传", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /载入一处示例标注/ }).click();
  await page.getByRole("button", { name: "线段", exact: true }).click();
  await drag(page, [0.35, 0.65], [0.55, 0.7]);
  await expect(page.locator("[data-shape-id]")).toHaveCount(2);
  await expect(page.locator("[data-shape-id] > line")).toHaveCount(1);
  const ids = await page
    .locator("[data-shape-id]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-shape-id")),
    );
  expect(new Set(ids).size).toBe(2);
  await page.getByRole("textbox", { name: "标注人", exact: true }).fill("");
  await page.getByRole("button", { name: "确认并保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "请返回工作台，补全马匹名称、检查部位和标注人。",
  );
  await expect(
    page.getByRole("button", { name: "确认保存标注", exact: true }),
  ).toBeDisabled();
});

test("polygon drawing supports double-click, Enter and Escape", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "多边形", exact: true }).click();
  for (const coordinates of [
    [0.3, 0.3],
    [0.5, 0.3],
  ]) {
    const p = await point(page, coordinates[0], coordinates[1]);
    await page.mouse.click(p.x, p.y);
  }
  const last = await point(page, 0.4, 0.5);
  await page.mouse.dblclick(last.x, last.y);
  await expect(page.locator("[data-shape-id]")).toHaveCount(1);
  await expect(page.locator("[data-shape-id] > polygon")).toHaveCount(1);
  for (const coordinates of [
    [0.5, 0.5],
    [0.6, 0.5],
    [0.6, 0.6],
  ]) {
    const p = await point(page, coordinates[0], coordinates[1]);
    await page.mouse.click(p.x, p.y);
  }
  await page.getByTestId("annotation-canvas").press("Enter");
  await expect(page.locator("[data-shape-id]")).toHaveCount(2);
  const cancelPoint = await point(page, 0.3, 0.6);
  await page.mouse.click(cancelPoint.x, cancelPoint.y);
  await expect(page.locator(".polygon-action")).toBeVisible();
  await page.getByTestId("annotation-canvas").press("Escape");
  await expect(page.locator(".polygon-action")).toHaveCount(0);
  await expect(page.locator("[data-shape-id]")).toHaveCount(2);
});

test("mobile and tablet layouts keep primary interactions in view", async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "体验内置示例", exact: true })
      .click();
    await expect(
      page.getByText("模拟分析已完成", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await drag(page, [0.3, 0.3], [0.5, 0.5]);
    await expect(page.locator("[data-shape-id]")).toHaveCount(1);
    await page.screenshot({
      path: `work/qa/screenshots/annotation-${size.width}.png`,
      fullPage: true,
    });
  }
});
