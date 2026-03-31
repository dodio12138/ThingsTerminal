let devices = [];
let categories = [];
let authRequired = false;
let adminPassword = localStorage.getItem("adminPassword") || "";

const formatDate = (value) => {
  if (!value) return "";
  return value;
};

const apiFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (adminPassword) {
    headers.set("x-admin-password", adminPassword);
  }
  return fetch(url, { ...options, headers });
};

const fetchMeta = async () => {
  try {
    const response = await fetch("/api/meta");
    if (response.ok) {
      const meta = await response.json();
      authRequired = Boolean(meta.authRequired);
    }
  } catch {
    authRequired = false;
  }
};

const fetchDevices = async () => {
  const response = await fetch("/api/devices");
  if (!response.ok) throw new Error("Failed to load devices");
  devices = await response.json();
};

const fetchCategories = async () => {
  try {
    const response = await fetch("/api/categories");
    if (!response.ok) return;
    categories = await response.json();
  } catch {
    categories = [];
  }
};

const renderCategorySelects = (selectedValue = "") => {
  const selects = document.querySelectorAll("[data-category-select]");
  selects.forEach((select) => {
    if (!select) return;
    const current = selectedValue || select.value || "";
    select.innerHTML = [
      `<option value="">未分类</option>`,
      ...categories.map((name) => `<option value="${name}">${name}</option>`)
    ].join("");
    if (current) select.value = current;
  });
};

const computeStats = () => {
  const active = devices.filter((d) => d.status !== "deleted").length;
  const deleted = devices.filter((d) => d.status === "deleted").length;
  const categoriesSet = Array.from(new Set(devices.map((d) => d.category).filter(Boolean)));
  return { total: devices.length, active, deleted, categories: categoriesSet };
};

const renderDeviceCard = (device) => {
  const statusLabel = device.status === "deleted" ? "已失去" : "使用中";
  const statusClass = device.status === "deleted" ? "status status--warn" : "status";
  const parent = device.parent ? `<span class="card__parent">${device.parent}</span>` : "";
  const image = device.imagePath
    ? `<div class="card__image" style="background-image:url('${device.imagePath}')"></div>`
    : `<div class="card__image card__image--empty">No Image</div>`;

  const metaRows = [
    device.acquired ? `入手：${formatDate(device.acquired)}` : null,
    device.lost ? `失去：${formatDate(device.lost)}` : null,
    device.acquiredLocation ? `地点：${device.acquiredLocation}` : null
  ].filter(Boolean);

  const specs = device.specs?.length
    ? `<ul class="card__specs">${device.specs.slice(0, 4).map((spec) => `<li>${spec}</li>`).join("")}</ul>`
    : "";

  const notes = device.lostTip || device.acquiredTip;
  const noteHtml = notes ? `<p class="card__note">${notes}</p>` : "";

  return `
    <article class="card">
      ${image}
      <div class="card__body">
        <div class="card__head">
          <div>
            <p class="card__tag">${device.category ?? "未分类"}</p>
            <h3>${device.name}</h3>
            ${parent}
          </div>
          <span class="${statusClass}">${statusLabel}</span>
        </div>
        ${metaRows.length ? `<ul class="card__meta">${metaRows.map((row) => `<li>${row}</li>`).join("")}</ul>` : ""}
        ${specs}
        ${noteHtml}
        <a class="card__link" href="device.html?id=${device.id}">查看详情</a>
      </div>
    </article>
  `;
};

