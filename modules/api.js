// @ts-check

import { store } from "./store.js";
import { normalizeSpecs } from "./schema.js";

const parseError = async (response) => {
  try {
    const data = await response.json();
    if (data?.error) return data.error;
  } catch {
    return "请求失败";
  }
  return "请求失败";
};

export const apiFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (store.adminPassword) {
    headers.set("x-admin-password", store.adminPassword);
  }
  return fetch(url, { ...options, headers });
};

export const fetchMeta = async () => {
  try {
    const response = await fetch("/api/meta");
    if (response.ok) {
      const meta = await response.json();
      store.authRequired = Boolean(meta.authRequired);
    }
  } catch {
    store.authRequired = false;
  }
};

export const fetchDevices = async () => {
  const response = await fetch("/api/devices");
  if (!response.ok) throw new Error("加载设备失败");
  store.devices = await response.json();
};

export const fetchCategories = async () => {
  try {
    const response = await fetch("/api/categories");
    if (!response.ok) return;
    store.categories = await response.json();
  } catch {
    store.categories = [];
  }
};

export const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append("image", file);
  const response = await apiFetch("/api/uploads", { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const createCategory = async (name) => {
  const response = await apiFetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error(await parseError(response));
  store.categories = await response.json();
  return store.categories;
};

export const createDevice = async (payload) => {
  const response = await apiFetch("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, specs: normalizeSpecs(payload.specs) })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
};

export const updateDevice = async (id, payload) => {
  const response = await apiFetch(`/api/devices/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, specs: normalizeSpecs(payload.specs) })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
};

export const deleteDevice = async (id) => {
  const response = await apiFetch(`/api/devices/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await parseError(response));
};

export const bulkUpdate = async (ids, changes) => {
  const response = await apiFetch("/api/devices/bulk-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, changes })
  });
  if (!response.ok) throw new Error(await parseError(response));
};

export const bulkDelete = async (ids) => {
  const response = await apiFetch("/api/devices/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids })
  });
  if (!response.ok) throw new Error(await parseError(response));
};

export const exportDevices = async () => {
  const response = await apiFetch("/api/export");
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
};

export const importDevices = async (mode, items) => {
  const response = await apiFetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, items })
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
};
