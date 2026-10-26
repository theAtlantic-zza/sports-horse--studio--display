import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/#dashboard");
  await expect(
    page.getByRole("button", { name: "编辑 IMG-000008", exact: true }),
  ).toBeVisible();
});

test("seeded dashboard, charts, search, filters and pagination", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", { name: "影像数据看板." }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-metric").nth(0)).toContainText("08");
  await expect(page.locator(".dashboard-metric").nth(2)).toContainText("05");
  await expect(
    page.getByRole("img", { name: "最近七天的影像上传与标注归档数量" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一页记录" }).click();
  await expect(
    page.getByRole("button", { name: "编辑 IMG-000001", exact: true }),
  ).toBeVisible();
  await page.getByLabel("按记录状态筛选").selectOption("uploaded");
  await expect(page.locator(".dashboard-table tbody tr")).toHaveCount(2);
  await page.getByLabel("按记录状态筛选").selectOption("all");
  await page.getByRole("textbox", { name: "搜索数据记录" }).fill("IMG-000003");
  await expect(page.locator(".dashboard-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "搜索数据记录" })
    .fill("不存在的影像");
  await expect(page.getByText("暂无匹配记录")).toBeVisible();
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await mkdir("work/qa/screenshots", { recursive: true });
  await page.screenshot({
    path: "work/qa/screenshots/dashboard-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("view, edit, reload and delete images with confirmation", async ({
  page,
}) => {
  await page.getByRole("textbox", { name: "搜索数据记录" }).fill("IMG-000008");
  await page.getByRole("button", { name: "详情", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("IMG-000008");
  await expect(
    page.getByRole("img", { name: "影像记录原始图片" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await page
    .getByRole("button", { name: "编辑 IMG-000008", exact: true })
    .click();
  await page.getByLabel("编辑马匹名称").fill("修改展示案例");
  await page.getByLabel("编辑影像名称").fill("编辑后的腕关节.png");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".dashboard-table")).toContainText("修改展示案例");
  await page.reload();
  await page
    .getByRole("textbox", { name: "搜索数据记录" })
    .fill("修改展示案例");
  await expect(page.locator(".dashboard-table")).toContainText("IMG-000008");
  await page
    .getByRole("button", { name: "删除 IMG-000008", exact: true })
    .click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".dashboard-table")).toContainText("IMG-000008");
  await page
    .getByRole("button", { name: "删除 IMG-000008", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.getByText("暂无匹配记录")).toBeVisible();
});

test("edit annotations without changing number, download and delete annotation only", async ({
  page,
}) => {
  await page.getByRole("button", { name: "标注记录 5", exact: true }).click();
  await page
    .getByRole("button", { name: "编辑 EV-000005", exact: true })
    .click();
  await page.getByLabel("编辑标注人").fill("看板验收员");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.locator(".dashboard-table")).toContainText("看板验收员");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 EV-000005", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs("work/qa/dashboard-download.png");
  const png = await readFile("work/qa/dashboard-download.png");
  expect(png.readUInt32BE(16)).toBe(1183);
  expect(png.readUInt32BE(20)).toBe(1024);
  await page
    .getByRole("button", { name: "继续标注 EV-000005", exact: true })
    .click();
  await expect(page.getByText("模拟分析已完成", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "标注人", exact: true })
    .fill("重新标注员");
  await page.getByRole("button", { name: "确认并保存", exact: true }).click();
  await page.getByRole("button", { name: "确认保存标注", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("EV-000005");
  await page.getByRole("button", { name: "关闭对话框", exact: true }).click();
  await page.getByRole("button", { name: "数据看板", exact: true }).click();
  await expect(page.locator(".dashboard-metric").nth(2)).toContainText("05");
  await page.getByRole("button", { name: "标注记录 5", exact: true }).click();
  await page
    .getByRole("button", { name: "删除 EV-000005", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("原始上传图片会保留");
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.locator(".dashboard-metric").nth(2)).toContainText("04");
  await expect(page.locator(".dashboard-metric").nth(0)).toContainText("08");
});

test("new upload, annotation archive and cascade deletion in hosted demo", async ({
  page,
}) => {
  await page.getByRole("button", { name: "新增影像", exact: true }).click();
  await page
    .getByLabel("上传本地影像文件")
    .setInputFiles("public/demo/horse-xray-source.png");
  await expect(page.getByText("模拟分析已完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /载入一处示例标注/ }).click();
  await page.getByRole("button", { name: "确认并保存", exact: true }).click();
  await page.getByRole("button", { name: "确认保存标注", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("EV-000006");
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await page.getByRole("button", { name: "数据看板", exact: true }).click();
  await page.getByLabel("按图片来源筛选").selectOption("upload");
  await expect(page.locator(".dashboard-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".dashboard-table")).toContainText("IMG-000009");
  await page
    .getByRole("button", { name: "删除 IMG-000009", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("关联的 1 份标注记录");
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.getByText("暂无匹配记录")).toBeVisible();
  await page.reload();
  await expect(page.locator(".dashboard-metric").nth(0)).toContainText("08");
  await expect(page.locator(".dashboard-metric").nth(2)).toContainText("05");
});

test("responsive dashboard keeps filters and records accessible", async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `work/qa/screenshots/dashboard-${size.width}.png`,
      fullPage: true,
    });
  }
});
