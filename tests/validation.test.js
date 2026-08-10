import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../server/errors.js";
import { validateDevicePayload, validateIds, validateSettings } from "../server/validation.js";

test("normalizes a valid device payload", () => {
  const device = validateDevicePayload({
    name: " Camera ",
    status: "active",
    acquired: "2026-08",
    buyPrice: "25.50",
    buyCurrency: "gbp",
    specs: "One\nTwo\nOne",
    tags: ["portable", "portable"]
  });
  assert.equal(device.name, "Camera");
  assert.equal(device.buyPrice, 25.5);
  assert.equal(device.buyCurrency, "GBP");
  assert.deepEqual(device.specs, ["One", "Two"]);
  assert.deepEqual(device.tags, ["portable"]);
});

test("rejects invalid state and identifiers", () => {
  assert.throws(() => validateDevicePayload({ name: "x", status: "archived" }), AppError);
  assert.throws(() => validateDevicePayload({ name: "x", acquired: "2026-02-31" }), AppError);
  assert.throws(() => validateDevicePayload({ name: "x", acquired: "2026-08", lost: "2026-07" }), AppError);
  assert.throws(() => validateDevicePayload({ name: "x", buyPrice: 10, buyCurrency: "BTC" }), AppError);
  assert.throws(() => validateIds([1, "../../etc/passwd"]), AppError);
});

test("requires complete positive exchange rates", () => {
  assert.throws(() => validateSettings({ fxRates: { GBP: -1 } }), AppError);
});
