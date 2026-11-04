import { expect, test, type Page } from "@playwright/test";
import type { ArchiveState } from "../../shared/types";

async function stored(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("equivision-image-studio", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const archive = await new Promise<ArchiveState>((resolve, reject) => {
      const request = database
        .transaction("archive")
        .objectStore("archive")
        .get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return {
      studies: archive.studies.length,
      records: archive.records.map(
        ({ id, studyId, diagnosis, annotations }) => ({
          id,
          studyId,
          diagnosis,
          annotations,
        }),
      ),
    };
  });
}

async function login(page: Page) {
  await page.goto("/?presentation=1");
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
}

test("login, staged AI report, human review and dashboard persist as one record", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 840 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page
    .getByRole("button", { name: "载入已标注示例", exact: true })
    .click();
  await page
    .getByLabel("检查部位", { exact: true })
    .selectOption("左前肢 · 腕关节");
  await page
    .getByLabel("关注病变类型", { exact: true })
    .selectOption("关节间隙异常");
  const start = Date.now();
  await page
    .getByRole("button", { name: "开始 AI 辅助分析", exact: true })
    .click();
  await expect(page.getByTestId("diagnosis-thinking")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "AI 辅助诊疗报告", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect(Date.now() - start).toBeGreaterThan(4300);
  const pending = (await stored(page)).records[0];
  expect(pending.id).toBe("EV-000006");
  expect(pending.diagnosis?.scores[0]).toEqual({
    lesion: "关节间隙异常",
    percentage: 82,
  });
  expect(pending.diagnosis?.status).toBe("pending");
  await expect(page.getByTestId("diagnosis-report")).toContainText(
    "AI 仅提供参考",
  );
  const reviewButton = await page
    .getByRole("button", { name: "人工复核", exact: true })
    .boundingBox();
  expect(reviewButton!.y + reviewButton!.height).toBeLessThanOrEqual(840);
  await page.getByRole("button", { name: "人工复核", exact: true }).click();
  await page.getByLabel("复核人", { exact: true }).selectOption("朱诗嘉");
  await page
    .getByLabel("复核意见", { exact: true })
    .fill("演示复核：已核对影像与检查部位。");
  await page
    .getByRole("button", { name: "确认复核并归档", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "查看数据看板", exact: true }),
  ).toBeVisible();
  const dashboardButton = await page
    .getByRole("button", { name: "查看数据看板", exact: true })
    .boundingBox();
  expect(dashboardButton!.y + dashboardButton!.height).toBeLessThanOrEqual(840);
  await page.getByRole("button", { name: "查看数据看板", exact: true }).click();
  await expect(page.locator(".dashboard-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".dashboard-table")).toContainText("82%");
  await expect(page.locator(".dashboard-table")).toContainText("已复核");
  await expect(page.locator(".dashboard-table")).toContainText("朱诗嘉");
  await page.reload();
  await page.getByRole("button", { name: "诊疗报告 1", exact: true }).click();
  const archive = await stored(page);
  expect(archive.studies).toBe(9);
  expect(archive.records).toHaveLength(6);
  expect(archive.records[0].diagnosis).toMatchObject({
    status: "reviewed",
    reviewer: "朱诗嘉",
    reviewConclusion: "演示复核：已核对影像与检查部位。",
  });
  expect(archive.records[0].diagnosis?.reviewedAt).toBeTruthy();
  await page.getByRole("button", { name: "详情", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "诊疗报告档案" }),
  ).toContainText("朱诗嘉");
  expect(errors).toEqual([]);
});

test("manual annotation requires drawing before generating a report", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "进入标注界面", exact: true }).click();
  await expect(page.getByTestId("annotation-canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始 AI 辅助分析", exact: true }),
  ).toBeDisabled();
  const points = await page
    .getByTestId("annotation-canvas")
    .evaluate((node) => {
      const svg = node as SVGSVGElement;
      return [
        [0.29, 0.25],
        [0.53, 0.43],
      ].map(([x, y]) => {
        const p = new DOMPoint(
          svg.viewBox.baseVal.width * x,
          svg.viewBox.baseVal.height * y,
        ).matrixTransform(svg.getScreenCTM()!);
        return { x: p.x, y: p.y };
      });
    });
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("[data-shape-id]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "开始 AI 辅助分析", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AI 辅助诊疗报告", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  const record = (await stored(page)).records[0];
  expect(record.diagnosis?.inputMode).toBe("manual");
  expect(record.annotations).toHaveLength(1);
});

test("annotated file upload produces a report without inventing annotation geometry", async ({
  page,
}) => {
  await login(page);
  await page
    .getByLabel("上传已标注影像文件", { exact: true })
    .setInputFiles("public/demo/horse-xray-source.png");
  await page
    .getByRole("button", { name: "开始 AI 辅助分析", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AI 辅助诊疗报告", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  const record = (await stored(page)).records[0];
  expect(record.diagnosis?.inputMode).toBe("annotated");
  expect(record.annotations).toHaveLength(0);
});
