import test from "node:test";
import assert from "node:assert/strict";
import { convertAmount, formatMoney, normalizeCurrency, parsePrice } from "../shared/finance.js";
import { DEFAULT_SETTINGS } from "../shared/constants.js";

test("normalizes supported currency aliases", () => {
  assert.equal(normalizeCurrency("£"), "GBP");
  assert.equal(normalizeCurrency("rmb"), "CNY");
  assert.equal(normalizeCurrency("unknown"), "CNY");
});

test("parses legacy price text into structured values", () => {
  assert.deepEqual(parsePrice("Bought second-hand for £1,250"), { amount: 1250, currency: "GBP" });
  assert.equal(parsePrice("gift"), null);
});

test("converts through the configured base currency", () => {
  assert.equal(convertAmount(10, "GBP", DEFAULT_SETTINGS), 92);
  const usdSettings = { ...DEFAULT_SETTINGS, baseCurrency: "USD" };
  assert.equal(convertAmount(7.2, "CNY", usdSettings), 1);
  assert.equal(formatMoney(12.5, "GBP"), "£12.50");
});
