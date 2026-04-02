// @ts-check

import { store, setAdminPassword } from "./store.js";
import { uploadImage, createDevice, fetchDevices, fetchCategories } from "./api.js";

const formatDate = (value) => value || "";

const FX_TO_CNY = {
  CNY: 1,
  RMB: 1,
  "¥": 1,
  "￥": 1,
  USD: 7.2,
  "$": 7.2,
  GBP: 9.2,
  "£": 9.2,
  EUR: 7.8,
  "€": 7.8,
  HKD: 0.92,
  JPY: 0.048
};

const CURRENCY_SYMBOL = {
  CNY: "￥",
  RMB: "￥",
  USD: "$",
  GBP: "£",
  EUR: "€",
  HKD: "HK$",
  JPY: "¥",
  "¥": "¥",
  "￥": "￥",
  "$": "$",
  "£": "£",
  "€": "€"
};

const parsePrice = (text) => {
  if (text === null || text === undefined || text === "") return null;
  if (typeof text === "number" && Number.isFinite(text)) {
    return { amount: text, currency: "" };
  }
  const value = String(text).trim();
  const amountMatch = value.match(/(\d[\d,.]*)/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const symbolMatch = value.match(/[¥￥$£€]/);
  const codeMatch = value.match(/\b(CNY|RMB|USD|GBP|EUR|HKD|JPY)\b/i);
  return { amount, currency: symbolMatch?.[0] || codeMatch?.[1]?.toUpperCase() || "" };
};

const normalizeCurrency = (currency) => {
  const raw = String(currency ?? "").trim();
  if (!raw) return "CNY";
  const upper = raw.toUpperCase();
  if (FX_TO_CNY[upper]) return upper;
  if (FX_TO_CNY[raw]) return raw;
  return upper;
};

const displayCurrency = (currency) => {
  const normalized = normalizeCurrency(currency);
  return CURRENCY_SYMBOL[normalized] || CURRENCY_SYMBOL[currency] || normalized;
};

const toCny = (amount, currency) => {
  if (!Number.isFinite(Number(amount))) return null;
  const normalized = normalizeCurrency(currency);
  const rate = FX_TO_CNY[normalized];
  if (!rate) return null;
  return Number(amount) * rate;
};

const getDeviceBuyPrice = (device) => {
  if (device.buyPrice != null && Number.isFinite(Number(device.buyPrice))) {
    return { amount: Number(device.buyPrice), currency: device.buyCurrency || "CNY" };
  }
  const parsed = parsePrice(device.acquiredTip);
  return parsed ? { amount: parsed.amount, currency: parsed.currency || "CNY" } : null;
};

const formatCny = (value) => `¥${Number(value).toLocaleString("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const parseDateValue = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}-01T00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00`);
  }
  return null;
};

const calcDays = (startValue, endValue) => {
  const start = parseDateValue(startValue);
  if (!start || Number.isNaN(start.getTime())) return null;
  const end = endValue ? parseDateValue(endValue) : new Date();
  if (!end || Number.isNaN(end.getTime())) return null;
  const diff = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  return diff;
};

const hasParentDevice = (device) => Boolean(String(device.parent ?? "").trim());
let statsYearSortByTime = false;

export const renderCategorySelects = (selectedValue = "") => {
  const selects = document.querySelectorAll("[data-category-select]");
  selects.forEach((select) => {
    if (!select) return;
    const current = selectedValue || select.value || "";
    select.innerHTML = [
      `<option value="">未分类</option>`,
      ...store.categories.map((name) => `<option value="${name}">${name}</option>`)
    ].join("");
    if (current) select.value = current;
  });
};

