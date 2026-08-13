import { AppError } from "./errors.js";
import { CURRENCIES, DEVICE_STATUSES, DEFAULT_SETTINGS } from "../shared/constants.js";
import { resolvePrice } from "../shared/finance.js";

const MAX_DEVICE_NAME = 160;
const MAX_SHORT_TEXT = 240;
const MAX_NOTE = 4000;
const MAX_SPECS = 100;
const MAX_TAGS = 30;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const cleanString = (value, field, maxLength, { nullable = true } = {}) => {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    throw new AppError(400, "VALIDATION_ERROR", `${field} is required`);
  }
  const text = String(value).trim();
  if (!text && !nullable) throw new AppError(400, "VALIDATION_ERROR", `${field} is required`);
  if (text.length > maxLength) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} exceeds ${maxLength} characters`);
  }
  return text || null;
};

const cleanDate = (value, field) => {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(text)) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must use YYYY-MM or YYYY-MM-DD`);
  }
  if (text.length === 10) {
    const parsed = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      throw new AppError(400, "VALIDATION_ERROR", `${field} is not a valid date`);
    }
  }
  return text;
};

const cleanCurrency = (value, field) => {
  const raw = String(value ?? "").trim().toUpperCase();
  const aliases = { RMB: "CNY", "¥": "CNY", "￥": "CNY", "$": "USD", "£": "GBP", "€": "EUR" };
  const normalized = aliases[raw] || raw;
  if (!CURRENCIES.includes(normalized)) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} is not a supported currency`);
  }
  return normalized;
};

const cleanNumber = (value, field) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000_000) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a non-negative number`);
  }
  return number;
};

const cleanList = (value, field, maxItems, maxItemLength = 500) => {
  if (value === null || value === undefined || value === "") return [];
  const items = Array.isArray(value) ? value : String(value).split("\n");
  const cleaned = [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
  if (cleaned.length > maxItems || cleaned.some((item) => item.length > maxItemLength)) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} contains too many or overly long values`);
  }
  return cleaned;
};

export const validateId = (value, field = "id") => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a positive integer`);
  }
  return id;
};

export const validateIds = (value) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new AppError(400, "VALIDATION_ERROR", "ids must contain between 1 and 500 entries");
  }
  return [...new Set(value.map((id) => validateId(id)))];
};

export const validateCategoryName = (value) => cleanString(value, "category name", 100, { nullable: false });

