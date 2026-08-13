import { CARD_META_FIELDS, CARD_META_LIMIT, DEFAULT_CARD_META_FIELDS, getCardMetaFields, saveCardMetaFields } from "./card-preferences.js";
import { escapeHtml } from "./dom.js";

const dialogMarkup = () => `
  <div class="display-settings-backdrop" data-display-settings-dialog hidden>
    <section class="window display-settings-window" role="dialog" aria-labelledby="display-settings-title">
      <div class="title-bar" data-display-settings-drag-handle>
        <div class="title-bar-text" id="display-settings-title">DISPLAY SETTINGS · 展示设置</div>
        <div class="title-bar-controls"><button type="button" data-display-settings-close aria-label="Close"></button></div>
      </div>
      <div class="window-body">
        <div class="display-settings-layout">
          <aside class="display-settings-nav" aria-label="设置分类">
            <button type="button" data-display-settings-section="card-meta">设备标签显示</button>
          </aside>
          <section class="display-settings-content" data-display-settings-content></section>
        </div>
      </div>
    </section>
  </div>
`;

const contentMarkup = (selected, notice = "") => `
  <div class="sunken-panel display-settings-workspace">
    <div class="display-settings-workspace__inner">
      <p>选择展示页设备卡片中的信息小项，最多显示 ${CARD_META_LIMIT} 项。</p>
      <fieldset class="display-settings-options">
        <legend>可显示项目</legend>
        ${CARD_META_FIELDS.map(({ id, label }) => `
          <div class="display-settings-option">
            <input id="card-meta-${id}" type="checkbox" value="${id}" ${selected.includes(id) ? "checked" : ""} />
            <label for="card-meta-${id}">${escapeHtml(label)}</label>
          </div>
        `).join("")}
      </fieldset>
      <p class="display-settings-count" aria-live="polite" data-display-settings-count>${selected.length} / ${CARD_META_LIMIT} 已选择${notice ? ` · ${escapeHtml(notice)}` : ""}</p>
    </div>
  </div>
  <div class="display-settings-actions">
    <button type="button" data-display-settings-reset>恢复默认</button>
    <button class="default" type="button" data-display-settings-save>保存设置</button>
  </div>
`;

const emptyContentMarkup = () => `<div class="sunken-panel display-settings-workspace" aria-label="设置内容"></div>`;

export const initDisplaySettings = ({ onSave } = {}) => {
  if (document.querySelector("[data-display-settings-dialog]")) return;
  document.body.insertAdjacentHTML("beforeend", dialogMarkup());

  const dialog = document.querySelector("[data-display-settings-dialog]");
  const content = dialog.querySelector("[data-display-settings-content]");
  const closeButton = dialog.querySelector("[data-display-settings-close]");
  const windowEl = dialog.querySelector(".display-settings-window");
  const dragHandle = dialog.querySelector("[data-display-settings-drag-handle]");
  const sectionButton = dialog.querySelector("[data-display-settings-section=card-meta]");
  let selected = getCardMetaFields();
  let opener = null;

  const render = (notice = "") => {
    content.innerHTML = contentMarkup(selected, notice);
  };

  const close = () => {
    dialog.hidden = true;
    opener?.focus();
  };

  const open = (button) => {
    opener = button;
    selected = getCardMetaFields();
    content.innerHTML = emptyContentMarkup();
    sectionButton.classList.remove("is-active");
    dialog.hidden = false;
    sectionButton.focus();
  };

  document.querySelectorAll("[data-display-settings-open]").forEach((button) => {
    button.addEventListener("click", () => open(button));
  });
  closeButton.addEventListener("click", close);
  sectionButton.addEventListener("click", () => {
    sectionButton.classList.add("is-active");
    render();
    content.querySelector("input")?.focus();
  });
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
      const maxLeft = Math.max(0, window.innerWidth - windowEl.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - windowEl.offsetHeight);
      windowEl.style.left = `${Math.min(maxLeft, Math.max(0, moveEvent.clientX - offset.x))}px`;
      windowEl.style.top = `${Math.min(maxTop, Math.max(0, moveEvent.clientY - offset.y))}px`;
    };
    const stop = () => {
      dragHandle.removeEventListener("pointermove", move);
      dragHandle.removeEventListener("pointerup", stop);
      dragHandle.removeEventListener("pointercancel", stop);
    };
    dragHandle.addEventListener("pointermove", move);
    dragHandle.addEventListener("pointerup", stop);
    dragHandle.addEventListener("pointercancel", stop);
  });
  content.addEventListener("change", (event) => {
    if (!event.target.matches("input[type=checkbox]")) return;
    const id = event.target.value;
    if (event.target.checked && selected.length >= CARD_META_LIMIT) {
      event.target.checked = false;
      render(`最多选择 ${CARD_META_LIMIT} 项`);
      return;
    }
    selected = event.target.checked ? [...selected, id] : selected.filter((field) => field !== id);
    render();
  });
  content.addEventListener("click", (event) => {
    if (event.target.matches("[data-display-settings-reset]")) {
      selected = [...DEFAULT_CARD_META_FIELDS];
      render("已恢复默认项目");
    }
    if (event.target.matches("[data-display-settings-save]")) {
      saveCardMetaFields(selected);
      onSave?.();
      close();
    }
  });
};
