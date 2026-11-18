import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const caseId = "EV-000001";
const viewer = "/#viewer/" + caseId;
const screenshots = "work/qa/screenshots";

async function measure(page: Page, pane: Locator, tool: "distance" | "angle", points: number[][]) {
  await page.locator(`[data-tool="${tool}"]`).click();
  await pane.scrollIntoViewIfNeeded();
  const screen = await pane.locator("g.image-space").evaluate((node, points) => {
    const matrix = (node as SVGGraphicsElement).getScreenCTM()!;
    return points.map(([x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  }, points);
  for (const { x, y } of screen) await page.mouse.click(x, y);
  await expect(pane.locator(".measure-mark")).toHaveCount(1);
}

async function markValue(page: Page, unit: string, expected: number, tolerance: number) {
  const label = page.locator(".measurement-list b");
  await expect(label).toContainText(unit);
  expect(Math.abs(parseFloat(await label.innerText()) - expected)).toBeLessThan(tolerance);
}

test("direct viewer presents an explicitly labelled annotation copy of the same film", async ({ page }) => {
  await page.goto(viewer);
  const films = page.locator(".film-card");
  await expect(films).toHaveCount(1);
  await expect(page.locator("#viewer-compare")).toBeDisabled();
  const metadata = page.locator("#viewer-metadata");
  await metadata.getByLabel("投照方向").selectOption("侧位");
  await metadata.locator("button[type=submit]").click();
  await expect(films.first()).toContainText("侧位");
  await expect(page.locator(".sample-compare")).toContainText("同一张原片");
  await page.getByRole("button", { name: "载入标注对照片" }).click();
  await expect(films).toHaveCount(2);
  await expect(films.nth(1)).toContainText("同片标注对照");
  await expect(films.nth(1)).toContainText("侧位");
  await expect(page.getByRole("button", { name: "载入标注对照片" })).toHaveCount(0);
  await page.locator("#viewer-compare").click();
  const stages = page.locator(".film-stage");
  await expect(stages).toHaveCount(2);
  const dimensions = await stages.locator("g.image-space image").evaluateAll(async nodes => {
    return Promise.all(nodes.map(async node => {
      const image = node as SVGImageElement;
      const decoded = new Image();
      decoded.src = image.href.baseVal;
      await decoded.decode();
      return {
        width: image.width.baseVal.value, height: image.height.baseVal.value,
        imageWidth: decoded.naturalWidth, imageHeight: decoded.naturalHeight,
      };
    }));
  });
  for (const item of dimensions) {
    expect([item.width, item.height]).toEqual([item.imageWidth, item.imageHeight]);
  }
  await page.screenshot({ path: screenshots + "/public-viewer-annotated-comparison.png", fullPage: true });
  await page.reload();
  await expect(films).toHaveCount(2);
  await expect(films.nth(1)).toContainText("同片标注对照");
});

test("file upload, independent projections and original-pixel measurements survive reload", async ({ page }) => {
  await page.goto(viewer);
  await expect(page.locator(".film-card")).toHaveCount(1);
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "补充影像" }).click();
  // An independent upload may share the display name of the built-in annotated copy.
  await (await chooserEvent).setFiles({
    name: "同片标注对照.png", mimeType: "image/png",
    buffer: await readFile("public/demo/horse-xray-source.png"),
  });
  const films = page.locator(".film-card");
  await expect(films).toHaveCount(2);
  await expect(films.nth(1)).toContainText("同片标注对照.png");
  await expect(page.getByRole("button", { name: "载入标注对照片" })).toBeVisible();
  await films.nth(1).click();
  const meta = page.locator("#viewer-metadata");
  await meta.getByLabel("投照方向").selectOption("背内侧-掌外侧斜位");
  await meta.locator('[name="quality"]').selectOption("一般");
  await meta.locator("button[type=submit]").click();
  await expect(films.nth(1)).toContainText("背内侧-掌外侧斜位");
  await films.first().click();
  await page.locator("#viewer-compare").click();
  const left = page.locator('.film-stage[data-pane="left"]');
  const right = page.locator('.film-stage[data-pane="right"]');
  await expect(left).toHaveAttribute("data-image-id", "primary");
  await expect(right).toHaveAttribute("data-image-id", "1");
  await page.locator('[data-view="zoom-in"]').click();
  await page.locator('[data-view="flip"]').click();
  await measure(page, left, "distance", [[550, 450], [580, 490]]);
  await markValue(page, "px", 50, 4);
  await measure(page, right, "angle", [[900, 480], [1000, 480], [1000, 580]]);
  await markValue(page, "°", 90, 4);
  await page.reload();
  await expect(films).toHaveCount(2);
  await markValue(page, "px", 50, 4);
  await films.nth(1).click();
  await expect(meta.locator('[name="quality"]')).toHaveValue("一般");
  await markValue(page, "°", 90, 4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#viewer-compare").click();
  await expect(right).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: screenshots + "/public-viewer-mobile-comparison.png", fullPage: true });
});

test("existing numbered case generates a simulated report, restores its draft and appears in history after signing and archive", async ({ page }) => {
  await page.goto(viewer + "/report");
  await page.getByRole("button", { name: "开始模拟分析" }).click();
  const report = page.getByTestId("diagnosis-report");
  await expect(report).toContainText(caseId, { timeout: 10000 });
  await expect(report).toContainText("82%");
  await expect(report).toContainText("AI 仅提供参考");
  await page.getByRole("button", { name: "人工复核", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "人工复核" });
  const findings = "阅片演示，已核对主图可见范围和关注区。";
  const conclusion = "本次复核已确认模拟报告。";
  await draft.getByLabel("复核人").selectOption("朱诗嘉");
  await draft.getByLabel("影像所见").fill(findings);
  await draft.getByLabel("复核意见").fill(conclusion);
  await draft.getByRole("button", { name: "保存草稿" }).click();
  await expect(draft).toContainText("草稿已保存");
  await page.reload();
  await expect(report).toContainText("待人工复核");
  await page.getByRole("button", { name: "人工复核", exact: true }).click();
  await expect(draft.getByLabel("影像所见")).toHaveValue(findings);
  await expect(draft.getByLabel("复核意见")).toHaveValue(conclusion);
  await draft.getByLabel("复核人").selectOption("李其杭");
  await draft.getByRole("button", { name: "确认复核", exact: true }).click();
  await expect(report).toContainText("已复核待归档");
  await expect(report).toContainText("李其杭");
  await page.getByRole("button", { name: "归档报告" }).click();
  await expect(report).toContainText("归档时间");
  await page.screenshot({ path: screenshots + "/public-viewer-reviewed-report.png", fullPage: true });
  await page.getByRole("button", { name: "查看数据看板" }).click();
  await expect(page).toHaveURL(/#dashboard$/);
  await page.getByRole("button", { name: /诊疗报告\s*1/ }).click();
  await page.getByLabel("搜索数据记录").fill(caseId);
  await page.getByLabel("按记录状态筛选").selectOption("annotated");
  const row = page.locator(".dashboard-table tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(caseId);
  await expect(row).toContainText("已归档");
  await expect(row).toContainText("李其杭");
  await row.getByRole("link", { name: "阅片 " + caseId }).click();
  await expect(page).toHaveURL(/#viewer\/EV-000001$/);
  await expect(page.locator('[data-tool="distance"]')).toBeDisabled();
});
