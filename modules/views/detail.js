import { store } from "../store.js";
import { escapeHtml } from "../dom.js";
import { calcDays, getDeviceBuyPrice, safeDetailImage } from "./shared.js";
import { formatMoney } from "../../shared/finance.js";

export const renderDetail = () => {
  const container = document.querySelector("[data-device-detail]");
  if (!container) return;
  const params = new URLSearchParams(window.location.search);
  const device = store.devices.find((item) => String(item.id) === params.get("id"));
  if (!params.get("id")) {
    container.innerHTML = `<p class="empty">没有找到设备 ID</p>`;
    return;
  }
  if (!device) {
    container.innerHTML = `<p class="empty">设备不存在或已删除</p>`;
    return;
  }
  const returnTarget = params.get("return");
  const backHref = returnTarget?.startsWith("/") && !returnTarget.startsWith("//") ? returnTarget : "index.html";
  const price = getDeviceBuyPrice(device);
  const rows = [
    ["品牌", device.brand || "未记录"],
    ["入手", device.acquired || "未记录"],
    ["买入价格", price ? formatMoney(price.amount, price.currency) : "未记录"],
    ["持有时间", calcDays(device.acquired, device.lost) ? `${calcDays(device.acquired, device.lost)} 天` : "未记录"],
    ["入手地点", device.acquiredLocation || "未记录"],
    ["保修截止", device.warrantyUntil || "未记录"],
    ["失去时间", device.lost || "仍持有"],
    ["失去地点", device.lostLocation || "-"],
    ["所属", device.parent || "无父级"]
  ];
  const specs = device.specs?.length
    ? `<ul class="detail__specs">${device.specs.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`
    : `<p class="empty">暂无规格信息</p>`;
  const tags = device.tags?.length
    ? `<div class="detail__section"><h3>标签</h3><div class="badge-row">${device.tags.map((value) => `<span class="badge">${escapeHtml(value)}</span>`).join("")}</div></div>`
    : "";
  container.innerHTML = `
    <div class="detail">
      ${safeDetailImage(device)}
      <div class="detail__content">
        <a class="card__link" href="${escapeHtml(backHref)}">← 返回列表</a>
        <div class="detail__header"><div>
          <p class="card__tag">${escapeHtml(device.category ?? "未分类")}</p><h1>${escapeHtml(device.name)}</h1>
          <div class="badge-row"><span class="badge">${escapeHtml(device.category ?? "未分类")}</span><span class="badge badge--accent">${escapeHtml(device.brand ?? "无品牌")}</span></div>
        </div><span class="status ${device.status === "deleted" ? "status--warn" : ""}">${device.status === "deleted" ? "已失去" : "使用中"}</span></div>
        <dl class="detail__meta">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
        <div class="detail__section"><h3>规格</h3>${specs}</div>
        ${tags}
        <div class="detail__section"><h3>备注</h3><p>${escapeHtml(device.acquiredTip || device.lostTip || "暂无备注")}</p></div>
      </div>
    </div>
  `;
};
