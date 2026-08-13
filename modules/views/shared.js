import { store } from "../store.js";
import { convertAmount, formatMoney, parsePrice } from "../../shared/finance.js";
import { DEFAULT_SETTINGS } from "../../shared/constants.js";
import { deviceDetailUrl, escapeHtml, safeImageUrl, thumbnailUrl } from "../dom.js";
import { getCardMetaFields } from "../card-preferences.js";

const RETRO_DEVICE_ILLUSTRATIONS = Object.freeze({
  "MacBook Pro Early 2015": "/generated/retro-macbook-2015.png",
  "Sony WH-1000XM5": "/generated/retro-headphones.png",
  "DJI Pocket 3": "/generated/retro-dji-pocket-camera.png"
});

export const settings = () => store.settings || DEFAULT_SETTINGS;

export const getDeviceBuyPrice = (device) => {
  if (device.buyPrice !== null && device.buyPrice !== undefined && Number.isFinite(Number(device.buyPrice))) {
    return { amount: Number(device.buyPrice), currency: device.buyCurrency || "CNY" };
  }
  return parsePrice(device.acquiredTip);
};

export const getDeviceSellPrice = (device) => {
  if (device.sellPrice !== null && device.sellPrice !== undefined && Number.isFinite(Number(device.sellPrice))) {
    return { amount: Number(device.sellPrice), currency: device.sellCurrency || "CNY" };
  }
  return null;
};

export const toBaseCurrency = (amount, currency) => convertAmount(amount, currency, settings());

export const deviceImageUrl = (device, { thumbnail = false } = {}) => {
  const storedImage = thumbnail ? thumbnailUrl(device.imagePath) : safeImageUrl(device.imagePath);
  return storedImage || RETRO_DEVICE_ILLUSTRATIONS[device.name] || null;
};

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
  const sellPrice = getDeviceSellPrice(device);
  const isSettled = device.status === "deleted" && price && sellPrice && days;
  const sameSettlementCurrency = isSettled && price.currency === sellPrice.currency;
  const settlementCurrency = sameSettlementCurrency ? price.currency : settings().baseCurrency;
  const buyAmount = isSettled
    ? (sameSettlementCurrency ? price.amount : toBaseCurrency(price.amount, price.currency))
    : null;
  const sellAmount = isSettled
    ? (sameSettlementCurrency ? sellPrice.amount : toBaseCurrency(sellPrice.amount, sellPrice.currency))
    : null;
  const netResult = buyAmount !== null && sellAmount !== null ? sellAmount - buyAmount : null;
  const dailyCost = !isSettled && price && days ? formatMoney(price.amount / days, price.currency) : null;
  const financialResult = netResult === null
    ? (dailyCost ? `每天成本：${dailyCost}` : "每天成本：-")
    : netResult > 0
      ? `<span class="card__money card__money--profit">最终收益：+${formatMoney(netResult, settlementCurrency)}</span>`
      : netResult < 0
        ? `<span class="card__money card__money--loss">每日支出：${formatMoney(Math.abs(netResult) / days, settlementCurrency)}</span>`
        : "最终损益：持平";
  const metaRowsByField = {
    brand: device.brand ? `品牌：${escapeHtml(device.brand)}` : "品牌：未记录",
    acquired: device.acquired ? `入手：${escapeHtml(device.acquired)}` : "入手：-",
    days: days ? `持有时间：${days} 天` : "持有时间：-",
    dailyCost: financialResult,
    buyPrice: price ? `入手价格：${formatMoney(price.amount, price.currency)}` : "入手价格：-",
    sellPrice: sellPrice ? `卖出价格：${formatMoney(sellPrice.amount, sellPrice.currency)}` : "卖出价格：-",
    category: `类别：${escapeHtml(device.category ?? "未分类")}`,
    status: `状态：${statusLabel}`,
    tags: device.tags?.length ? `标签：${device.tags.map(escapeHtml).join("、")}` : "标签：-",
    warrantyUntil: device.warrantyUntil ? `保修：${escapeHtml(device.warrantyUntil)}` : "保修：-",
    acquiredLocation: device.acquiredLocation ? `入手地点：${escapeHtml(device.acquiredLocation)}` : "入手地点：-",
    parent: device.parent ? `所属：${escapeHtml(device.parent)}` : "所属：-"
  };
  const metaRows = getCardMetaFields().map((field) => metaRowsByField[field]).filter(Boolean);
  const parent = device.parent ? `<span class="card__parent">${escapeHtml(device.parent)}</span>` : "";
  const imageUrl = deviceImageUrl(device, { thumbnail: true });
  const image = imageUrl
    ? `<div class="card__image" style="background-image:url('${imageUrl}')" role="img" aria-label="${escapeHtml(device.name)}"></div>`
    : compact ? "" : `<div class="card__image card__image--empty">No Image</div>`;
  return `
    <article class="card${compact ? " card--compact" : ""}">
      ${image}
      <div class="card__body">
        <div class="card__head">
          <div>
            <p class="card__tag">${escapeHtml(device.category ?? "未分类")}</p>
            <h3>${escapeHtml(device.name)}</h3>
            ${compact ? "" : parent}
          </div>
          <span class="${statusClass}">${statusLabel}</span>
        </div>
        <ul class="card__meta">${metaRows.map((row) => `<li>${row}</li>`).join("")}</ul>
        <a class="card__link" data-device-detail-id="${device.id}" href="${deviceDetailUrl(device.id)}">查看详情</a>
      </div>
    </article>
  `;
};

export const safeDetailImage = (device) => {
  const imageUrl = deviceImageUrl(device);
  return imageUrl
    ? `<div class="detail__image" style="background-image:url('${imageUrl}')" role="img" aria-label="${escapeHtml(device.name)}"></div>`
    : `<div class="detail__image detail__image--empty">No Image</div>`;
};
