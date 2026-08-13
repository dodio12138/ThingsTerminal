export const DEVICE_STATUSES = Object.freeze(["active", "deleted"]);
export const CURRENCIES = Object.freeze(["CNY", "USD", "GBP", "EUR", "HKD", "JPY"]);
export const EXPORT_SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS = Object.freeze({
  baseCurrency: "CNY",
  fxRates: Object.freeze({
    CNY: 1,
    USD: 7.2,
    GBP: 9.2,
    EUR: 7.8,
    HKD: 0.92,
    JPY: 0.048
  }),
  fxSource: "内置离线估算值",
  fxUpdatedAt: "2026-08-10"
});

export const CURRENCY_SYMBOLS = Object.freeze({
  CNY: "￥",
  USD: "$",
  GBP: "£",
  EUR: "€",
  HKD: "HK$",
  JPY: "¥"
});