const renderCompactCard = (device) => {
  const statusLabel = device.status === "deleted" ? "已失去" : "使用中";
  const statusClass = device.status === "deleted" ? "status status--warn" : "status";

  const metaRows = [
    device.acquired ? `入手：${formatDate(device.acquired)}` : null,
    device.lost ? `失去：${formatDate(device.lost)}` : null,
    device.acquiredLocation ? `地点：${device.acquiredLocation}` : null
  ].filter(Boolean);

  const specs = device.specs?.length
    ? `<ul class="card__specs">${device.specs.slice(0, 6).map((spec) => `<li>${spec}</li>`).join("")}</ul>`
    : "";

  const notes = device.lostTip || device.acquiredTip;
  const noteHtml = notes ? `<p class="card__note">${notes}</p>` : "";

  return `
    <article class="card card--compact">
      <details>
        <summary>
          <div>
            <p class="card__tag">${device.category ?? "未分类"}</p>
            <h3>${device.name}</h3>
            <p class="card__compact-meta">入手：${device.acquired ?? "-"}</p>
          </div>
          <span class="${statusClass}">${statusLabel}</span>
        </summary>
        <div class="card__compact-body">
          ${metaRows.length ? `<ul class="card__meta">${metaRows.map((row) => `<li>${row}</li>`).join("")}</ul>` : ""}
          ${specs}
          ${noteHtml}
          <a class="card__link" href="device.html?id=${device.id}">查看详情</a>
        </div>
      </details>
    </article>
  `;
};

const renderCategoryCards = () => {
  const container = document.querySelector("[data-category-grid]");
  if (!container) return;

  const categoryMap = new Map();
  devices.forEach((device) => {
    const category = device.category ?? "未分类";
    const entry = categoryMap.get(category) ?? { count: 0, active: 0, latest: null };
    entry.count += 1;
    if (device.status !== "deleted") entry.active += 1;
    if (device.acquired && (!entry.latest || device.acquired > entry.latest)) {
      entry.latest = device.acquired;
    }
    categoryMap.set(category, entry);
  });

  container.innerHTML = Array.from(categoryMap.entries())
    .map(([category, info]) => {
      return `
        <div class="category-card">
          <h3>${category}</h3>
          <p>设备数量：${info.count}</p>
          <p>仍在使用：${info.active}</p>
          <p>最新入手：${info.latest ?? "-"}</p>
        </div>
      `;
    })
    .join("");
};

const renderIndex = () => {
  const stats = computeStats();
  const totalEl = document.querySelector("[data-total]");
  const activeEl = document.querySelector("[data-active]");
  const deletedEl = document.querySelector("[data-deleted]");
  if (totalEl) totalEl.textContent = stats.total;
  if (activeEl) activeEl.textContent = stats.active;
  if (deletedEl) deletedEl.textContent = stats.deleted;

  const featured = document.querySelector("[data-featured]");
  if (featured) {
    const sorted = [...devices]
      .filter((d) => d.status !== "deleted")
      .sort((a, b) => (b.acquired ?? "0000-00").localeCompare(a.acquired ?? "0000-00"))
      .slice(0, 8);
    featured.innerHTML = sorted.map(renderCompactCard).join("");
  }

  renderCategoryCards();
};

