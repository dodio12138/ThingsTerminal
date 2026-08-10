import { fetchMeta, fetchDevices, fetchCategories, fetchSettings } from "./modules/api.js";
import { initAuthFields, renderIndex, renderBrowse, renderStats, renderDetail, initAddPage, renderCategorySelects } from "./modules/render.js";
import { initAdmin } from "./modules/admin.js";

const refreshDevices = async () => {
  try {
    await fetchDevices();
    renderIndex();
    renderBrowse();
    renderStats();
    renderDetail();
  } catch {
    // ignore refresh failures
  }
};

const init = async () => {
  document.querySelectorAll(".title-bar-controls button").forEach((button) => {
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll("[data-nav]").forEach((button) => {
    const target = button.getAttribute("data-nav");
    if (target && window.location.pathname.endsWith(target)) {
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => {
      if (target) window.location.href = target;
    });
  });

  await fetchMeta();
  await Promise.all([fetchCategories(), fetchSettings()]);
  initAuthFields();
  renderCategorySelects();

  try {
    await fetchDevices();
  } catch (error) {
    const fallback = document.querySelector("[data-error]");
    if (fallback) fallback.textContent = "数据加载失败，请检查服务器";
    return;
  }

  renderIndex();
  renderBrowse();
  renderStats();
  renderDetail();
  initAddPage();
  initAdmin();

  window.addEventListener("focus", refreshDevices);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshDevices();
    }
  });
};

document.addEventListener("DOMContentLoaded", init);
