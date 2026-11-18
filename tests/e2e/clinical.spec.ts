import { expect, test } from "@playwright/test";
import type { AnnotationRecord, RecordSummary } from "../../shared/types";

test("clinical UI persists its report and human review through the Express mock API", async ({
  page,
}) => {
  await page.goto("/?presentation=1");
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page
    .getByRole("button", { name: "载入已标注示例", exact: true })
    .click();
  await page
    .getByRole("button", { name: "开始 AI 辅助分析", exact: true })
    .click();
  await expect(page.getByTestId("diagnosis-report")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "人工复核", exact: true }).click();
  await page.getByLabel("复核人", { exact: true }).selectOption("李其杭");
  await page.getByLabel("复核意见", { exact: true }).fill("已核对影像与分析结果。");
  await page
    .getByRole("button", { name: "确认复核", exact: true })
    .click();
  await page.getByRole("button", { name: "归档报告", exact: true }).click();
  await page.getByRole("button", { name: "查看数据看板", exact: true }).click();
  await expect(page.locator(".dashboard-table")).toContainText("已归档");
  const records: RecordSummary[] = await (
    await page.request.get("/api/records")
  ).json();
  const report = records.find(
    (record) => record.diagnosis?.reviewer === "李其杭",
  )!;
  expect(report).toBeTruthy();
  const saved: AnnotationRecord = await (
    await page.request.get(`/api/records/${report.id}`)
  ).json();
  expect(saved.diagnosis).toMatchObject({
    mock: true,
    status: "reviewed",
    reviewer: "李其杭",
  });
  expect(saved.diagnosis?.scores[0].percentage).toBe(82);
  expect(saved.diagnosis?.archivedAt).toBeTruthy();
  expect(saved.original.dataUrl).toMatch(/^data:image\/png;base64,/);
});
