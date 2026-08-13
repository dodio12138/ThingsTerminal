import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { createConfig } from "./config.js";
import { AppError, asyncHandler } from "./errors.js";
import {
  getDevice,
  getSettings,
  initializeDatabase,
  insertDevice,
  listDevices,
  saveSettings,
  updateDeviceRow,
  withTransaction
} from "./database.js";
import {
  validateBulkChanges,
  validateCategoryName,
  validateDevicePayload,
  validateId,
  validateIds,
  validateSettings
} from "./validation.js";
import { devicesToCsv } from "./csv.js";
import { cleanupOrphanUploads, deleteUploadPair, processImage } from "./uploads.js";
import { createLogger } from "./logger.js";
import { DEVICE_STATUSES, EXPORT_SCHEMA_VERSION } from "../shared/constants.js";

const HTML_PAGES = new Set(["index.html", "browse.html", "add.html", "stats.html", "device.html", "admin.html"]);
const VENDOR_ASSETS = new Set(["98.css", "ms_sans_serif.woff", "ms_sans_serif.woff2", "ms_sans_serif_bold.woff", "ms_sans_serif_bold.woff2"]);

const passwordMatches = (candidate, expected) => {
  const left = crypto.createHash("sha256").update(String(candidate || "")).digest();
  const right = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(left, right);
};

const ensureParentIsValid = async (db, deviceId, parentId) => {
  if (!parentId) return;
  if (deviceId && parentId === deviceId) throw new AppError(400, "INVALID_PARENT", "设备不能属于自身");
  let current = parentId;
  const visited = new Set();
  while (current) {
    if (visited.has(current) || (deviceId && current === deviceId)) {
      throw new AppError(400, "INVALID_PARENT", "父级关系不能形成循环");
    }
    visited.add(current);
    const row = await db.get("SELECT parentId FROM devices WHERE id = ?", current);
    if (!row) throw new AppError(400, "INVALID_PARENT", "父级设备不存在");
    current = row.parentId;
  }
};

const ensureCategory = async (db, category) => {
  if (category) await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", category);
};

const deleteImageIfUnused = async (db, imagePath, uploadDir) => {
  if (!imagePath?.startsWith("/uploads/")) return;
  const row = await db.get("SELECT COUNT(*) AS count FROM devices WHERE imagePath = ?", imagePath);
  if (row.count === 0) await deleteUploadPair(imagePath, uploadDir);
};

const sendUpload = (upload, req, res) => new Promise((resolve, reject) => {
  upload.single("image")(req, res, (error) => {
    if (!error) return resolve();
    if (error.code === "LIMIT_FILE_SIZE") return reject(new AppError(400, "UPLOAD_TOO_LARGE", "文件过大（最大 5MB）"));
    return reject(new AppError(400, "UPLOAD_ERROR", error.message || "上传失败"));
  });
});

const normalizeExportItems = (payload) => {
  const items = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 5000) {
    throw new AppError(400, "VALIDATION_ERROR", "导入内容必须包含 1 到 5000 条设备");
  }
  return items;
};

const statusFilter = (value) => {
  if (!value) return null;
  const status = String(value);
  if (!DEVICE_STATUSES.includes(status)) throw new AppError(400, "VALIDATION_ERROR", "invalid status filter");
  return status;
};