const renderDeviceCard = (device) => {
  const statusLabel = device.status === "deleted" ? "已失去" : "使用中";
  const statusClass = device.status === "deleted" ? "status status--warn" : "status";
  const parent = device.parent ? `<span class="card__parent">${device.parent}</span>` : "";
  const image = device.imagePath
    ? `<div class="card__image" style="background-image:url('${device.imagePath}')"></div>`
    : `<div class="card__image card__image--empty">No Image</div>`;

  const days = calcDays(device.acquired, device.lost);
  const price = getDeviceBuyPrice(device);
  const dailyCost = price && days ? `${displayCurrency(price.currency)}${(price.amount / days).toFixed(2)}` : null;

  const holdingLabel = days ? `持有时间：${days} 天` : "持有时间：-";
  const costLabel = dailyCost ? `每天成本：${dailyCost}` : "每天成本：-";
  const metaRows = [holdingLabel, costLabel];

  return `
    <article class="card">
      ${image}
      <div class="card__body">
        <div class="card__head">
          <div>
            <p class="card__tag">${device.category ?? "未分类"}</p>
            <h3>${device.name}</h3>
            ${parent}
          </div>
          <span class="${statusClass}">${statusLabel}</span>
        </div>
        ${metaRows.length ? `<ul class="card__meta">${metaRows.map((row) => `<li>${row}</li>`).join("")}</ul>` : ""}
        <a class="card__link" href="device.html?id=${device.id}">查看详情</a>
      </div>
    </article>
  `;
};

const renderCompactCard = (device) => {
  const statusLabel = device.status === "deleted" ? "已失去" : "使用中";
  const statusClass = device.status === "deleted" ? "status status--warn" : "status";

  const days = calcDays(device.acquired, device.lost);
  const price = getDeviceBuyPrice(device);
  const dailyCost = price && days ? `${displayCurrency(price.currency)}${(price.amount / days).toFixed(2)}` : null;

  const holdingLabel = days ? `持有时间：${days} 天` : "持有时间：-";
  const costLabel = dailyCost ? `每天成本：${dailyCost}` : "每天成本：-";
  const metaRows = [holdingLabel, costLabel];

  return `
    <article class="card card--compact">
      <div class="card__body">
        <div class="card__head">
          <div>
            <p class="card__tag">${device.category ?? "未分类"}</p>
            <h3>${device.name}</h3>
            <p class="card__compact-meta">入手：${device.acquired ?? "-"}</p>
          </div>
          <span class="${statusClass}">${statusLabel}</span>
        </div>
        ${metaRows.length ? `<ul class="card__meta">${metaRows.map((row) => `<li>${row}</li>`).join("")}</ul>` : ""}
        <a class="card__link" href="device.html?id=${device.id}">查看详情</a>
      </div>
    </article>
  `;
};

