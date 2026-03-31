import { fetchMeta, fetchDevices, fetchCategories } from "./modules/api.js";
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
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-nav");
      if (target) window.location.href = target;
    });
  });

  await fetchMeta();
  await fetchCategories();
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
