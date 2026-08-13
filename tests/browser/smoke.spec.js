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

test("responsive workspaces use usable control sizes and column layouts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin.html");
  const desktop = await page.evaluate(() => ({
    adminColumns: getComputedStyle(document.querySelector(".admin-form")).gridTemplateColumns,
    listColumns: getComputedStyle(document.querySelector(".admin-layout")).gridTemplateColumns
  }));
  expect(desktop.adminColumns.split(" ")).toHaveLength(2);
  expect(desktop.listColumns.split(" ")).toHaveLength(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/add.html");
  const mobile = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("main button, main input, main select, main textarea"))
      .filter((element) => element.offsetParent && element.type !== "hidden" && element.type !== "file" && !element.closest(".title-bar-controls"))
      .map((element) => element.getBoundingClientRect().height);
    return {
      shortest: Math.min(...controls),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });
  expect(mobile.shortest).toBeGreaterThanOrEqual(36);
  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewportWidth);
});

test("desktop display filters use one aligned four-column grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/index.html");

  const layout = await page.locator(".section__tools").evaluate((tools) => {
    const labels = [...tools.querySelectorAll("label")].map((label) => Math.round(label.getBoundingClientRect().left));
    const selects = [...tools.querySelectorAll("select")].map((select) => ({
      left: Math.round(select.getBoundingClientRect().left),
      height: Math.round(select.getBoundingClientRect().height),
      arrowHeight: Math.round(Number.parseFloat(getComputedStyle(select).backgroundSize.split(" ")[1]))
    }));
    return {
      columns: getComputedStyle(tools).gridTemplateColumns.trim().split(/\s+/).length,
      labels,
      selects
    };
  });

  expect(layout.columns).toBe(4);
  // 98.css renders the dark select edge 2px inside its DOM box. The select
  // is intentionally offset so its visible edge, rather than its box, aligns.
  expect(layout.selects.map(({ left }) => left)).toEqual(layout.labels.map((left) => left - 2));
  expect(layout.selects.every(({ height, arrowHeight }) => arrowHeight === height - 4)).toBe(true);
});

test("display settings limit card metadata and update overview cards", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.getByRole("dialog", { name: /展示设置/ })).toBeHidden();
  await page.getByRole("button", { name: "设置" }).click();
  const dialog = page.getByRole("dialog", { name: /展示设置/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".display-settings-workspace.sunken-panel")).toBeVisible();
  await expect(dialog.locator("[data-display-settings-content]")).not.toContainText("设备标签显示");
  const collapsedSize = await dialog.boundingBox();
  await dialog.getByRole("button", { name: "设备标签显示" }).click();
  const expandedSize = await dialog.boundingBox();
  expect(Math.round(expandedSize.height)).toBe(Math.round(collapsedSize.height));
  await expect(dialog.locator(".display-settings-workspace.sunken-panel")).toBeVisible();
  await expect(dialog.locator(".display-settings-actions")).toBeVisible();
  await expect(page.locator(".card-matrix-panel.sunken-panel")).toBeVisible();
  for (const field of ["brand", "acquired", "days", "dailyCost", "category", "status", "tags", "warrantyUntil", "acquiredLocation", "parent"]) {
    await dialog.locator(`label[for="card-meta-${field}"]`).click();
  }
  await expect(dialog.getByText("最多选择 5 项")).toBeVisible();
  await dialog.getByRole("button", { name: "保存设置" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("article.card").first().locator(".card__meta li")).toHaveCount(5);
});

test("sold devices show a fixed profit or loss result and settings window can move", async ({ page, request }) => {
  const response = await request.post("/api/devices", {
    headers: { "x-admin-password": "browser-test-password" },
    data: {
      name: "Sold At A Profit",
      category: "Test",
      status: "deleted",
      acquired: "2025-01-01",
      lost: "2025-01-11",
      buyPrice: 100,
      buyCurrency: "CNY",
      sellPrice: 150,
      sellCurrency: "CNY"
    }
  });
  expect(response.ok()).toBeTruthy();
  const lossResponse = await request.post("/api/devices", {
    headers: { "x-admin-password": "browser-test-password" },
    data: {
      name: "Sold At A Loss",
      category: "Test",
      status: "deleted",
      acquired: "2025-01-01",
      lost: "2025-01-11",
      buyPrice: 100,
      buyCurrency: "CNY",
      sellPrice: 50,
      sellCurrency: "CNY"
    }
  });
  expect(lossResponse.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("things-terminal:card-meta-fields", JSON.stringify(["dailyCost"])));
  await page.goto("/index.html");
  await expect(page.locator("article.card", { hasText: "Sold At A Profit" })).toContainText("最终收益：+￥50.00");
  await expect(page.locator("article.card", { hasText: "Sold At A Loss" }).locator(".card__money--loss")).toHaveText("每日支出：￥5.00");
  await page.getByRole("button", { name: "设置" }).click();
  const dialog = page.getByRole("dialog", { name: /展示设置/ });
  await dialog.getByRole("button", { name: "设备标签显示" }).click();
  await page.locator("[data-sort-select]").selectOption("days");
  await expect(dialog).toBeVisible();
  const handle = dialog.locator("[data-display-settings-drag-handle]");
  const before = await dialog.boundingBox();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + 80, handleBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 180, handleBox.y + 90);
  await page.mouse.up();
  const after = await dialog.boundingBox();
  expect(after.x !== before.x || after.y !== before.y).toBeTruthy();
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
  const dialog = page.getByRole("dialog", { name: /设备详情/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-device-detail-subtitle]")).toHaveText("Browser Created Device");
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(dialog.getByText("smoke")).toBeVisible();
  await expect(dialog.locator(".device-detail-workspace.sunken-panel")).toBeVisible();
});

test("generated retro illustrations appear on matching device cards", async ({ page }) => {
  await page.goto("/browse.html");
  const macbookCard = page.locator("article.card", { hasText: "MacBook Pro Early 2015" });
  await expect(macbookCard).toBeVisible();
  await expect(macbookCard.locator(".card__image")).toHaveCSS("background-image", /retro-macbook-2015\.png/);
});
