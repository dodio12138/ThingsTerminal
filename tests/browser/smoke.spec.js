import { test, expect } from "@playwright/test";

const pages = [
  ["/index.html", "设备展示"],
  ["/browse.html", "搜索筛选"],
  ["/add.html", "添加设备"],
  ["/stats.html", "统计"],
  ["/device.html?id=1", "设备详情"],
  ["/admin.html", "管理后台"]
];

test("all product pages render without runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  for (const [url, title] of pages) {
    await page.goto(url);
    await expect(page).toHaveTitle(new RegExp(title));
    await expect(page.locator("main")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("all product pages fit common desktop and mobile viewports", async ({ page }) => {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [url] of pages) {
      await page.goto(url);
      await expect(page.locator("main")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      }));
      expect(dimensions.scrollWidth <= dimensions.viewportWidth, `${url} at ${width}px: ${dimensions.scrollWidth}px content width`).toBeTruthy();
    }
  }
});

test("detail view keeps the navigation and image placeholder compact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/device.html?id=1");
  const dimensions = await page.evaluate(() => {
    const nav = document.querySelector(".nav").getBoundingClientRect();
    const image = document.querySelector(".detail__image").getBoundingClientRect();
    return { navHeight: nav.height, imageWidth: image.width, imageHeight: image.height };
  });
  expect(dimensions.navHeight).toBeLessThan(130);
  expect(dimensions.imageWidth).toBeLessThanOrEqual(280);
  expect(dimensions.imageHeight).toBeLessThanOrEqual(220);
});

test("stored hostile text is rendered inert", async ({ page, request }) => {
  const hostile = `<img src=x onerror="window.__thingsXss=true">`;
  const response = await request.post("/api/devices", {
    headers: { "x-admin-password": "browser-test-password" },
    data: { name: hostile, category: "Security" }
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/browse.html");
  await expect(page.getByText(hostile)).toBeVisible();
  expect(await page.evaluate(() => window.__thingsXss)).toBeUndefined();
});

test("filters persist and keyboard focus remains visible", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("[data-sort-select]").selectOption("days");
  await page.reload();
  await expect(page.locator("[data-sort-select]")).toHaveValue("days");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).not.toBe("BODY");
});

test("add, search and detail flow works from the UI", async ({ page }) => {
  await page.goto("/add.html");
  await page.locator("[data-admin-password]").fill("browser-test-password");
  await page.locator("[name=name]").fill("Browser Created Device");
  await page.locator("[name=brand]").fill("Codex QA");
  await page.locator("[name=tags]").fill("smoke, keyboard");
  await page.locator("[data-add-form] button[type=submit]").click();
  await expect(page.locator("[data-save-status]")).toHaveText("已保存到数据库");

  await page.goto("/browse.html");
  await page.locator("[data-search]").fill("Browser Created Device");
  const card = page.locator("article.card", { hasText: "Browser Created Device" });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "查看详情" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Browser Created Device" })).toBeVisible();
  await expect(page.getByText("smoke")).toBeVisible();
});
