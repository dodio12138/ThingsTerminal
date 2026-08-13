import { store } from "../store.js";
import { escapeHtml, readPreference, writePreference } from "../dom.js";
import { renderDeviceCard } from "./shared.js";

export const renderBrowse = () => {
  const list = document.querySelector("[data-browse-list]");
  const filters = document.querySelector("[data-filter-group]");
  if (!list || !filters) return;
  if (filters.dataset.bound) {
    filters.refreshResults?.();
    return;
  }
  filters.dataset.bound = "true";
  const search = document.querySelector("[data-search]");
  const count = document.querySelector("[data-result-count]");
  const clear = document.querySelector("[data-clear-filters]");
  const categories = [...new Set(store.devices.map((device) => device.category ?? "未分类"))];
  const brands = [...new Set(store.devices.map((device) => device.brand).filter(Boolean))];
  const years = [...new Set(store.devices.map((device) => device.acquired?.slice(0, 4)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  const statuses = ["全部", "使用中", "已失去"];
  const params = new URLSearchParams(window.location.search);
  const state = {
    query: readPreference("browse-query", ""),
    category: categories.includes(params.get("category")) ? params.get("category") : readPreference("browse-category", "全部"),
    status: statuses.includes(params.get("status")) ? params.get("status") : readPreference("browse-status", "全部"),
    brand: brands.includes(params.get("brand")) ? params.get("brand") : readPreference("browse-brand", "全部"),
    year: readPreference("browse-year", "全部")
  };

  filters.innerHTML = `
    <div class="filter-row"><span>分类</span><div class="chips">
      ${["全部", ...categories].map((value) => `<button class="chip ${state.category === value ? "chip--active" : ""}" data-category="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("")}
    </div></div>
    <div class="filter-row"><span>品牌</span><select data-brand><option value="全部">全部</option>${brands.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}</select></div>
    <div class="filter-row"><span>年份</span><select data-year><option value="全部">全部</option>${years.map((value) => `<option value="${value}">${value}</option>`).join("")}</select></div>
    <div class="filter-row"><span>状态</span><div class="chips">
      ${statuses.map((value) => `<button class="chip ${state.status === value ? "chip--active" : ""}" data-status="${value}">${value}</button>`).join("")}
    </div></div>
  `;
  const brandSelect = filters.querySelector("[data-brand]");
  const yearSelect = filters.querySelector("[data-year]");
  if (brands.includes(state.brand)) brandSelect.value = state.brand;
  else state.brand = "全部";
  if (years.includes(state.year)) yearSelect.value = state.year;
  else state.year = "全部";
  if (search) search.value = state.query;

  const apply = () => {
    let devices = store.devices;
    if (state.query) {
      const query = state.query.toLowerCase();
      devices = devices.filter((device) => [device.name, device.category, device.brand, ...(device.tags || [])]
        .some((value) => String(value ?? "").toLowerCase().includes(query)));
    }
    if (state.category !== "全部") devices = devices.filter((device) => (device.category ?? "未分类") === state.category);
    if (state.brand !== "全部") devices = devices.filter((device) => device.brand === state.brand);
    if (state.year !== "全部") devices = devices.filter((device) => String(device.acquired || "").startsWith(state.year));
    if (state.status !== "全部") devices = devices.filter((device) => state.status === "已失去" ? device.status === "deleted" : device.status !== "deleted");
    list.innerHTML = devices.map((device) => renderDeviceCard(device)).join("") || `<p class="empty">没有匹配的设备</p>`;
    if (count) count.textContent = devices.length;
    if (clear) {
      const hasFilters = Object.values(state).some((value) => value !== "" && value !== "全部");
      clear.disabled = !hasFilters;
    }
  };
  filters.refreshResults = apply;

  search?.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    writePreference("browse-query", state.query);
    apply();
  });
  filters.addEventListener("click", (event) => {
    const target = event.target;
    if (target.matches("[data-category]")) {
      state.category = target.dataset.category;
      writePreference("browse-category", state.category);
    } else if (target.matches("[data-status]")) {
      state.status = target.dataset.status;
      writePreference("browse-status", state.status);
    } else return;
    target.parentElement.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("chip--active", chip === target));
    apply();
  });
  filters.addEventListener("change", (event) => {
    if (event.target.matches("[data-brand]")) {
      state.brand = event.target.value;
      writePreference("browse-brand", state.brand);
    } else if (event.target.matches("[data-year]")) {
      state.year = event.target.value;
      writePreference("browse-year", state.year);
    }
    apply();
  });
  clear?.addEventListener("click", () => {
    Object.assign(state, { query: "", category: "全部", status: "全部", brand: "全部", year: "全部" });
    for (const [key, value] of Object.entries(state)) writePreference(`browse-${key}`, value);
    if (search) search.value = "";
    brandSelect.value = "全部";
    yearSelect.value = "全部";
    filters.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("chip--active", chip.dataset.category === "全部" || chip.dataset.status === "全部"));
    apply();
  });
  apply();
};
