// @ts-check

import { store } from "./store.js";
import {
  uploadImage,
  createCategory,
  updateDevice,
  createDevice,
  deleteDevice,
  bulkUpdate,
  bulkDelete,
  exportDevices,
  importDevices,
  fetchDevices,
  fetchCategories
} from "./api.js";
import { renderCategorySelects } from "./render.js";
import { normalizeSpecs } from "./schema.js";

const getSelectedIds = (listEl) =>
  Array.from(listEl.querySelectorAll("[data-select-id]:checked")).map((input) => input.dataset.selectId);

export const initAdmin = () => {
  const listEl = document.querySelector("[data-admin-list]");
  if (!listEl) return;

  const form = document.querySelector("[data-admin-form]");
  const statusEl = document.querySelector("[data-admin-status]");
  const resetBtn = document.querySelector("[data-admin-reset]");
  const selectedCount = document.querySelector("[data-selected-count]");
  const clearSelectionBtn = document.querySelector("[data-clear-selection]");
  const addCategoryBtn = document.querySelector("[data-add-category]");
  const newCategoryInput = document.querySelector("[data-new-category]");
  const uploadButton = document.querySelector("[data-upload-btn]");
  const uploadInput = document.querySelector("[data-image-file]");
  const uploadStatus = document.querySelector("[data-upload-status]");
  const bulkCategory = document.querySelector("[data-bulk-category]");
  const bulkStatus = document.querySelector("[data-bulk-status]");
  const bulkBrand = document.querySelector("[data-bulk-brand]");
  const bulkApply = document.querySelector("[data-bulk-apply]");
  const bulkDeleteBtn = document.querySelector("[data-bulk-delete]");
  const exportBtn = document.querySelector("[data-export-json]");
  const importInput = document.querySelector("[data-import-json]");
  const importMode = document.querySelector("[data-import-mode]");
  const importPreview = document.querySelector("[data-import-preview]");
  const importConfirm = document.querySelector("[data-import-confirm]");
  const editSelect = document.querySelector("[data-edit-select]");
  const loadEditBtn = document.querySelector("[data-load-edit]");
  const adminPanel = listEl.closest(".admin-panel");
  const adminHeader = adminPanel?.querySelector(".admin-header");

  let pendingImport = null;

  const normalizeCurrencyValue = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "CNY";
    if (raw === "¥" || raw === "￥") return "CNY";
    if (raw === "$") return "USD";
    if (raw === "£") return "GBP";
    if (raw === "€") return "EUR";
    return raw.toUpperCase();
  };

  const syncListMaxHeight = () => {
    if (!form || !adminPanel || !adminHeader) return;
    const formHeight = form.getBoundingClientRect().height;
    if (!formHeight) return;
    const panelStyle = window.getComputedStyle(adminPanel);
    const paddingTop = parseFloat(panelStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(panelStyle.paddingBottom) || 0;
    const rowGap = parseFloat(panelStyle.rowGap || panelStyle.gap) || 0;
    const headerHeight = adminHeader.getBoundingClientRect().height;

    const maxHeight = Math.max(180, Math.floor(formHeight - paddingTop - paddingBottom - headerHeight - rowGap));
    listEl.style.setProperty("--admin-list-max-height", `${maxHeight}px`);
  };

  const renderEditSelect = () => {
    if (!editSelect) return;
    const current = editSelect.value;
    editSelect.innerHTML = [
      `<option value="">选择设备</option>`,
      ...store.devices.map((device) => `<option value="${device.id}">${device.name}</option>`)
    ].join("");
    if (current) editSelect.value = current;
  };

  const renderList = () => {
    listEl.innerHTML = store.devices
      .map(
        (device) => `
          <div class="admin-row">
            <label class="admin-row__select">
              <input type="checkbox" data-select-id="${device.id}" />
            </label>
            <div>
              <strong>${device.name}</strong>
              <p>${device.category ?? "未分类"} · ${device.acquired ?? "-"}</p>
            </div>
            <div class="admin-row__actions">
              <button data-edit-id="${device.id}">编辑</button>
              <button data-delete-id="${device.id}">删除</button>
            </div>
          </div>
        `
      )
      .join("");
    renderEditSelect();
    requestAnimationFrame(syncListMaxHeight);
  };

  const updateSelectedCount = () => {
    if (!selectedCount) return;
    const count = listEl.querySelectorAll("[data-select-id]:checked").length;
    selectedCount.textContent = `已选 ${count}`;
  };

  const fillForm = (device) => {
    if (!form) return;
    form.dataset.editId = device?.id ? String(device.id) : "";
    form.querySelector("[name=name]").value = device?.name ?? "";
    form.querySelector("[name=category]").value = device?.category ?? "";
    form.querySelector("[name=brand]").value = device?.brand ?? "";
    form.querySelector("[name=status]").value = device?.status ?? "active";
    form.querySelector("[name=acquired]").value = device?.acquired ?? "";
    form.querySelector("[name=buyPrice]").value =
      device?.buyPrice != null ? String(device.buyPrice) : "";
    form.querySelector("[name=buyCurrency]").value = normalizeCurrencyValue(device?.buyCurrency);
    form.querySelector("[name=lost]").value = device?.lost ?? "";
    form.querySelector("[name=sellPrice]").value =
      device?.sellPrice != null ? String(device.sellPrice) : "";
    form.querySelector("[name=sellCurrency]").value = normalizeCurrencyValue(device?.sellCurrency);
    form.querySelector("[name=imagePath]").value = device?.imagePath ?? "";
    form.querySelector("[name=acquiredTip]").value = device?.acquiredTip ?? "";
    form.querySelector("[name=lostTip]").value = device?.lostTip ?? "";
    form.querySelector("[name=acquiredLocation]").value = device?.acquiredLocation ?? "";
    form.querySelector("[name=lostLocation]").value = device?.lostLocation ?? "";
    form.querySelector("[name=parent]").value = device?.parent ?? "";
    form.querySelector("[name=specs]").value = (device?.specs ?? []).join("\n");
  };

  renderCategorySelects();
  renderList();
  updateSelectedCount();
  requestAnimationFrame(syncListMaxHeight);
  window.addEventListener("resize", syncListMaxHeight);
  if (form && "ResizeObserver" in window) {
    const observer = new ResizeObserver(() => syncListMaxHeight());
    observer.observe(form);
  }

  if (bulkCategory) {
    bulkCategory.innerHTML = [
      `<option value="__keep__">分类不变</option>`,
      `<option value="__uncat__">未分类</option>`,
      ...store.categories.map((name) => `<option value="${name}">${name}</option>`)
    ].join("");
  }

  listEl.addEventListener("change", (event) => {
    if (event.target.matches("[data-select-id]")) {
      updateSelectedCount();
    }
  });

  listEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (target.matches("[data-edit-id]")) {
      const device = store.devices.find((item) => String(item.id) === target.dataset.editId);
      fillForm(device);
      if (statusEl) statusEl.textContent = "正在编辑";
    }
    if (target.matches("[data-delete-id]")) {
      const id = target.dataset.deleteId;
      if (!id) return;
      if (!confirm("确定删除该设备吗？")) return;
      try {
        await deleteDevice(id);
        await fetchDevices();
        renderList();
        updateSelectedCount();
        if (statusEl) statusEl.textContent = "已删除";
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || "删除失败";
      }
    }
  });

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      listEl.querySelectorAll("[data-select-id]:checked").forEach((input) => {
        input.checked = false;
      });
      updateSelectedCount();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      fillForm(null);
      if (statusEl) statusEl.textContent = "新建设备";
    });
  }

  if (loadEditBtn) {
    loadEditBtn.addEventListener("click", () => {
      if (!editSelect?.value) return;
      const device = store.devices.find((item) => String(item.id) === String(editSelect.value));
      if (device) {
        fillForm(device);
        if (statusEl) statusEl.textContent = "正在编辑";
      }
    });
  }

  if (editSelect) {
    editSelect.addEventListener("change", () => {
      if (!editSelect.value) return;
      const device = store.devices.find((item) => String(item.id) === String(editSelect.value));
      if (device) {
        fillForm(device);
        if (statusEl) statusEl.textContent = "正在编辑";
      }
    });
  }

  if (uploadButton && uploadInput && uploadStatus && form) {
    const imagePathInput = form.querySelector("[name=imagePath]");
    uploadButton.addEventListener("click", async () => {
      if (!uploadInput.files?.length) return;
      uploadStatus.textContent = "上传中...";
      try {
        const result = await uploadImage(uploadInput.files[0]);
        if (imagePathInput) imagePathInput.value = result.url;
        uploadStatus.textContent = "已上传";
        uploadInput.value = "";
      } catch (error) {
        uploadStatus.textContent = error.message || "上传失败";
      }
    });
  }

  if (addCategoryBtn && newCategoryInput) {
    addCategoryBtn.addEventListener("click", async () => {
      const name = newCategoryInput.value.trim();
      if (!name) return;
      try {
        await createCategory(name);
        renderCategorySelects(name);
        if (bulkCategory) {
          bulkCategory.innerHTML = [
            `<option value="__keep__">分类不变</option>`,
            `<option value="__uncat__">未分类</option>`,
            ...store.categories.map((cat) => `<option value="${cat}">${cat}</option>`)
          ].join("");
          bulkCategory.value = name;
        }
        newCategoryInput.value = "";
        if (statusEl) statusEl.textContent = "已添加分类";
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || "添加分类失败";
      }
    });
  }

  if (bulkApply) {
    bulkApply.addEventListener("click", async () => {
      const ids = getSelectedIds(listEl);
      if (ids.length === 0) return;
      const changes = {
        category:
          bulkCategory?.value === "__keep__" ? null :
          bulkCategory?.value === "__uncat__" ? "" :
          bulkCategory?.value || null,
        status: bulkStatus?.value || null,
        brand: bulkBrand?.value?.trim() || null
      };
      try {
        await bulkUpdate(ids, changes);
        await fetchCategories();
        renderCategorySelects();
        await fetchDevices();
        renderList();
        updateSelectedCount();
        if (statusEl) statusEl.textContent = "批量更新完成";
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || "批量更新失败";
      }
    });
  }

  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", async () => {
      const ids = getSelectedIds(listEl);
      if (ids.length === 0) return;
      if (!confirm("确定批量删除这些设备吗？")) return;
      try {
        await bulkDelete(ids);
        await fetchDevices();
        renderList();
        updateSelectedCount();
        if (statusEl) statusEl.textContent = "批量删除完成";
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || "批量删除失败";
      }
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      try {
        const data = await exportDevices();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "devices-export.json";
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || "导出失败";
      }
    });
  }

  if (importInput) {
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const mode = importMode?.value || "append";
      try {
        const text = await file.text();
        const items = JSON.parse(text);
        if (!Array.isArray(items)) {
          throw new Error("JSON 必须是数组");
        }
        const invalid = items.filter((item) => !item?.name);
        const valid = items.length - invalid.length;
        pendingImport = { mode, items };
        if (importPreview) {
          importPreview.innerHTML = `
            <p>待导入：${items.length} 条</p>
            <p>可导入：${valid} 条</p>
            <p>将跳过：${invalid.length} 条（缺少 name）</p>
            <button type="button" data-import-confirm>确认导入</button>
          `;
        }
        if (statusEl) statusEl.textContent = "已生成导入预览";
      } catch (error) {
        if (importPreview) {
          importPreview.innerHTML = `<p class="empty">预览失败：${error.message || "格式错误"}</p>`;
        }
        if (statusEl) statusEl.textContent = error.message || "预览失败";
      } finally {
        importInput.value = "";
      }
    });
  }

  if (importPreview) {
    importPreview.addEventListener("click", async (event) => {
      const target = event.target;
      if (!target.matches("[data-import-confirm]")) return;
      if (!pendingImport) return;
      const { mode, items } = pendingImport;
      if (mode === "replace" && !confirm("覆盖导入会清空当前数据，是否继续？")) return;
      try {
        const result = await importDevices(mode, items);
        await fetchCategories();
        renderCategorySelects();
        await fetchDevices();
        renderList();
        updateSelectedCount();
        if (statusEl) statusEl.textContent = `导入完成（${result.inserted ?? 0} 条，跳过 ${result.skipped ?? 0} 条）`;
        pendingImport = null;
        importPreview.innerHTML = `<p class="empty">导入完成。</p>`;
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || "导入失败";
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = {
        name: formData.get("name")?.toString().trim(),
        category: formData.get("category")?.toString().trim() || null,
        brand: formData.get("brand")?.toString().trim() || null,
        status: formData.get("status"),
        acquired: formData.get("acquired")?.toString().trim() || null,
        buyPrice: formData.get("buyPrice")?.toString().trim() || null,
        buyCurrency: formData.get("buyCurrency")?.toString().trim() || "CNY",
        lost: formData.get("lost")?.toString().trim() || null,
        sellPrice: formData.get("sellPrice")?.toString().trim() || null,
        sellCurrency: formData.get("sellCurrency")?.toString().trim() || "CNY",
        imagePath: formData.get("imagePath")?.toString().trim() || null,
        acquiredTip: formData.get("acquiredTip")?.toString().trim() || null,
        lostTip: formData.get("lostTip")?.toString().trim() || null,
        acquiredLocation: formData.get("acquiredLocation")?.toString().trim() || null,
        lostLocation: formData.get("lostLocation")?.toString().trim() || null,
        parent: formData.get("parent")?.toString().trim() || null,
        specs: normalizeSpecs(formData.get("specs")?.toString() || "")
      };

      if (!payload.name) {
        if (statusEl) statusEl.textContent = "请填写名称";
        return;
      }

      const editId = form.dataset.editId;
      try {
        if (editId) {
          await updateDevice(editId, payload);
        } else {
          await createDevice(payload);
        }
        await fetchCategories();
        renderCategorySelects();
        await fetchDevices();
        renderList();
        updateSelectedCount();
        if (statusEl) statusEl.textContent = editId ? "已更新" : "已创建";
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message || "保存失败";
      }
    });
  }
};
