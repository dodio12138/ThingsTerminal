import { store } from "./store.js";
import { escapeHtml } from "./dom.js";
import { formatMoney } from "../shared/finance.js";
import { calcDays, deviceImageUrl, getDeviceBuyPrice, getDeviceSellPrice } from "./views/shared.js";

const dialogMarkup = () => `
  <div class="device-detail-popover" data-device-detail-dialog hidden>
    <section class="window device-detail-window" role="dialog" aria-labelledby="device-detail-title">
      <div class="title-bar" data-device-detail-drag-handle>
        <div class="title-bar-text" id="device-detail-title">DEVICE DETAILS · 设备详情</div>
        <div class="title-bar-controls"><button type="button" data-device-detail-close aria-label="Close"></button></div>
      </div>
      <div class="device-detail-subtitle" data-device-detail-subtitle></div>
      <div class="window-body"><div class="sunken-panel device-detail-workspace" data-device-detail-content></div></div>
    </section>
  </div>
`;

const deviceImage = (device) => {
  const imageUrl = deviceImageUrl(device);
  return imageUrl
    ? `<div class="device-detail-dialog__image" style="background-image:url('${imageUrl}')" role="img" aria-label="${escapeHtml(device.name)}"></div>`
    : `<div class="device-detail-dialog__image device-detail-dialog__image--empty">No Image</div>`;
};

const contentMarkup = (device) => {
  const buy = getDeviceBuyPrice(device);
  const sell = getDeviceSellPrice(device);
  const days = calcDays(device.acquired, device.lost);
  const rows = [
    ["类别", device.category || "未分类"], ["品牌", device.brand || "未记录"],
    ["入手", device.acquired || "未记录"], ["持有", days ? `${days} 天` : "未记录"],
    ["买入", buy ? formatMoney(buy.amount, buy.currency) : "未记录"], ["卖出", sell ? formatMoney(sell.amount, sell.currency) : "未记录"],
    ["入手地点", device.acquiredLocation || "未记录"], ["保修截止", device.warrantyUntil || "未记录"],
    ["状态", device.status === "deleted" ? "已失去" : "使用中"], ["所属", device.parent || "无父级"]
  ];
  const specs = device.specs?.length ? device.specs.map((value) => `<li>${escapeHtml(value)}</li>`).join("") : "<li>暂无规格信息</li>";
  const tags = device.tags?.length ? device.tags.map((value) => `<span class="badge">${escapeHtml(value)}</span>`).join("") : "<span>暂无标签</span>";
  return `
    <div class="device-detail-dialog__top">
      ${deviceImage(device)}
      <div class="device-detail-dialog__summary">
        <div class="device-detail-dialog__headline"><span class="status ${device.status === "deleted" ? "status--warn" : ""}">${device.status === "deleted" ? "已失去" : "使用中"}</span></div>
        <dl class="device-detail-dialog__meta">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      </div>
    </div>
    <div class="device-detail-dialog__sections">
      <section><h3>规格</h3><ul>${specs}</ul></section>
      <section><h3>标签</h3><div class="badge-row">${tags}</div></section>
      <section><h3>备注</h3><p>${escapeHtml(device.acquiredTip || device.lostTip || "暂无备注")}</p></section>
    </div>
  `;
};

export const initDeviceDetailDialog = () => {
  if (document.querySelector("[data-device-detail-dialog]")) return;
  document.body.insertAdjacentHTML("beforeend", dialogMarkup());
  const dialog = document.querySelector("[data-device-detail-dialog]");
  const windowEl = dialog.querySelector(".device-detail-window");
  const content = dialog.querySelector("[data-device-detail-content]");
  const subtitle = dialog.querySelector("[data-device-detail-subtitle]");
  const dragHandle = dialog.querySelector("[data-device-detail-drag-handle]");
  let opener = null;

  const close = () => { dialog.hidden = true; opener?.focus(); };
  const open = (id, trigger) => {
    const device = store.devices.find((item) => String(item.id) === String(id));
    if (!device) return;
    opener = trigger;
    subtitle.textContent = device.name;
    content.innerHTML = contentMarkup(device);
    dialog.hidden = false;
    dialog.querySelector("[data-device-detail-close]").focus();
  };

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-device-detail-id]");
    if (!trigger) return;
    event.preventDefault();
    open(trigger.dataset.deviceDetailId, trigger);
  });
  dialog.querySelector("[data-device-detail-close]").addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.hidden) close();
  });
  dragHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = windowEl.getBoundingClientRect();
    const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    windowEl.classList.add("is-draggable");
    windowEl.style.left = `${rect.left}px`;
    windowEl.style.top = `${rect.top}px`;
    dragHandle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      windowEl.style.left = `${Math.min(Math.max(0, window.innerWidth - windowEl.offsetWidth), Math.max(0, moveEvent.clientX - offset.x))}px`;
      windowEl.style.top = `${Math.min(Math.max(0, window.innerHeight - windowEl.offsetHeight), Math.max(0, moveEvent.clientY - offset.y))}px`;
    };
    const stop = () => { dragHandle.removeEventListener("pointermove", move); dragHandle.removeEventListener("pointerup", stop); dragHandle.removeEventListener("pointercancel", stop); };
    dragHandle.addEventListener("pointermove", move);
    dragHandle.addEventListener("pointerup", stop);
    dragHandle.addEventListener("pointercancel", stop);
  });
};
