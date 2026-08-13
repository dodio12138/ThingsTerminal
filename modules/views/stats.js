import { store } from "../store.js";
import { escapeHtml } from "../dom.js";
import { formatMoney } from "../../shared/finance.js";
import { getDeviceBuyPrice, settings, toBaseCurrency } from "./shared.js";

let sortYearsByTime = false;

const renderBars = (data, sortByTime = false) => {
  const max = Math.max(...Object.values(data), 1);
  const entries = Object.entries(data).sort(sortByTime ? (a, b) => Number(b[0]) - Number(a[0]) : (a, b) => b[1] - a[1]);
  return entries.map(([label, value]) => `
    <div class="bar-row">
      <span>${escapeHtml(label)}</span>
      <div class="progress-indicator segmented"><span class="progress-indicator-bar" style="width:${value / max * 100}%"></span></div>
      <strong>${value}</strong>
    </div>
  `).join("");
};

export const renderStats = () => {
  const container = document.querySelector("[data-stats]");
  if (!container) return;
  const appSettings = settings();
  const active = store.devices.filter((device) => device.status !== "deleted");
  const categories = [...new Set(store.devices.map((device) => device.category).filter(Boolean))];
  const valueSummary = active.reduce((summary, device) => {
    const price = getDeviceBuyPrice(device);
    const converted = price ? toBaseCurrency(price.amount, price.currency) : null;
    if (converted === null) summary.unconverted += price ? 1 : 0;
    else summary.total += converted;
    return summary;
  }, { total: 0, unconverted: 0 });
  const categoryCounts = {};
  const yearCounts = {};
  const categorySummary = new Map();
  for (const device of store.devices) {
    const category = device.category ?? "未分类";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (device.acquired) yearCounts[device.acquired.slice(0, 4)] = (yearCounts[device.acquired.slice(0, 4)] || 0) + 1;
    const summary = categorySummary.get(category) || { count: 0, active: 0, latest: null };
    summary.count += 1;
    if (device.status !== "deleted") summary.active += 1;
    if (device.acquired && (!summary.latest || device.acquired > summary.latest)) summary.latest = device.acquired;
    categorySummary.set(category, summary);
  }
  const rateNote = `${appSettings.fxSource}（更新：${appSettings.fxUpdatedAt}）；${Object.entries(appSettings.fxRates).map(([currency, rate]) => `${currency}=${rate}`).join("，")}；未转换 ${valueSummary.unconverted} 台`;
  const categoryCards = [...categorySummary.entries()].map(([category, summary]) => `
    <div class="category-card">
      <h3><a href="browse.html?category=${encodeURIComponent(category)}">${escapeHtml(category)}</a></h3>
      <p>设备数量：${summary.count}</p><p>仍在使用：${summary.active}</p><p>最新入手：${escapeHtml(summary.latest ?? "-")}</p>
    </div>
  `).join("");
  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><p>总设备</p><strong>${store.devices.length}</strong></div>
      <div class="stat-card"><p>使用中</p><strong>${active.length}</strong></div>
      <div class="stat-card"><p>已失去</p><strong>${store.devices.length - active.length}</strong></div>
      <div class="stat-card"><p>分类数量</p><strong>${categories.length}</strong></div>
      <div class="stat-card stat-card--hint"><div class="stat-card__head"><p>总价值（${escapeHtml(appSettings.baseCurrency)}）</p><div class="hint-window" role="tooltip">${escapeHtml(rateNote)}</div></div><strong>${formatMoney(valueSummary.total, appSettings.baseCurrency)}</strong></div>
    </div>
    <div class="chart-card"><h3>分类分布</h3>${renderBars(categoryCounts)}</div>
    <div class="chart-card"><h3 class="chart-card__title"><button class="title-toggle" type="button" data-year-sort-toggle>入手年份</button></h3>${Object.keys(yearCounts).length ? renderBars(yearCounts, sortYearsByTime) : `<p class="empty">暂无入手年份数据</p>`}</div>
    <div class="chart-card"><h3>分类概览</h3><div class="category-grid">${categoryCards}</div></div>
  `;
  container.querySelector("[data-year-sort-toggle]")?.addEventListener("click", () => {
    sortYearsByTime = !sortYearsByTime;
    renderStats();
  });
};
