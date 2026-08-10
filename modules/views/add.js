import { store, setAdminPassword } from "../store.js";
import { uploadImage, createDevice, fetchDevices, fetchCategories } from "../api.js";
import { renderCategorySelects, renderDeviceCard, renderParentSelects } from "./shared.js";

const formPayload = (form) => {
  const data = new FormData(form);
  const value = (name) => data.get(name)?.toString().trim() || null;
  return {
    name: value("name"), category: value("category"), brand: value("brand"), status: value("status"),
    imagePath: value("imagePath"), acquired: value("acquired"), lost: value("lost"),
    buyPrice: value("buyPrice"), buyCurrency: value("buyCurrency") || "CNY",
    sellPrice: value("sellPrice"), sellCurrency: value("sellCurrency") || "CNY",
    acquiredTip: value("acquiredTip"), acquiredLocation: value("acquiredLocation"), lostLocation: value("lostLocation"),
    parentId: value("parentId"), warrantyUntil: value("warrantyUntil"),
    tags: String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    specs: String(data.get("specs") || "")
  };
};

export const initAuthFields = () => {
  document.querySelectorAll("[data-admin-password]").forEach((input) => {
    input.value = store.adminPassword;
    input.addEventListener("input", (event) => setAdminPassword(event.target.value.trim()));
  });
  document.querySelectorAll("[data-auth-note]").forEach((note) => {
    note.textContent = store.authRequired ? "当前启用了管理密码，请输入后再保存。" : "未启用管理密码。";
  });
};

export const initAddPage = () => {
  const form = document.querySelector("[data-add-form]");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "true";
  const preview = document.querySelector("[data-add-preview]");
  const output = document.querySelector("[data-add-output]");
  const copy = document.querySelector("[data-copy]");
  const status = document.querySelector("[data-save-status]");
  const upload = document.querySelector("[data-upload-btn]");
  const uploadInput = document.querySelector("[data-image-file]");
  const uploadStatus = document.querySelector("[data-upload-status]");
  const imagePath = form.querySelector("[name=imagePath]");
  renderCategorySelects();
  renderParentSelects();

  const updatePreview = () => {
    const device = formPayload(form);
    if (!device.name) {
      preview.innerHTML = `<p class="empty">填写名称后会生成预览</p>`;
      output.textContent = "";
      return;
    }
    const parent = store.devices.find((item) => String(item.id) === String(device.parentId));
    preview.innerHTML = renderDeviceCard({ ...device, id: 0, parent: parent?.name || null, specs: [] });
    output.textContent = JSON.stringify(device, null, 2);
  };
  form.addEventListener("input", updatePreview);
  updatePreview();

  upload?.addEventListener("click", async () => {
    if (!uploadInput.files?.length) return;
    uploadStatus.textContent = "上传中...";
    try {
      const result = await uploadImage(uploadInput.files[0]);
      imagePath.value = result.url;
      uploadInput.value = "";
      uploadStatus.textContent = "已上传并生成缩略图";
      updatePreview();
    } catch (error) {
      uploadStatus.textContent = error.message || "上传失败";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formPayload(form);
    if (!payload.name) return;
    status.textContent = "正在保存...";
    try {
      await createDevice(payload);
      status.textContent = "已保存到数据库";
      form.reset();
      await Promise.all([fetchCategories(), fetchDevices()]);
      renderCategorySelects();
      renderParentSelects();
      updatePreview();
    } catch (error) {
      status.textContent = error.message || "保存失败";
    }
  });

  copy?.addEventListener("click", () => {
    if (!output.textContent) return;
    navigator.clipboard.writeText(output.textContent).catch(() => {});
    copy.textContent = "已复制";
    setTimeout(() => { copy.textContent = "复制 JSON"; }, 1600);
  });
};
