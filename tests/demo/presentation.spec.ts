import { expect, test } from "@playwright/test";

test("presentation mode keeps the annotation workflow in frame and preserves work when exiting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 840 });
  await page.goto("/?presentation=1");
  await expect(
    page.getByRole("button", { name: "切换汇报模式" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "体验内置示例", exact: true }).click();
  await expect(page.getByText("模拟分析已完成", { exact: true })).toBeVisible();
  for (const locator of [
    page.locator(".studio-layout"),
    page.getByLabel("标注人", { exact: true }),
    page.getByLabel("病变类型", { exact: true }),
    page.getByRole("button", { name: "确认并保存", exact: true }),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(840);
  }
  await page.getByLabel("标注人", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "选择 / 移动", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: /载入一处示例标注/ }).click();
  await page.getByLabel("标注人", { exact: true }).fill("朱诗嘉");
  await page.getByRole("button", { name: "切换汇报模式" }).click();
  expect(new URL(page.url()).searchParams.has("presentation")).toBe(false);
  await expect(page.locator("[data-shape-id]")).toHaveCount(1);
  await expect(page.getByLabel("标注人", { exact: true })).toHaveValue(
    "朱诗嘉",
  );
  await page.getByRole("button", { name: "切换汇报模式" }).click();
  await page.getByRole("button", { name: "确认并保存", exact: true }).click();
  await page.getByRole("button", { name: "确认保存标注", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("朱诗嘉");
  const download = await page
    .getByRole("link", { name: "下载标注图片", exact: true })
    .boundingBox();
  expect(download!.y + download!.height).toBeLessThanOrEqual(840);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "切换汇报模式" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "标注记录", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("EV-000006");
});
