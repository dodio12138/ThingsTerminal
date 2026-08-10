import { store } from "../store.js";
import { convertAmount, formatMoney, parsePrice } from "../../shared/finance.js";
import { DEFAULT_SETTINGS } from "../../shared/constants.js";
import { deviceDetailUrl, escapeHtml, safeImageUrl, thumbnailUrl } from "../dom.js";

export const settings = () => store.settings || DEFAULT_SETTINGS;

export const getDeviceBuyPrice = (device) => {
  if (device.buyPrice !== null && device.buyPrice !== undefined && Number.isFinite(Number(device.buyPrice))) {
    return { amount: Number(device.buyPrice), currency: device.buyCurrency || "CNY" };
  }
  return parsePrice(device.acquiredTip);
};

export const toBaseCurrency = (amount, currency) => convertAmount(amount, currency, settings());

const parseDateValue = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(text)) return new Date(`${text}-01T00:00:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00`);
  return null;
};

export const calcDays = (startValue, endValue) => {
  const start = parseDateValue(startValue);
  const end = endValue ? parseDateValue(endValue) : new Date();
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
};

export const renderCategorySelects = (selectedValue = "") => {
  document.querySelectorAll("[data-category-select]").forEach((select) => {
    const current = selectedValue || select.value || "";
    select.innerHTML = [
      `<option value="">未分类</option>`,
      ...store.categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    ].join("");
    if (current) select.value = current;
  });
};

export const renderParentSelects = (selectedValue = "") => {
  document.querySelectorAll("[data-parent-select]").forEach((select) => {
    const current = String(selectedValue || select.value || "");
    const excludedId = String(select.closest("form")?.dataset.editId || "");
    select.innerHTML = [
      `<option value="">无父级</option>`,
      ...store.devices
        .filter((device) => String(device.id) !== excludedId)
        .map((device) => `<option value="${device.id}">${escapeHtml(device.name)}</option>`)
    ].join("");
    if (current) select.value = current;
  });
};

export const renderDeviceCard = (device, { compact = false } = {}) => {
  const statusLabel = device.status === "deleted" ? "已失去" : "使用中";
  const statusClass = device.status === "deleted" ? "status status--warn" : "status";
  const days = calcDays(device.acquired, device.lost);
  const price = getDeviceBuyPrice(device);
  const dailyCost = price && days ? formatMoney(price.amount / days, price.currency) : null;
  const metaRows = [
    device.brand ? `品牌：${escapeHtml(device.brand)}` : "品牌：未记录",
    device.acquired ? `入手：${escapeHtml(device.acquired)}` : "入手：-",
    days ? `持有时间：${days} 天` : "持有时间：-",
    dailyCost ? `每天成本：${dailyCost}` : "每天成本：-"
  ];
  const parent = device.parent ? `<span class="card__parent">${escapeHtml(device.parent)}</span>` : "";
  const imageUrl = thumbnailUrl(device.imagePath);
  const image = !compact
    ? imageUrl
      ? `<div class="card__image" style="background-image:url('${imageUrl}')" role="img" aria-label="${escapeHtml(device.name)}"></div>`
      : `<div class="card__image card__image--empty">No Image</div>`
    : "";
  return `
    <article class="card${compact ? " card--compact" : ""}">
      ${image}
      <div class="card__body">
        <div class="card__head">
          <div>
            <p class="card__tag">${escapeHtml(device.category ?? "未分类")}</p>
            <h3>${escapeHtml(device.name)}</h3>
            ${compact ? `<p class="card__compact-meta">入手：${escapeHtml(device.acquired ?? "-")}</p>` : parent}
          </div>
          <span class="${statusClass}">${statusLabel}</span>
        </div>
        <ul class="card__meta">${metaRows.map((row) => `<li>${row}</li>`).join("")}</ul>
        <a class="card__link" href="${deviceDetailUrl(device.id)}">查看详情</a>
      </div>
    </article>
  `;
};

export const safeDetailImage = (device) => {
  const imageUrl = safeImageUrl(device.imagePath);
  return imageUrl
    ? `<div class="detail__image" style="background-image:url('${imageUrl}')" role="img" aria-label="${escapeHtml(device.name)}"></div>`
    : `<div class="detail__image detail__image--empty">No Image</div>`;
};
