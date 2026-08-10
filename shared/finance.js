import { CURRENCIES, CURRENCY_SYMBOLS } from "./constants.js";

export const normalizeCurrency = (value, fallback = "CNY") => {
  const raw = String(value ?? "").trim().toUpperCase();
  const aliases = { RMB: "CNY", "¥": "CNY", "￥": "CNY", "$": "USD", "£": "GBP", "€": "EUR" };
  const normalized = aliases[raw] || raw;
  return CURRENCIES.includes(normalized) ? normalized : fallback;
};

export const parsePrice = (value, fallbackCurrency = "CNY") => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return { amount: value, currency: fallbackCurrency };
  }
  const text = String(value).trim();
  const amountMatch = text.match(/(\d[\d,.]*)/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const currencyMatch = text.match(/\b(CNY|RMB|USD|GBP|EUR|HKD|JPY)\b/i) || text.match(/[¥￥$£€]/);
  return {
    amount,
    currency: normalizeCurrency(currencyMatch?.[0], fallbackCurrency)
  };
};

export const resolvePrice = (amountValue, currencyValue, fallbackText) => {
  const parsed = amountValue !== null && amountValue !== undefined && amountValue !== ""
    ? parsePrice(amountValue, normalizeCurrency(currencyValue))
    : parsePrice(fallbackText, normalizeCurrency(currencyValue));
  if (!parsed) return { amount: null, currency: null };
  return { amount: parsed.amount, currency: normalizeCurrency(currencyValue, parsed.currency) };
};

export const convertAmount = (amount, fromCurrency, settings) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return null;
  const source = normalizeCurrency(fromCurrency);
  const base = normalizeCurrency(settings?.baseCurrency);
  const rates = settings?.fxRates || {};
  const sourceRate = Number(rates[source]);
  const baseRate = Number(rates[base]);
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(baseRate) || baseRate <= 0) return null;
  return numeric * sourceRate / baseRate;
};

export const formatMoney = (amount, currency = "CNY") => {
  const normalized = normalizeCurrency(currency);
  const symbol = CURRENCY_SYMBOLS[normalized] || normalized;
  return `${symbol}${Number(amount).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};
