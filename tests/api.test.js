import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";

const ADMIN_PASSWORD = "integration-test-password";

const request = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const type = response.headers.get("content-type") || "";
  const body = type.includes("json") ? await response.json() : await response.text();
  return { response, body };
};

test("API, authentication, transactions and static isolation", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "things-terminal-test-"));
  const { app, db } = await createApp({
    environment: "test",
    adminPassword: ADMIN_PASSWORD,
    dbPath: path.join(tempDir, "devices.sqlite"),
    seedDbPath: path.join(tempDir, "missing-seed.sqlite"),
    uploadDir: path.join(tempDir, "uploads"),
    logLevel: "error"
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const health = await request(baseUrl, "/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, "ok");

  const source = await request(baseUrl, "/server.js");
  assert.equal(source.response.status, 404);
  const index = await request(baseUrl, "/index.html");
  assert.equal(index.response.status, 200);
  assert.match(index.body, /\/vendor\/98\.css/);

  const unauthorized = await request(baseUrl, "/api/devices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "blocked" })
  });
  assert.equal(unauthorized.response.status, 401);

  const headers = { "content-type": "application/json", "x-admin-password": ADMIN_PASSWORD };
  const parent = await request(baseUrl, "/api/devices", {
    method: "POST", headers,
    body: JSON.stringify({ name: "Parent", category: "Test", tags: ["collection"] })
  });
  assert.equal(parent.response.status, 201);
  const child = await request(baseUrl, "/api/devices", {
    method: "POST", headers,
    body: JSON.stringify({ name: "<img src=x onerror=alert(1)>", parentId: parent.body.id, buyPrice: 10, buyCurrency: "GBP" })
  });
  assert.equal(child.response.status, 201);
  assert.equal(child.body.parent, "Parent");

  const cycle = await request(baseUrl, `/api/devices/${parent.body.id}`, {
    method: "PUT", headers,
    body: JSON.stringify({ parentId: child.body.id })
  });
  assert.equal(cycle.response.status, 400);

  const bulk = await request(baseUrl, "/api/devices/bulk-update", {
    method: "POST", headers,
    body: JSON.stringify({ ids: [child.body.id], changes: { category: null, status: "deleted", brand: "Security Test" } })
  });
  assert.equal(bulk.response.status, 200);
  const bulkResult = await request(baseUrl, `/api/devices/${child.body.id}`);
  assert.equal(bulkResult.body.category, null);
  assert.equal(bulkResult.body.status, "deleted");
  assert.equal(bulkResult.body.brand, "Security Test");

  const renamed = await request(baseUrl, "/api/categories/Test", {
    method: "PUT", headers,
    body: JSON.stringify({ name: "Renamed" })
  });
  assert.equal(renamed.response.status, 200);
  assert.equal((await request(baseUrl, `/api/devices/${parent.body.id}`)).body.category, "Renamed");

  const malformed = await fetch(`${baseUrl}/api/devices`, {
    method: "POST", headers,
    body: "{"
  });
  assert.equal(malformed.status, 400);

  const before = (await request(baseUrl, "/api/devices")).body.length;
  const brokenImport = await request(baseUrl, "/api/import", {
    method: "POST", headers,
    body: JSON.stringify({ mode: "append", items: [{ name: "rolled back" }, { name: "bad", status: "invalid" }] })
  });
  assert.equal(brokenImport.response.status, 400);
  const after = (await request(baseUrl, "/api/devices")).body.length;
  assert.equal(after, before);

  const settings = await request(baseUrl, "/api/settings", {
    method: "PUT", headers,
    body: JSON.stringify({ baseCurrency: "GBP", fxSource: "Test rates", fxUpdatedAt: "2026-08-10" })
  });
  assert.equal(settings.response.status, 200);
  assert.equal(settings.body.baseCurrency, "GBP");

  const exported = await request(baseUrl, "/api/export", { headers: { "x-admin-password": ADMIN_PASSWORD } });
  assert.equal(exported.body.schemaVersion, 2);
  assert.equal(exported.body.items.length, before);
  const csv = await request(baseUrl, "/api/export?format=csv", { headers: { "x-admin-password": ADMIN_PASSWORD } });
  assert.equal(csv.response.status, 200);
  assert.match(csv.body, /schemaVersion,id,name/);
  const filtered = await request(baseUrl, "/api/export?status=deleted", { headers: { "x-admin-password": ADMIN_PASSWORD } });
  assert.equal(filtered.body.items.length, 1);

  const restored = await request(baseUrl, "/api/import", {
    method: "POST", headers,
    body: JSON.stringify({ ...exported.body, mode: "replace" })
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.inserted, before);
  assert.equal((await request(baseUrl, "/api/devices")).body.length, before);

  const invalidImage = new FormData();
  invalidImage.append("image", new Blob(["not an image"], { type: "image/png" }), "fake.png");
  const upload = await fetch(`${baseUrl}/api/uploads`, {
    method: "POST",
    headers: { "x-admin-password": ADMIN_PASSWORD },
    body: invalidImage
  });
  assert.equal(upload.status, 400);

  const validImage = new FormData();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  validImage.append("image", new Blob([png], { type: "image/png" }), "pixel.png");
  const uploaded = await fetch(`${baseUrl}/api/uploads`, {
    method: "POST",
    headers: { "x-admin-password": ADMIN_PASSWORD },
    body: validImage
  });
  assert.equal(uploaded.status, 201);
  const uploadBody = await uploaded.json();
  assert.match(uploadBody.url, /^\/uploads\/.+\.webp$/);
  const cleanup = await request(baseUrl, "/api/uploads/cleanup", { method: "POST", headers });
  assert.equal(cleanup.response.status, 200);
  assert.equal(cleanup.body.count, 2);
});
