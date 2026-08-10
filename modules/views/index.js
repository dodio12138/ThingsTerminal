import { store } from "../store.js";
import { escapeHtml, readPreference, writePreference } from "../dom.js";
import { calcDays, getDeviceBuyPrice, renderDeviceCard, toBaseCurrency } from "./shared.js";

export const renderIndex = () => {
  const summary = {
    total: store.devices.length,
    active: store.devices.filter((device) => device.status !== "deleted").length,
    deleted: store.devices.filter((device) => device.status === "deleted").length
  };
  for (const [selector, value] of [["[data-total]", summary.total], ["[data-active]", summary.active], ["[data-deleted]", summary.deleted]]) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  const list = document.querySelector("[data-featured]");
  if (!list) return;
  const sortSelect = document.querySelector("[data-sort-select]");
  const childSelect = document.querySelector("[data-child-visibility]");
  const categorySelect = document.querySelector("[data-index-category-filter]");
  const brandSelect = document.querySelector("[data-index-brand-filter]");

  const restoreSelect = (select, key, fallback) => {
    if (!select || select.dataset.restored) return;
    select.value = readPreference(key, fallback);
    select.dataset.restored = "true";
  };
  restoreSelect(sortSelect, "index-sort", "recent");
  restoreSelect(childSelect, "index-children", "show");

  const categories = [...new Set(store.devices.map((device) => device.category ?? "未分类"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (categorySelect) {
    const current = categorySelect.dataset.restored ? categorySelect.value : readPreference("index-category", "all");
    categorySelect.innerHTML = `<option value="all">全部类别</option>${categories.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
    categorySelect.value = categories.includes(current) ? current : "all";
    categorySelect.dataset.restored = "true";
  }
  const brands = [...new Set(store.devices.map((device) => String(device.brand ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (brandSelect) {
    const current = brandSelect.dataset.restored ? brandSelect.value : readPreference("index-brand", "all");
    brandSelect.innerHTML = `<option value="all">全部品牌</option>${brands.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}<option value="__none__">无品牌</option>`;
    brandSelect.value = new Set(["all", "__none__", ...brands]).has(current) ? current : "all";
    brandSelect.dataset.restored = "true";
  }

  for (const [select, key] of [[sortSelect, "index-sort"], [childSelect, "index-children"], [categorySelect, "index-category"], [brandSelect, "index-brand"]]) {
    if (!select || select.dataset.bound) continue;
    select.dataset.bound = "true";
    select.addEventListener("change", () => {
      writePreference(key, select.value);
      renderIndex();
    });
  }

  const sortMode = sortSelect?.value || "recent";
  const childMode = childSelect?.value || "show";
  const categoryMode = categorySelect?.value || "all";
  const brandMode = brandSelect?.value || "all";
  let devices = childMode === "hide" ? store.devices.filter((device) => !device.parentId && !device.parent) : [...store.devices];
  if (categoryMode !== "all") devices = devices.filter((device) => (device.category ?? "未分类") === categoryMode);
  if (brandMode === "__none__") devices = devices.filter((device) => !String(device.brand ?? "").trim());
  else if (brandMode !== "all") devices = devices.filter((device) => device.brand === brandMode);

  devices.sort((a, b) => {
    const aPrice = getDeviceBuyPrice(a);
    const bPrice = getDeviceBuyPrice(b);
    const aBase = aPrice ? toBaseCurrency(aPrice.amount, aPrice.currency) ?? 0 : 0;
    const bBase = bPrice ? toBaseCurrency(bPrice.amount, bPrice.currency) ?? 0 : 0;
    const aDays = calcDays(a.acquired, a.lost) ?? 0;
    const bDays = calcDays(b.acquired, b.lost) ?? 0;
    if (sortMode === "price") return bBase - aBase;
    if (sortMode === "days") return bDays - aDays;
    if (sortMode === "daily") return (bDays ? bBase / bDays : 0) - (aDays ? aBase / aDays : 0);
    return (b.acquired ?? "0000-00").localeCompare(a.acquired ?? "0000-00");
  });
  list.innerHTML = devices.map((device) => renderDeviceCard(device, { compact: true })).join("") || `<p class="empty">暂无设备</p>`;
};