export const renderIndex = () => {
  const stats = {
    total: store.devices.length,
    active: store.devices.filter((d) => d.status !== "deleted").length,
    deleted: store.devices.filter((d) => d.status === "deleted").length
  };
  const totalEl = document.querySelector("[data-total]");
  const activeEl = document.querySelector("[data-active]");
  const deletedEl = document.querySelector("[data-deleted]");
  if (totalEl) totalEl.textContent = stats.total;
  if (activeEl) activeEl.textContent = stats.active;
  if (deletedEl) deletedEl.textContent = stats.deleted;

  const featured = document.querySelector("[data-featured]");
  const sortSelect = document.querySelector("[data-sort-select]");
  const childVisibilitySelect = document.querySelector("[data-child-visibility]");
  const categoryFilterSelect = document.querySelector("[data-index-category-filter]");
  const brandFilterSelect = document.querySelector("[data-index-brand-filter]");
  if (categoryFilterSelect) {
    const categories = Array.from(new Set(store.devices.map((d) => d.category ?? "未分类")))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    const current = categoryFilterSelect.value || "all";
    categoryFilterSelect.innerHTML = [
      `<option value="all">全部类别</option>`,
      ...categories.map((category) => `<option value="${category}">${category}</option>`)
    ].join("");
    categoryFilterSelect.value = categories.includes(current) ? current : "all";
  }
  if (brandFilterSelect) {
    const brands = Array.from(
      new Set(
        store.devices
          .map((d) => String(d.brand ?? "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const current = brandFilterSelect.value || "all";
    const allowed = new Set(["all", "__none__", ...brands]);
    brandFilterSelect.innerHTML = [
      `<option value="all">全部品牌</option>`,
      ...brands.map((brand) => `<option value="${brand}">${brand}</option>`),
      `<option value="__none__">无品牌</option>`
    ].join("");
    brandFilterSelect.value = allowed.has(current) ? current : "all";
  }
  if (sortSelect && !sortSelect.dataset.bound) {
    sortSelect.dataset.bound = "true";
    sortSelect.addEventListener("change", () => renderIndex());
  }
  if (childVisibilitySelect && !childVisibilitySelect.dataset.bound) {
    childVisibilitySelect.dataset.bound = "true";
    childVisibilitySelect.addEventListener("change", () => renderIndex());
  }
  if (categoryFilterSelect && !categoryFilterSelect.dataset.bound) {
    categoryFilterSelect.dataset.bound = "true";
    categoryFilterSelect.addEventListener("change", () => renderIndex());
  }
  if (brandFilterSelect && !brandFilterSelect.dataset.bound) {
    brandFilterSelect.dataset.bound = "true";
    brandFilterSelect.addEventListener("change", () => renderIndex());
  }
  if (featured) {
    const sortMode = sortSelect?.value || "recent";
    const childMode = childVisibilitySelect?.value || "show";
    const categoryMode = categoryFilterSelect?.value || "all";
    const brandMode = brandFilterSelect?.value || "all";
    let filtered = childMode === "hide"
      ? store.devices.filter((device) => !hasParentDevice(device))
      : store.devices;
    if (categoryMode !== "all") {
      filtered = filtered.filter((device) => (device.category ?? "未分类") === categoryMode);
    }
    if (brandMode === "__none__") {
      filtered = filtered.filter((device) => !String(device.brand ?? "").trim());
    } else if (brandMode !== "all") {
      filtered = filtered.filter((device) => String(device.brand ?? "").trim() === brandMode);
    }

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "price") {
        const ap = toCny(getDeviceBuyPrice(a)?.amount, getDeviceBuyPrice(a)?.currency) ?? 0;
        const bp = toCny(getDeviceBuyPrice(b)?.amount, getDeviceBuyPrice(b)?.currency) ?? 0;
        return bp - ap;
      }
      if (sortMode === "days") {
        const ad = calcDays(a.acquired, a.lost) ?? 0;
        const bd = calcDays(b.acquired, b.lost) ?? 0;
        return bd - ad;
      }
      if (sortMode === "daily") {
        const ap = toCny(getDeviceBuyPrice(a)?.amount, getDeviceBuyPrice(a)?.currency) ?? 0;
        const bp = toCny(getDeviceBuyPrice(b)?.amount, getDeviceBuyPrice(b)?.currency) ?? 0;
        const ad = calcDays(a.acquired, a.lost) ?? 0;
        const bd = calcDays(b.acquired, b.lost) ?? 0;
        const ac = ad ? ap / ad : 0;
        const bc = bd ? bp / bd : 0;
        return bc - ac;
      }
      return (b.acquired ?? "0000-00").localeCompare(a.acquired ?? "0000-00");
    });
    featured.innerHTML = sorted.map(renderCompactCard).join("");
  }
};

export const renderBrowse = () => {
  const listEl = document.querySelector("[data-browse-list]");
  const filterGroup = document.querySelector("[data-filter-group]");
  const clearBtn = document.querySelector("[data-clear-filters]");
  if (!listEl || !filterGroup) return;

  const searchInput = document.querySelector("[data-search]");
  const countEl = document.querySelector("[data-result-count]");

  const categoriesSet = Array.from(new Set(store.devices.map((d) => d.category ?? "未分类")));
  const brandsSet = Array.from(new Set(store.devices.map((d) => d.brand).filter(Boolean)));
  const yearsSet = Array.from(
    new Set(store.devices.map((d) => d.acquired?.split("-")[0]).filter(Boolean))
  ).sort((a, b) => Number(b) - Number(a));
  const statusOptions = ["全部", "使用中", "已失去"];

  const state = {
    query: "",
    category: "全部",
    status: "全部",
    brand: "全部",
    year: "全部"
  };

  const renderFilters = () => {
    const categoryChips = categoriesSet
      .map((category) => `<button class="chip" data-category="${category}">${category}</button>`)
      .join("");
    const brandOptions = brandsSet.map((brand) => `<option value="${brand}">${brand}</option>`).join("");
    const yearOptions = yearsSet.map((year) => `<option value="${year}">${year}</option>`).join("");
    filterGroup.innerHTML = `
      <div class="filter-row">
        <span>分类</span>
        <div class="chips">
          <button class="chip chip--active" data-category="全部">全部</button>
          ${categoryChips}
        </div>
      </div>
      <div class="filter-row">
        <span>品牌</span>
        <select data-brand>
          <option value="全部">全部</option>
          ${brandOptions}
        </select>
      </div>
      <div class="filter-row">
        <span>年份</span>
        <select data-year>
          <option value="全部">全部</option>
          ${yearOptions}
        </select>
      </div>
      <div class="filter-row">
        <span>状态</span>
        <div class="chips">
          ${statusOptions
            .map((status, index) =>
              `<button class="chip ${index === 0 ? "chip--active" : ""}" data-status="${status}">${status}</button>`
            )
            .join("")}
        </div>
      </div>
    `;
  };

  const applyFilters = () => {
    let result = store.devices;
    if (state.query) {
      const q = state.query.toLowerCase();
      result = result.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q) ||
        (d.brand ?? "").toLowerCase().includes(q)
      );
    }
    if (state.category !== "全部") {
      result = result.filter((d) => (d.category ?? "未分类") === state.category);
    }
    if (state.status !== "全部") {
      const isDeleted = state.status === "已失去";
      result = result.filter((d) => (isDeleted ? d.status === "deleted" : d.status !== "deleted"));
    }
    if (state.brand !== "全部") {
      result = result.filter((d) => (d.brand ?? "") === state.brand);
    }
    if (state.year !== "全部") {
      result = result.filter((d) => (d.acquired ?? "").startsWith(state.year));
    }
    listEl.innerHTML = result.map(renderDeviceCard).join("") || "<p class=\"empty\">没有匹配的设备</p>";
    if (countEl) countEl.textContent = result.length;
  };

  const resetFilters = () => {
    state.query = "";
    state.category = "全部";
    state.status = "全部";
    state.brand = "全部";
    state.year = "全部";
    if (searchInput) searchInput.value = "";
    filterGroup.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("chip--active"));
    filterGroup.querySelectorAll("[data-category='全部']").forEach((chip) => chip.classList.add("chip--active"));
    filterGroup.querySelectorAll("[data-status='全部']").forEach((chip) => chip.classList.add("chip--active"));
    const brandSelect = filterGroup.querySelector("[data-brand]");
    const yearSelect = filterGroup.querySelector("[data-year]");
    if (brandSelect) brandSelect.value = "全部";
    if (yearSelect) yearSelect.value = "全部";
    applyFilters();
  };

  renderFilters();
  applyFilters();

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      applyFilters();
    });
  }

  filterGroup.addEventListener("click", (event) => {
    const target = event.target;
    if (target.matches("[data-category]")) {
      state.category = target.dataset.category;
      target.parentElement.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("chip--active"));
      target.classList.add("chip--active");
      applyFilters();
    }
    if (target.matches("[data-status]")) {
      state.status = target.dataset.status;
      target.parentElement.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("chip--active"));
      target.classList.add("chip--active");
      applyFilters();
    }
  });

  filterGroup.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-brand]")) {
      state.brand = target.value;
      applyFilters();
    }
    if (target.matches("[data-year]")) {
      state.year = target.value;
      applyFilters();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", resetFilters);
  }
};