export const validateDevicePayload = (payload, existing = null) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError(400, "VALIDATION_ERROR", "device payload must be an object");
  }
  const choose = (field, cleaner) => hasOwn(payload, field) ? cleaner(payload[field], field) : existing?.[field] ?? null;
  const name = choose("name", (value) => cleanString(value, "name", MAX_DEVICE_NAME, { nullable: false }));
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "name is required");

  const status = hasOwn(payload, "status") ? String(payload.status) : existing?.status || "active";
  if (!DEVICE_STATUSES.includes(status)) {
    throw new AppError(400, "VALIDATION_ERROR", `status must be one of ${DEVICE_STATUSES.join(", ")}`);
  }

  const acquiredTip = choose("acquiredTip", (value) => cleanString(value, "acquiredTip", MAX_NOTE));
  const lostTip = choose("lostTip", (value) => cleanString(value, "lostTip", MAX_NOTE));
  const rawBuyPrice = hasOwn(payload, "buyPrice") ? cleanNumber(payload.buyPrice, "buyPrice") : existing?.buyPrice ?? null;
  const rawSellPrice = hasOwn(payload, "sellPrice") ? cleanNumber(payload.sellPrice, "sellPrice") : existing?.sellPrice ?? null;
  const rawBuyCurrency = hasOwn(payload, "buyCurrency") && payload.buyCurrency !== null && payload.buyCurrency !== ""
    ? cleanCurrency(payload.buyCurrency, "buyCurrency")
    : existing?.buyCurrency || "CNY";
  const rawSellCurrency = hasOwn(payload, "sellCurrency") && payload.sellCurrency !== null && payload.sellCurrency !== ""
    ? cleanCurrency(payload.sellCurrency, "sellCurrency")
    : existing?.sellCurrency || "CNY";
  const buy = resolvePrice(rawBuyPrice, rawBuyCurrency, acquiredTip);
  const sell = resolvePrice(rawSellPrice, rawSellCurrency, lostTip);

  const parentId = hasOwn(payload, "parentId") && payload.parentId !== null && payload.parentId !== ""
    ? validateId(payload.parentId, "parentId")
    : hasOwn(payload, "parentId") ? null : existing?.parentId ?? null;

  const imagePath = choose("imagePath", (value) => {
    const text = cleanString(value, "imagePath", 500);
    const isRootRelative = text?.startsWith("/") && !text.includes("..");
    const isLegacyAsset = text?.startsWith("../res/items_pic/") && !text.slice(3).includes("..");
    if (text && ((!isRootRelative && !isLegacyAsset) || /[\r\n'"\\]/.test(text))) {
      throw new AppError(400, "VALIDATION_ERROR", "imagePath must be a safe root-relative path");
    }
    return text;
  });

  const acquired = choose("acquired", cleanDate);
  const lost = choose("lost", cleanDate);
  if (acquired && lost && lost < acquired) {
    throw new AppError(400, "VALIDATION_ERROR", "lost date cannot be earlier than acquired date");
  }

  return {
    name,
    category: choose("category", (value) => cleanString(value, "category", 100)),
    brand: choose("brand", (value) => cleanString(value, "brand", 100)),
    status,
    imagePath,
    acquired,
    lost,
    acquiredTip,
    lostTip,
    acquiredLocation: choose("acquiredLocation", (value) => cleanString(value, "acquiredLocation", MAX_SHORT_TEXT)),
    lostLocation: choose("lostLocation", (value) => cleanString(value, "lostLocation", MAX_SHORT_TEXT)),
    parentId,
    specs: hasOwn(payload, "specs") ? cleanList(payload.specs, "specs", MAX_SPECS) : existing?.specs || [],
    tags: hasOwn(payload, "tags") ? cleanList(payload.tags, "tags", MAX_TAGS, 80) : existing?.tags || [],
    warrantyUntil: choose("warrantyUntil", cleanDate),
    buyPrice: buy.amount,
    sellPrice: sell.amount,
    buyCurrency: buy.amount === null ? null : buy.currency,
    sellCurrency: sell.amount === null ? null : sell.currency
  };
};

export const validateBulkChanges = (changes) => {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new AppError(400, "VALIDATION_ERROR", "changes must be an object");
  }
  const result = {};
  if (hasOwn(changes, "category") && changes.category !== null) {
    result.category = changes.category === "" ? null : cleanString(changes.category, "category", 100);
  }
  if (hasOwn(changes, "brand") && changes.brand !== null) {
    result.brand = changes.brand === "" ? null : cleanString(changes.brand, "brand", 100);
  }
  if (hasOwn(changes, "status") && changes.status !== null && changes.status !== "") {
    if (!DEVICE_STATUSES.includes(changes.status)) throw new AppError(400, "VALIDATION_ERROR", "invalid status");
    result.status = changes.status;
  }
  if (Object.keys(result).length === 0) throw new AppError(400, "VALIDATION_ERROR", "no supported changes supplied");
  return result;
};

export const validateSettings = (payload, existing = DEFAULT_SETTINGS) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError(400, "VALIDATION_ERROR", "settings payload must be an object");
  }
  const baseCurrency = cleanCurrency(payload.baseCurrency ?? existing.baseCurrency, "baseCurrency");
  const fxRates = { ...existing.fxRates };
  if (payload.fxRates !== undefined) {
    if (!payload.fxRates || typeof payload.fxRates !== "object" || Array.isArray(payload.fxRates)) {
      throw new AppError(400, "VALIDATION_ERROR", "fxRates must be an object");
    }
    for (const currency of CURRENCIES) {
      const rate = Number(payload.fxRates[currency] ?? fxRates[currency]);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) {
        throw new AppError(400, "VALIDATION_ERROR", `invalid rate for ${currency}`);
      }
      fxRates[currency] = rate;
    }
  }
  return {
    baseCurrency,
    fxRates,
    fxSource: cleanString(payload.fxSource ?? existing.fxSource, "fxSource", 200, { nullable: false }),
    fxUpdatedAt: cleanDate(payload.fxUpdatedAt ?? existing.fxUpdatedAt, "fxUpdatedAt")
  };
};

export const supportedCurrencies = CURRENCIES;
