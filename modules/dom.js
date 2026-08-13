export const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

export const safeImageUrl = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.includes("..") || /['"()\\\r\n]/.test(raw)) return null;
  return encodeURI(raw);
};

export const thumbnailUrl = (value) => {
  const safe = safeImageUrl(value);
  return safe?.startsWith("/uploads/") && safe.endsWith(".webp")
    ? safe.replace(/\.webp$/, "-thumb.webp")
    : safe;
};

export const deviceDetailUrl = (id) => {
  const current = `${window.location.pathname}${window.location.search}`;
  return `device.html?id=${encodeURIComponent(id)}&return=${encodeURIComponent(current)}`;
};

export const readPreference = (key, fallback) => {
  try {
    return localStorage.getItem(`things-terminal:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
};

export const writePreference = (key, value) => {
  try {
    localStorage.setItem(`things-terminal:${key}`, String(value));
  } catch {
    // Preferences are optional when storage is unavailable.
  }
};