export const renderStats = () => {
  const container = document.querySelector("[data-stats]");
  if (!container) return;

  const stats = {
    total: store.devices.length,
    active: store.devices.filter((d) => d.status !== "deleted").length,
    deleted: store.devices.filter((d) => d.status === "deleted").length,
    categories: Array.from(new Set(store.devices.map((d) => d.category).filter(Boolean)))
  };

  const valueSummary = store.devices
    .filter((device) => device.status !== "deleted")
    .reduce(
      (acc, device) => {
        const price = getDeviceBuyPrice(device);
        if (!price) return acc;
        const cnyValue = toCny(price.amount, price.currency);
        if (cnyValue == null) {
          acc.unconverted += 1;
          return acc;
        }
        acc.total += cnyValue;
        acc.converted += 1;
        return acc;
      },
      { total: 0, converted: 0, unconverted: 0 }
    );
  const rateNote = `汇率：$=7.2, £=9.2, €=7.8, HKD=0.92, JPY=0.048；未识别币种 ${valueSummary.unconverted} 台`;

  const categoryCounts = store.devices.reduce((acc, device) => {
    const category = device.category ?? "未分类";
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const yearCounts = store.devices
    .filter((d) => d.acquired)
    .reduce((acc, device) => {
      const year = device.acquired.split("-")[0];
      acc[year] = (acc[year] ?? 0) + 1;
      return acc;
    }, {});

  const categoryMap = new Map();
  store.devices.forEach((device) => {
    const category = device.category ?? "未分类";
    const entry = categoryMap.get(category) ?? { count: 0, active: 0, latest: null };
    entry.count += 1;
    if (device.status !== "deleted") entry.active += 1;
    if (device.acquired && (!entry.latest || device.acquired > entry.latest)) {
      entry.latest = device.acquired;
    }
    categoryMap.set(category, entry);
  });

  const categoryOverviewHtml = Array.from(categoryMap.entries())
    .map(([category, info]) => {
      return `
        <div class="category-card">
          <h3>${category}</h3>
          <p>设备数量：${info.count}</p>
          <p>仍在使用：${info.active}</p>
          <p>最新入手：${info.latest ?? "-"}</p>
        </div>
      `;
    })
    .join("");

  const renderBars = (data, sortMode = "count") => {
    const max = Math.max(...Object.values(data), 1);
    const entries = Object.entries(data);
    if (sortMode === "time") {
      entries.sort((a, b) => Number(b[0]) - Number(a[0]));
    } else {
      entries.sort((a, b) => b[1] - a[1]);
    }
    return entries
      .map(
        ([label, value]) => `
          <div class="bar-row">
            <span>${label}</span>
            <div class="progress-indicator segmented">
              <span class="progress-indicator-bar" style="width:${(value / max) * 100}%"></span>
            </div>
            <strong>${value}</strong>
          </div>
        `
      )
      .join("");
  };

  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><p>总设备</p><strong>${stats.total}</strong></div>
      <div class="stat-card"><p>使用中</p><strong>${stats.active}</strong></div>
      <div class="stat-card"><p>已失去</p><strong>${stats.deleted}</strong></div>
      <div class="stat-card"><p>分类数量</p><strong>${stats.categories.length}</strong></div>
      <div class="stat-card stat-card--hint">
        <div class="stat-card__head">
          <p>总价值（CNY）</p>
          <div class="hint-window" role="tooltip">${rateNote}</div>
        </div>
        <strong>${formatCny(valueSummary.total)}</strong>
      </div>
    </div>
    <div class="chart-card">
      <h3>分类分布</h3>
      ${renderBars(categoryCounts)}
    </div>
    <div class="chart-card">
      <h3 class="chart-card__title">
        <button class="title-toggle" type="button" data-year-sort-toggle>入手年份</button>
      </h3>
      ${Object.keys(yearCounts).length ? renderBars(yearCounts, statsYearSortByTime ? "time" : "count") : "<p class=\"empty\">暂无入手年份数据</p>"}
    </div>
    <div class="chart-card">
      <h3>分类概览</h3>
      <div class="category-grid">
        ${categoryOverviewHtml}
      </div>
    </div>
  `;

  const yearSortToggle = container.querySelector("[data-year-sort-toggle]");
  if (yearSortToggle) {
    yearSortToggle.addEventListener("click", () => {
      statsYearSortByTime = !statsYearSortByTime;
      renderStats();
    });
  }
};

export const renderDetail = () => {
  const container = document.querySelector("[data-device-detail]");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    container.innerHTML = "<p class=\"empty\">没有找到设备 ID</p>";
    return;
  }

  const device = store.devices.find((item) => String(item.id) === String(id));
  if (!device) {
    container.innerHTML = "<p class=\"empty\">设备不存在或已删除</p>";
    return;
  }

  const statusLabel = device.status === "deleted" ? "已失去" : "使用中";
  const image = device.imagePath
    ? `<div class="detail__image" style="background-image:url('${device.imagePath}')"></div>`
    : `<div class="detail__image detail__image--empty">No Image</div>`;
  const specs = device.specs?.length
    ? `<ul class="detail__specs">${device.specs.map((spec) => `<li>${spec}</li>`).join("")}</ul>`
    : "<p class=\"empty\">暂无规格信息</p>";

  const rows = [
    device.parent ? `所属：${device.parent}` : null,
    device.acquired ? `入手：${device.acquired}` : null,
    device.lost ? `失去：${device.lost}` : null,
    device.acquiredLocation ? `地点：${device.acquiredLocation}` : null,
    device.lostLocation ? `失去地点：${device.lostLocation}` : null
  ].filter(Boolean);

  container.innerHTML = `
    <div class="detail">
      ${image}
      <div class="detail__content">
        <div class="detail__header">
          <div>
            <p class="card__tag">${device.category ?? "未分类"}</p>
            <h1>${device.name}</h1>
            <div class="badge-row">
              <span class="badge">${device.category ?? "未分类"}</span>
              <span class="badge badge--accent">${device.brand ?? "无品牌"}</span>
            </div>
          </div>
          <span class="status ${device.status === "deleted" ? "status--warn" : ""}">${statusLabel}</span>
        </div>
        <div class="detail__meta">
          ${rows.length ? rows.map((row) => `<p>${row}</p>`).join("") : "<p class=\"empty\">暂无记录</p>"}
        </div>
        <div class="detail__section">
          <h3>规格</h3>
          ${specs}
        </div>
        <div class="detail__section">
          <h3>备注</h3>
          <p>${device.acquiredTip || device.lostTip || "暂无备注"}</p>
        </div>
      </div>
    </div>
  `;
};

export const initAuthFields = () => {
  const inputs = document.querySelectorAll("[data-admin-password]");
  inputs.forEach((input) => {
    if (!input) return;
    input.value = store.adminPassword;
    input.addEventListener("input", (event) => {
      setAdminPassword(event.target.value.trim());
    });
  });

  const authNote = document.querySelector("[data-auth-note]");
  if (authNote) {
    authNote.textContent = store.authRequired
      ? "当前启用了管理密码，请输入后再保存。"
      : "未启用管理密码。";
  }
};

export const initAddPage = () => {
  const form = document.querySelector("[data-add-form]");
  if (!form) return;
  const preview = document.querySelector("[data-add-preview]");
  const output = document.querySelector("[data-add-output]");
  const copyButton = document.querySelector("[data-copy]");
  const statusEl = document.querySelector("[data-save-status]");
  const uploadButton = document.querySelector("[data-upload-btn]");
  const uploadInput = document.querySelector("[data-image-file]");
  const uploadStatus = document.querySelector("[data-upload-status]");
  const imagePathInput = form.querySelector("[name=imagePath]");

  renderCategorySelects();

  const updatePreview = () => {
    const formData = new FormData(form);
    const device = {
      name: formData.get("name")?.toString().trim(),
      category: formData.get("category")?.toString().trim(),
      brand: formData.get("brand")?.toString().trim() || null,
      status: formData.get("status"),
      acquired: formData.get("acquired")?.toString().trim() || null,
      buyPrice: formData.get("buyPrice")?.toString().trim() || null,
      buyCurrency: formData.get("buyCurrency")?.toString().trim() || "CNY",
      acquiredTip: formData.get("acquiredTip")?.toString().trim() || null,
      imagePath: formData.get("imagePath")?.toString().trim() || null,
      acquiredLocation: formData.get("acquiredLocation")?.toString().trim() || null,
      lost: formData.get("lost")?.toString().trim() || null,
      sellPrice: formData.get("sellPrice")?.toString().trim() || null,
      sellCurrency: formData.get("sellCurrency")?.toString().trim() || "CNY",
      lostLocation: formData.get("lostLocation")?.toString().trim() || null,
      parent: formData.get("parent")?.toString().trim() || null,
      specs: formData.get("specs")?.toString() || ""
    };

    if (!device.name) {
      if (preview) preview.innerHTML = "<p class=\"empty\">填写名称后会生成预览</p>";
      if (output) output.textContent = "";
      return;
    }

    const card = renderDeviceCard({
      ...device,
      id: 0,
      category: device.category || "未分类",
      status: device.status === "deleted" ? "deleted" : "active",
      specs: []
    });

    if (preview) preview.innerHTML = card;
    if (output) output.textContent = JSON.stringify(device, null, 2);
  };

  form.addEventListener("input", updatePreview);
  updatePreview();

  if (uploadButton && uploadInput && uploadStatus && imagePathInput) {
    uploadButton.addEventListener("click", async () => {
      if (!uploadInput.files?.length) return;
      uploadStatus.textContent = "上传中...";
      try {
        const result = await uploadImage(uploadInput.files[0]);
        imagePathInput.value = result.url;
        uploadStatus.textContent = "已上传";
        uploadInput.value = "";
        updatePreview();
      } catch (error) {
        uploadStatus.textContent = error.message || "上传失败";
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name")?.toString().trim(),
      category: formData.get("category")?.toString().trim() || null,
      brand: formData.get("brand")?.toString().trim() || null,
      status: formData.get("status"),
      acquired: formData.get("acquired")?.toString().trim() || null,
      buyPrice: formData.get("buyPrice")?.toString().trim() || null,
      buyCurrency: formData.get("buyCurrency")?.toString().trim() || "CNY",
      acquiredTip: formData.get("acquiredTip")?.toString().trim() || null,
      imagePath: formData.get("imagePath")?.toString().trim() || null,
      acquiredLocation: formData.get("acquiredLocation")?.toString().trim() || null,
      lost: formData.get("lost")?.toString().trim() || null,
      sellPrice: formData.get("sellPrice")?.toString().trim() || null,
      sellCurrency: formData.get("sellCurrency")?.toString().trim() || "CNY",
      lostLocation: formData.get("lostLocation")?.toString().trim() || null,
      parent: formData.get("parent")?.toString().trim() || null,
      specs: formData.get("specs")?.toString() || ""
    };

    if (!payload.name) return;
    if (statusEl) statusEl.textContent = "正在保存...";

    try {
      await createDevice(payload);
      if (statusEl) statusEl.textContent = "已保存到数据库";
      form.reset();
      updatePreview();
      await fetchCategories();
      renderCategorySelects();
      await fetchDevices();
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || "保存失败";
    }
  });

  if (copyButton && output) {
    copyButton.addEventListener("click", () => {
      if (!output.textContent) return;
      navigator.clipboard.writeText(output.textContent).catch(() => {});
      copyButton.textContent = "已复制";
      setTimeout(() => {
        copyButton.textContent = "复制 JSON";
      }, 1600);
    });
  }
};