const renderBrowse = () => {
  const listEl = document.querySelector("[data-browse-list]");
  if (!listEl) return;

  const searchInput = document.querySelector("[data-search]");
  const filterGroup = document.querySelector("[data-filter-group]");
  const countEl = document.querySelector("[data-result-count]");

  const categoriesSet = Array.from(new Set(devices.map((d) => d.category ?? "未分类")));
  const brandsSet = Array.from(new Set(devices.map((d) => d.brand).filter(Boolean)));
  const yearsSet = Array.from(
    new Set(
      devices
        .map((d) => d.acquired?.split("-")[0])
        .filter(Boolean)
    )
  ).sort((a, b) => Number(b) - Number(a));
  const statusOptions = ["全部", "使用中", "已失去"];

  const state = {
    query: "",
    category: "全部",
    status: "全部",
    brand: "全部",
    year: "全部"
  };

  const renderFilters = () => {
    if (!filterGroup) return;
    const categoryChips = categoriesSet
      .map((category) => `<button class="chip" data-category="${category}">${category}</button>`)
      .join("");
    const brandOptions = brandsSet.map((brand) => `<option value="${brand}">${brand}</option>`).join("");
    const yearOptions = yearsSet.map((year) => `<option value="${year}">${year}</option>`).join("");
    filterGroup.innerHTML = `
      <div class="filter-row">
        <span>分类</span>
        <div class="chips">
          <button class="chip chip--active" data-category="全部">全部</button>
          ${categoryChips}
        </div>
      </div>
      <div class="filter-row">
        <span>品牌</span>
        <select class="select" data-brand>
          <option value="全部">全部</option>
          ${brandOptions}
        </select>
      </div>
      <div class="filter-row">
        <span>年份</span>
        <select class="select" data-year>
          <option value="全部">全部</option>
          ${yearOptions}
        </select>
      </div>
      <div class="filter-row">
        <span>状态</span>
        <div class="chips">
          ${statusOptions
            .map((status, index) =>
              `<button class="chip ${index === 0 ? "chip--active" : ""}" data-status="${status}">${status}</button>`
            )
            .join("")}
        </div>
      </div>
    `;
  };

  const applyFilters = () => {
    let result = devices;
    if (state.query) {
      const q = state.query.toLowerCase();
      result = result.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q) ||
        (d.brand ?? "").toLowerCase().includes(q)
      );
    }
    if (state.category !== "全部") {
      result = result.filter((d) => (d.category ?? "未分类") === state.category);
    }
    if (state.status !== "全部") {
      const isDeleted = state.status === "已失去";
      result = result.filter((d) => (isDeleted ? d.status === "deleted" : d.status !== "deleted"));
    }
    if (state.brand !== "全部") {
      result = result.filter((d) => (d.brand ?? "") === state.brand);
    }
    if (state.year !== "全部") {
      result = result.filter((d) => (d.acquired ?? "").startsWith(state.year));
    }
    listEl.innerHTML = result.map(renderDeviceCard).join("") || "<p class=\"empty\">没有匹配的设备</p>";
    if (countEl) countEl.textContent = result.length;
  };

  renderFilters();
  applyFilters();

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      applyFilters();
    });
  }

  if (filterGroup) {
    filterGroup.addEventListener("click", (event) => {
      const target = event.target;
      if (target.matches("[data-category]")) {
        state.category = target.dataset.category;
        target.parentElement.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("chip--active"));
        target.classList.add("chip--active");
        applyFilters();
      }
      if (target.matches("[data-status]")) {
        state.status = target.dataset.status;
        target.parentElement.querySelectorAll(".chip").forEach((chip) => chip.classList.remove("chip--active"));
        target.classList.add("chip--active");
        applyFilters();
      }
    });
  }

  filterGroup.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-brand]")) {
      state.brand = target.value;
      applyFilters();
    }
    if (target.matches("[data-year]")) {
      state.year = target.value;
      applyFilters();
    }
  });
};