export const createApp = async (overrides = {}) => {
  const config = createConfig(overrides);
  const logger = createLogger(config.logLevel);
  const db = overrides.db || await initializeDatabase(config);
  const app = express();

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginResourcePolicy: { policy: "same-origin" }
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const requestPath = req.path;
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    res.on("finish", () => logger.info("http_request", {
      requestId,
      method: req.method,
      path: requestPath,
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    }));
    next();
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.environment === "test" ? 10_000 : 300,
    standardHeaders: "draft-8",
    legacyHeaders: false
  });
  app.use("/api", apiLimiter);

  const requireAdmin = (req, _res, next) => {
    if (!config.adminPassword) return next();
    if (passwordMatches(req.header("x-admin-password"), config.adminPassword)) return next();
    return next(new AppError(401, "UNAUTHORIZED", "管理密码错误"));
  };

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
  });

  app.get("/health", asyncHandler(async (_req, res) => {
    const result = await db.get("SELECT 1 AS ok");
    res.json({ status: result?.ok === 1 ? "ok" : "degraded", database: "connected" });
  }));

  app.get("/api/meta", (_req, res) => {
    res.json({ authRequired: Boolean(config.adminPassword), schemaVersion: EXPORT_SCHEMA_VERSION });
  });

  app.get("/api/settings", asyncHandler(async (_req, res) => res.json(await getSettings(db))));
  app.put("/api/settings", requireAdmin, asyncHandler(async (req, res) => {
    const settings = validateSettings(req.body, await getSettings(db));
    res.json(await saveSettings(db, settings));
  }));

  app.get("/api/categories", asyncHandler(async (_req, res) => {
    const rows = await db.all("SELECT name FROM categories ORDER BY name COLLATE NOCASE ASC");
    res.json(rows.map((row) => row.name));
  }));

  app.post("/api/categories", requireAdmin, asyncHandler(async (req, res) => {
    const name = validateCategoryName(req.body?.name);
    await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", name);
    const rows = await db.all("SELECT name FROM categories ORDER BY name COLLATE NOCASE ASC");
    res.status(201).json(rows.map((row) => row.name));
  }));

  app.put("/api/categories/:name", requireAdmin, asyncHandler(async (req, res) => {
    const currentName = validateCategoryName(req.params.name);
    const nextName = validateCategoryName(req.body?.name);
    await withTransaction(db, async () => {
      const current = await db.get("SELECT id FROM categories WHERE name = ?", currentName);
      if (!current) throw new AppError(404, "NOT_FOUND", "分类不存在");
      await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", nextName);
      await db.run("UPDATE devices SET category = ?, updatedAt = datetime('now') WHERE category = ?", nextName, currentName);
      await db.run("DELETE FROM categories WHERE name = ?", currentName);
    });
    res.json({ ok: true, name: nextName });
  }));

  app.delete("/api/categories/:name", requireAdmin, asyncHandler(async (req, res) => {
    const currentName = validateCategoryName(req.params.name);
    const mergeInto = req.body?.mergeInto ? validateCategoryName(req.body.mergeInto) : null;
    await withTransaction(db, async () => {
      const current = await db.get("SELECT id FROM categories WHERE name = ?", currentName);
      if (!current) throw new AppError(404, "NOT_FOUND", "分类不存在");
      if (mergeInto) await ensureCategory(db, mergeInto);
      await db.run("UPDATE devices SET category = ?, updatedAt = datetime('now') WHERE category = ?", mergeInto, currentName);
      await db.run("DELETE FROM categories WHERE name = ?", currentName);
    });
    res.json({ ok: true, mergedInto: mergeInto });
  }));

  app.get("/api/devices", asyncHandler(async (req, res) => {
    res.json(await listDevices(db, {
      category: req.query.category ? validateCategoryName(req.query.category) : null,
      brand: req.query.brand ? String(req.query.brand).slice(0, 100) : null,
      status: statusFilter(req.query.status)
    }));
  }));

  app.get("/api/devices/:id", asyncHandler(async (req, res) => {
    const device = await getDevice(db, validateId(req.params.id));
    if (!device) throw new AppError(404, "NOT_FOUND", "设备不存在");
    res.json(device);
  }));

  app.post("/api/devices", requireAdmin, asyncHandler(async (req, res) => {
    const device = validateDevicePayload(req.body);
    await ensureParentIsValid(db, null, device.parentId);
    const created = await withTransaction(db, async () => {
      await ensureCategory(db, device.category);
      return insertDevice(db, device);
    });
    res.status(201).json(created);
  }));

  app.put("/api/devices/:id", requireAdmin, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);
    const existing = await getDevice(db, id);
    if (!existing) throw new AppError(404, "NOT_FOUND", "设备不存在");
    const device = validateDevicePayload(req.body, existing);
    await ensureParentIsValid(db, id, device.parentId);
    const updated = await withTransaction(db, async () => {
      await ensureCategory(db, device.category);
      return updateDeviceRow(db, id, device);
    });
    if (existing.imagePath !== updated.imagePath) await deleteImageIfUnused(db, existing.imagePath, config.uploadDir);
    res.json(updated);
  }));

  app.delete("/api/devices/:id", requireAdmin, asyncHandler(async (req, res) => {
    const id = validateId(req.params.id);
    const existing = await getDevice(db, id);
    if (!existing) throw new AppError(404, "NOT_FOUND", "设备不存在");
    await db.run("DELETE FROM devices WHERE id = ?", id);
    await deleteImageIfUnused(db, existing.imagePath, config.uploadDir);
    res.json({ ok: true });
  }));

  app.post("/api/devices/bulk-update", requireAdmin, asyncHandler(async (req, res) => {
    const ids = validateIds(req.body?.ids);
    const changes = validateBulkChanges(req.body?.changes);
    const sets = Object.keys(changes).map((field) => `${field} = ?`);
    const values = Object.values(changes);
    await withTransaction(db, async () => {
      if (changes.category) await ensureCategory(db, changes.category);
      const placeholders = ids.map(() => "?").join(",");
      await db.run(`UPDATE devices SET ${sets.join(", ")}, updatedAt = datetime('now') WHERE id IN (${placeholders})`, ...values, ...ids);
    });
    res.json({ ok: true, updated: ids.length });
  }));

  app.post("/api/devices/bulk-delete", requireAdmin, asyncHandler(async (req, res) => {
    const ids = validateIds(req.body?.ids);
    const placeholders = ids.map(() => "?").join(",");
    const images = await db.all(`SELECT imagePath FROM devices WHERE id IN (${placeholders})`, ...ids);
    await withTransaction(db, async () => db.run(`DELETE FROM devices WHERE id IN (${placeholders})`, ...ids));
    for (const row of images) await deleteImageIfUnused(db, row.imagePath, config.uploadDir);
    res.json({ ok: true, deleted: ids.length });
  }));

  app.get("/api/export", requireAdmin, asyncHandler(async (req, res) => {
    const devices = await listDevices(db, {
      category: req.query.category ? validateCategoryName(req.query.category) : null,
      brand: req.query.brand ? String(req.query.brand).slice(0, 100) : null,
      status: statusFilter(req.query.status)
    });
    const exportedAt = new Date().toISOString();
    if (req.query.format === "csv") {
      res.type("text/csv");
      res.setHeader("content-disposition", `attachment; filename="things-terminal-${exportedAt.slice(0, 10)}.csv"`);
      return res.send(`\uFEFF${devicesToCsv(devices, EXPORT_SCHEMA_VERSION)}`);
    }
    res.json({ schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt, items: devices });
  }));

  app.post("/api/import", requireAdmin, asyncHandler(async (req, res) => {
    const rawItems = normalizeExportItems(req.body);
    const mode = req.body?.mode === "replace" ? "replace" : "append";
    const idToName = new Map(rawItems.filter((item) => item?.id).map((item) => [Number(item.id), String(item.name || "")]));
    let inserted = 0;
    let skipped = 0;
    await withTransaction(db, async () => {
      if (mode === "replace") {
        await db.exec("DELETE FROM devices; DELETE FROM categories;");
      }
      const createdByName = new Map();
      const pendingParents = [];
      for (const rawItem of rawItems) {
        if (!rawItem?.name) {
          skipped += 1;
          continue;
        }
        const parentName = rawItem.parent || idToName.get(Number(rawItem.parentId)) || null;
        const device = validateDevicePayload({ ...rawItem, parentId: null });
        await ensureCategory(db, device.category);
        const created = await insertDevice(db, device);
        createdByName.set(created.name, created.id);
        pendingParents.push({ id: created.id, parentName });
        inserted += 1;
      }
      for (const pending of pendingParents) {
        const parentId = createdByName.get(pending.parentName);
        if (parentId && parentId !== pending.id) {
          const parent = await db.get("SELECT name FROM devices WHERE id = ?", parentId);
          await db.run("UPDATE devices SET parentId = ?, parent = ?, updatedAt = datetime('now') WHERE id = ?", parentId, parent.name, pending.id);
        }
      }
    });
    res.json({ ok: true, schemaVersion: EXPORT_SCHEMA_VERSION, inserted, skipped });
  }));

  app.post("/api/uploads", requireAdmin, asyncHandler(async (req, res) => {
    await sendUpload(upload, req, res);
    if (!req.file) throw new AppError(400, "UPLOAD_ERROR", "未选择文件");
    res.status(201).json(await processImage(req.file.buffer, config.uploadDir));
  }));

  app.post("/api/uploads/cleanup", requireAdmin, asyncHandler(async (_req, res) => {
    const removed = await cleanupOrphanUploads(db, config.uploadDir);
    res.json({ ok: true, removed, count: removed.length });
  }));

  app.use("/fonts", express.static(path.join(config.rootDir, "public/fonts"), { immutable: true, maxAge: "1y" }));
  app.use("/generated", express.static(path.join(config.rootDir, "public/generated"), { immutable: true, maxAge: "1y", fallthrough: false }));
  app.get("/favicon.svg", (_req, res) => res.sendFile(path.join(config.rootDir, "public/favicon.svg")));
  app.use("/uploads", express.static(config.uploadDir, { maxAge: "7d", fallthrough: false }));
  app.use("/modules", express.static(path.join(config.rootDir, "modules"), { fallthrough: false }));
  app.use("/shared", express.static(path.join(config.rootDir, "shared"), { fallthrough: false }));
  app.get("/vendor/:asset", (req, res, next) => {
    if (!VENDOR_ASSETS.has(req.params.asset)) return next();
    return res.sendFile(path.join(config.rootDir, "node_modules/98.css/dist", req.params.asset));
  });
  app.get(["/", "/index.html"], (_req, res) => res.sendFile(path.join(config.rootDir, "index.html")));
  app.get(["/main.js", "/styles.css"], (req, res) => res.sendFile(path.join(config.rootDir, req.path.slice(1))));
  app.get("/:page", (req, res, next) => {
    if (!HTML_PAGES.has(req.params.page)) return next();
    return res.sendFile(path.join(config.rootDir, req.params.page));
  });

  app.use((req, _res, next) => next(new AppError(404, "NOT_FOUND", "资源不存在")));
  app.use((error, req, res, _next) => {
    const isJsonError = error instanceof SyntaxError && error.type === "entity.parse.failed";
    const status = isJsonError ? 400 : Number(error.status) || 500;
    const code = isJsonError ? "INVALID_JSON" : error.code || (status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");
    const message = status === 500 ? "服务器内部错误" : error.message;
    const log = status >= 500 ? logger.error : logger.warn;
    log("request_error", { requestId: req.requestId, method: req.method, path: req.path, status, code, error: error.message });
    res.status(status).json({ error: { code, message, ...(error.details ? { details: error.details } : {}) } });
  });

  app.locals.db = db;
  app.locals.config = config;
  return { app, db, config, logger };
};