const renderStats = () => {
  const container = document.querySelector("[data-stats]");
  if (!container) return;

  const stats = computeStats();
  const categoryCounts = devices.reduce((acc, device) => {
    const category = device.category ?? "未分类";
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const yearCounts = devices
    .filter((d) => d.acquired)
    .reduce((acc, device) => {
      const year = device.acquired.split("-")[0];
      acc[year] = (acc[year] ?? 0) + 1;
      return acc;
    }, {});

  const renderBars = (data) => {
    const max = Math.max(...Object.values(data), 1);
    return Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([label, value]) => `
          <div class="bar-row">
            <span>${label}</span>
            <div class="bar"><div style="width:${(value / max) * 100}%"></div></div>
            <strong>${value}</strong>
          </div>
        `
      )
      .join("");
  };

  container.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><p>总设备</p><strong>${stats.total}</strong></div>
      <div class="stat-card"><p>使用中</p><strong>${stats.active}</strong></div>
      <div class="stat-card"><p>已失去</p><strong>${stats.deleted}</strong></div>
      <div class="stat-card"><p>分类数量</p><strong>${stats.categories.length}</strong></div>
    </div>
    <div class="chart-card">
      <h3>分类分布</h3>
      ${renderBars(categoryCounts)}
    </div>
    <div class="chart-card">
      <h3>入手年份</h3>
      ${Object.keys(yearCounts).length ? renderBars(yearCounts) : "<p class=\"empty\">暂无入手年份数据</p>"}
    </div>
  `;
};

const renderDetail = async () => {
  const container = document.querySelector("[data-device-detail]");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    container.innerHTML = "<p class=\"empty\">没有找到设备 ID</p>";
    return;
  }

  let device = devices.find((item) => String(item.id) === String(id));
  if (!device) {
    try {
      const response = await fetch(`/api/devices/${id}`);
      if (response.ok) device = await response.json();
    } catch {
      device = null;
    }
  }

  if (!device) {
    container.innerHTML = "<p class=\"empty\">设备不存在或已删除</p>";
    return;
  }

  const statusLabel = device.status === "deleted" ? "已失去" : "使用中";
  const image = device.imagePath
    ? `<div class="detail__image" style="background-image:url('${device.imagePath}')"></div>`
    : `<div class="detail__image detail__image--empty">No Image</div>`;
  const specs = device.specs?.length
    ? `<ul class="detail__specs">${device.specs.map((spec) => `<li>${spec}</li>`).join("")}</ul>`
    : "<p class=\"empty\">暂无规格信息</p>";

  const rows = [
    device.category ? `分类：${device.category}` : null,
    device.brand ? `品牌：${device.brand}` : null,
    device.parent ? `所属：${device.parent}` : null,
    device.acquired ? `入手：${device.acquired}` : null,
    device.lost ? `失去：${device.lost}` : null,
    device.acquiredLocation ? `地点：${device.acquiredLocation}` : null,
    device.lostLocation ? `失去地点：${device.lostLocation}` : null
  ].filter(Boolean);

  container.innerHTML = `
    <div class="detail">
      ${image}
      <div class="detail__content">
        <div class="detail__header">
          <div>
            <p class="card__tag">${device.category ?? "未分类"}</p>
            <h1>${device.name}</h1>
          </div>
          <span class="status ${device.status === "deleted" ? "status--warn" : ""}">${statusLabel}</span>
        </div>
        <div class="detail__meta">
          ${rows.length ? rows.map((row) => `<p>${row}</p>`).join("") : "<p class=\"empty\">暂无记录</p>"}
        </div>
        <div class="detail__section">
          <h3>规格</h3>
          ${specs}
        </div>
        <div class="detail__section">
          <h3>备注</h3>
          <p>${device.acquiredTip || device.lostTip || "暂无备注"}</p>
        </div>
      </div>
    </div>
  `;
};

const renderAdd = () => {
  const form = document.querySelector("[data-add-form]");
  if (!form) return;
  const preview = document.querySelector("[data-add-preview]");
  const output = document.querySelector("[data-add-output]");
  const copyButton = document.querySelector("[data-copy]");
  const statusEl = document.querySelector("[data-save-status]");
  const passwordInput = document.querySelector("[data-admin-password]");
  const uploadButton = document.querySelector("[data-upload-btn]");
  const uploadInput = document.querySelector("[data-image-file]");
  const uploadStatus = document.querySelector("[data-upload-status]");
  const imagePathInput = form.querySelector("[name=imagePath]");

  renderCategorySelects();

  if (passwordInput) {
    passwordInput.value = adminPassword;
    passwordInput.addEventListener("input", (event) => {
      adminPassword = event.target.value.trim();
      localStorage.setItem("adminPassword", adminPassword);
    });
  }

  if (uploadButton && uploadInput && uploadStatus && imagePathInput) {
    uploadButton.addEventListener("click", async () => {
      if (!uploadInput.files?.length) return;
      const formData = new FormData();
      formData.append("image", uploadInput.files[0]);
      uploadStatus.textContent = "上传中...";
      try {
        const response = await apiFetch("/api/uploads", { method: "POST", body: formData });
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("failed");
        const result = await response.json();
        imagePathInput.value = result.url;
        uploadStatus.textContent = "已上传";
        uploadInput.value = "";
        updatePreview();
      } catch (error) {
        uploadStatus.textContent = error.message === "unauthorized" ? "权限不足" : "上传失败";
      }
    });
  }

  const updatePreview = () => {
    const formData = new FormData(form);
    const specs = (formData.get("specs")?.toString() || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const device = {
      name: formData.get("name")?.toString().trim(),
      category: formData.get("category")?.toString().trim(),
      brand: formData.get("brand")?.toString().trim() || null,
      status: formData.get("status"),
      acquired: formData.get("acquired")?.toString().trim() || null,
      acquiredTip: formData.get("acquiredTip")?.toString().trim() || null,
      imagePath: formData.get("imagePath")?.toString().trim() || null,
      acquiredLocation: formData.get("acquiredLocation")?.toString().trim() || null,
      lost: formData.get("lost")?.toString().trim() || null,
      lostLocation: formData.get("lostLocation")?.toString().trim() || null,
      parent: formData.get("parent")?.toString().trim() || null,
      specs
    };

    if (!device.name) {
      if (preview) preview.innerHTML = "<p class=\"empty\">填写名称后会生成预览</p>";
      if (output) output.textContent = "";
      return;
    }

    const card = renderDeviceCard({
      ...device,
      id: device.name,
      category: device.category || "未分类",
      status: device.status === "deleted" ? "deleted" : "active",
      lostTip: null,
      acquiredTip: device.acquiredTip,
      specs: device.specs
    });

    if (preview) preview.innerHTML = card;
    if (output) output.textContent = JSON.stringify(device, null, 2);
  };

  form.addEventListener("input", updatePreview);
  updatePreview();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const specs = (formData.get("specs")?.toString() || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const payload = {
      name: formData.get("name")?.toString().trim(),
      category: formData.get("category")?.toString().trim() || null,
      brand: formData.get("brand")?.toString().trim() || null,
      status: formData.get("status"),
      acquired: formData.get("acquired")?.toString().trim() || null,
      acquiredTip: formData.get("acquiredTip")?.toString().trim() || null,
      imagePath: formData.get("imagePath")?.toString().trim() || null,
      acquiredLocation: formData.get("acquiredLocation")?.toString().trim() || null,
      lost: formData.get("lost")?.toString().trim() || null,
      lostLocation: formData.get("lostLocation")?.toString().trim() || null,
      parent: formData.get("parent")?.toString().trim() || null,
      specs
    };

    if (!payload.name) return;
    if (statusEl) statusEl.textContent = "正在保存...";

    try {
      const response = await apiFetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.status === 401) throw new Error("unauthorized");
      if (!response.ok) throw new Error("保存失败");
      if (statusEl) statusEl.textContent = "已保存到数据库";
      form.reset();
      updatePreview();
      await fetchCategories();
      renderCategorySelects();
      await fetchDevices();
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = error.message === "unauthorized" ? "权限不足，请输入管理密码" : "保存失败，请稍后重试";
      }
    }
  });

  if (copyButton && output) {
    copyButton.addEventListener("click", () => {
      if (!output.textContent) return;
      navigator.clipboard.writeText(output.textContent).catch(() => {});
      copyButton.textContent = "已复制";
      setTimeout(() => {
        copyButton.textContent = "复制 JSON";
      }, 1600);
    });
  }
};

const renderAdmin = () => {
  const listEl = document.querySelector("[data-admin-list]");
  if (!listEl) return;

  const form = document.querySelector("[data-admin-form]");
  const statusEl = document.querySelector("[data-admin-status]");
  const passwordInput = document.querySelector("[data-admin-password]");
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
  const bulkDelete = document.querySelector("[data-bulk-delete]");
  const exportBtn = document.querySelector("[data-export-json]");
  const importInput = document.querySelector("[data-import-json]");
  const importMode = document.querySelector("[data-import-mode]");

  renderCategorySelects();
  if (bulkCategory) {
    bulkCategory.innerHTML = [
      `<option value="__keep__">分类不变</option>`,
      `<option value="__uncat__">未分类</option>`,
      ...categories.map((name) => `<option value="${name}">${name}</option>`)
    ].join("");
  }

  if (passwordInput) {
    passwordInput.value = adminPassword;
    passwordInput.addEventListener("input", (event) => {
      adminPassword = event.target.value.trim();
      localStorage.setItem("adminPassword", adminPassword);
    });
  }

  if (uploadButton && uploadInput && uploadStatus && form) {
    const imagePathInput = form.querySelector("[name=imagePath]");
    uploadButton.addEventListener("click", async () => {
      if (!uploadInput.files?.length) return;
      const formData = new FormData();
      formData.append("image", uploadInput.files[0]);
      uploadStatus.textContent = "上传中...";
      try {
        const response = await apiFetch("/api/uploads", { method: "POST", body: formData });
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("failed");
        const result = await response.json();
        if (imagePathInput) imagePathInput.value = result.url;
        uploadStatus.textContent = "已上传";
        uploadInput.value = "";
      } catch (error) {
        uploadStatus.textContent = error.message === "unauthorized" ? "权限不足" : "上传失败";
      }
    });
  }

  const renderList = () => {
    listEl.innerHTML = devices
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
              <button class="button button--ghost" data-edit-id="${device.id}">编辑</button>
              <button class="button button--ghost" data-delete-id="${device.id}">删除</button>
            </div>
          </div>
        `
      )
      .join("");
  };

  const fillForm = (device) => {
    if (!form) return;
    form.dataset.editId = device?.id ? String(device.id) : "";
    form.querySelector("[name=name]").value = device?.name ?? "";
    form.querySelector("[name=category]").value = device?.category ?? "";
    form.querySelector("[name=status]").value = device?.status ?? "active";
    form.querySelector("[name=acquired]").value = device?.acquired ?? "";
    form.querySelector("[name=lost]").value = device?.lost ?? "";
    form.querySelector("[name=imagePath]").value = device?.imagePath ?? "";
    form.querySelector("[name=brand]").value = device?.brand ?? "";
    form.querySelector("[name=acquiredTip]").value = device?.acquiredTip ?? "";
    form.querySelector("[name=lostTip]").value = device?.lostTip ?? "";
    form.querySelector("[name=acquiredLocation]").value = device?.acquiredLocation ?? "";
    form.querySelector("[name=lostLocation]").value = device?.lostLocation ?? "";
    form.querySelector("[name=parent]").value = device?.parent ?? "";
    form.querySelector("[name=specs]").value = (device?.specs ?? []).join("\n");
  };

  renderList();

  const updateSelectedCount = () => {
    if (!selectedCount) return;
    const count = listEl.querySelectorAll("[data-select-id]:checked").length;
    selectedCount.textContent = `已选 ${count}`;
  };

  listEl.addEventListener("change", (event) => {
    if (event.target.matches("[data-select-id]")) {
      updateSelectedCount();
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
  updateSelectedCount();

  listEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target.matches("[data-edit-id]")) {
      const device = devices.find((item) => String(item.id) === target.dataset.editId);
      fillForm(device);
      if (statusEl) statusEl.textContent = "正在编辑";
    }
    if (target.matches("[data-delete-id]")) {
      const id = target.dataset.deleteId;
      if (!id) return;
      if (!confirm("确定删除该设备吗？")) return;
      apiFetch(`/api/devices/${id}`, { method: "DELETE" })
        .then((res) => {
          if (res.status === 401) throw new Error("unauthorized");
          if (!res.ok) throw new Error("删除失败");
          return fetchDevices();
        })
        .then(() => {
          renderList();
          if (statusEl) statusEl.textContent = "已删除";
        })
        .catch((error) => {
          if (statusEl) {
            statusEl.textContent = error.message === "unauthorized" ? "权限不足" : "删除失败";
          }
        });
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      fillForm(null);
      if (statusEl) statusEl.textContent = "新建设备";
    });
  }

  if (addCategoryBtn && newCategoryInput) {
    addCategoryBtn.addEventListener("click", async () => {
      const name = newCategoryInput.value.trim();
      if (!name) return;
      try {
        const response = await apiFetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("failed");
        categories = await response.json();
        renderCategorySelects(name);
        if (bulkCategory) {
          bulkCategory.innerHTML = [
            `<option value="__keep__">分类不变</option>`,
            `<option value="__uncat__">未分类</option>`,
            ...categories.map((cat) => `<option value="${cat}">${cat}</option>`)
          ].join("");
          bulkCategory.value = name;
        }
        newCategoryInput.value = "";
        if (statusEl) statusEl.textContent = "已添加分类";
      } catch (error) {
        if (statusEl) {
          statusEl.textContent = error.message === "unauthorized" ? "权限不足" : "添加分类失败";
        }
      }
    });
  }

  const getSelectedIds = () =>
    Array.from(listEl.querySelectorAll("[data-select-id]:checked")).map((input) => input.dataset.selectId);

  if (bulkApply) {
    bulkApply.addEventListener("click", async () => {
      const ids = getSelectedIds();
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
        const response = await apiFetch("/api/devices/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, changes })
        });
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("failed");
        await fetchCategories();
        renderCategorySelects();
        await fetchDevices();
        renderList();
        if (statusEl) statusEl.textContent = "批量更新完成";
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message === "unauthorized" ? "权限不足" : "批量更新失败";
      }
    });
  }

  if (bulkDelete) {
    bulkDelete.addEventListener("click", async () => {
      const ids = getSelectedIds();
      if (ids.length === 0) return;
      if (!confirm("确定批量删除这些设备吗？")) return;
      try {
        const response = await apiFetch("/api/devices/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids })
        });
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("failed");
        await fetchDevices();
        renderList();
        if (statusEl) statusEl.textContent = "批量删除完成";
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message === "unauthorized" ? "权限不足" : "批量删除失败";
      }
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      try {
        const response = await apiFetch("/api/export");
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("failed");
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "devices-export.json";
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message === "unauthorized" ? "权限不足" : "导出失败";
      }
    });
  }

  if (importInput) {
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const mode = importMode?.value || "append";
      if (mode === "replace" && !confirm("覆盖导入会清空当前数据，是否继续？")) {
        importInput.value = "";
        return;
      }
      try {
        const text = await file.text();
        const items = JSON.parse(text);
        const response = await apiFetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, items })
        });
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("failed");
        await fetchCategories();
        renderCategorySelects();
        await fetchDevices();
        renderList();
        const result = await response.json();
        if (statusEl) statusEl.textContent = `导入完成（${result.inserted ?? 0} 条，跳过 ${result.skipped ?? 0} 条）`;
      } catch (error) {
        if (statusEl) statusEl.textContent = error.message === "unauthorized" ? "权限不足" : "导入失败";
      } finally {
        importInput.value = "";
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const specs = (formData.get("specs")?.toString() || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const payload = {
        name: formData.get("name")?.toString().trim(),
        category: formData.get("category")?.toString().trim() || null,
        brand: formData.get("brand")?.toString().trim() || null,
        status: formData.get("status"),
        acquired: formData.get("acquired")?.toString().trim() || null,
        lost: formData.get("lost")?.toString().trim() || null,
        imagePath: formData.get("imagePath")?.toString().trim() || null,
        acquiredTip: formData.get("acquiredTip")?.toString().trim() || null,
        lostTip: formData.get("lostTip")?.toString().trim() || null,
        acquiredLocation: formData.get("acquiredLocation")?.toString().trim() || null,
        lostLocation: formData.get("lostLocation")?.toString().trim() || null,
        parent: formData.get("parent")?.toString().trim() || null,
        specs
      };

      if (!payload.name) {
        if (statusEl) statusEl.textContent = "请填写名称";
        return;
      }

      const editId = form.dataset.editId;
      try {
        const response = await apiFetch(editId ? `/api/devices/${editId}` : "/api/devices", {
          method: editId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("保存失败");
        await fetchDevices();
        renderList();
        if (statusEl) statusEl.textContent = editId ? "已更新" : "已创建";
      } catch (error) {
        if (statusEl) {
          statusEl.textContent = error.message === "unauthorized" ? "权限不足" : "保存失败";
        }
      }
    });
  }
};

const initAuthFields = () => {
  const inputs = document.querySelectorAll("[data-admin-password]");
  inputs.forEach((input) => {
    if (!input) return;
    input.value = adminPassword;
    input.addEventListener("input", (event) => {
      adminPassword = event.target.value.trim();
      localStorage.setItem("adminPassword", adminPassword);
    });
  });

  const authNote = document.querySelector("[data-auth-note]");
  if (authNote) {
    authNote.textContent = authRequired
      ? "当前启用了管理密码，请输入后再保存。"
      : "未启用管理密码。";
  }
};

const init = async () => {
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
  renderAdd();
  renderDetail();
  renderAdmin();
};

document.addEventListener("DOMContentLoaded", () => {
  init();
});
