import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import multer from "multer";
import { deviceData } from "./data.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "devices.sqlite");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const specTypes = new Set([
  "processor",
  "display",
  "memory",
  "storage",
  "graphics",
  "system",
  "color",
  "resolution",
  "feature"
]);

const deviceTypes = new Set(["camera", "folder"]);

const parsePrice = (value) => {
  if (value === null || value === undefined || value === "") return { amount: null, currency: null };
  if (typeof value === "number" && Number.isFinite(value)) return { amount: value, currency: null };
  const text = String(value).trim();
  const amountMatch = text.match(/(\d[\d,.]*)/);
  if (!amountMatch) return { amount: null, currency: null };
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return { amount: null, currency: null };
  const symbolMatch = text.match(/[¥￥$£€]/);
  const codeMatch = text.match(/\b(CNY|RMB|USD|GBP|EUR|HKD|JPY)\b/i);
  return { amount, currency: symbolMatch?.[0] || codeMatch?.[1]?.toUpperCase() || null };
};

const resolvePrice = (priceInput, currencyInput, fallbackText) => {
  const parsed =
    priceInput !== null && priceInput !== undefined && priceInput !== ""
      ? parsePrice(priceInput)
      : parsePrice(fallbackText);
  const selectedCurrency =
    currencyInput !== null && currencyInput !== undefined && String(currencyInput).trim()
      ? String(currencyInput).trim().toUpperCase()
      : parsed.currency;
  if (parsed.amount == null) return { amount: null, currency: null };
  return { amount: parsed.amount, currency: selectedCurrency || null };
};

const normalizeDevices = () => {
  const devices = [];

  const pushDevice = (item, category, parentName = null) => {
    const specs = Array.isArray(item.children)
      ? item.children.filter((child) => specTypes.has(child.type)).map((child) => child.name)
      : [];

    const buyParsed = parsePrice(item.acquiredTip);
    const sellParsed = parsePrice(item.lostTip);

    devices.push({
      name: item.name,
      category,
      status: item.status ?? "active",
      imagePath: item.imagePath ?? null,
      acquired: item.acquired ?? null,
      lost: item.lost ?? null,
      acquiredTip: item.acquiredTip ?? null,
      lostTip: item.lostTip ?? null,
      acquiredLocation: item.acquiredLocation ?? null,
      lostLocation: item.lostLocation ?? null,
      parent: parentName,
      specs,
      buyPrice: buyParsed.amount,
      buyCurrency: buyParsed.currency,
      sellPrice: sellParsed.amount,
      sellCurrency: sellParsed.currency
    });
  };

  const walkItems = (items, category, parentName = null) => {
    items.forEach((item) => {
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      const isSpec = specTypes.has(item.type);
      const isDevice = item.imagePath || deviceTypes.has(item.type) || hasChildren;

      if (!isSpec && isDevice) {
        pushDevice(item, category, parentName);
      }

      if (hasChildren) {
        const childParent = isSpec ? parentName : item.name;
        const childItems = item.children.filter((child) => !specTypes.has(child.type) || child.imagePath);
        if (childItems.length > 0) {
          walkItems(childItems, category, childParent);
        }
      }
    });
  };

  deviceData.windows.forEach((win) => {
    if (!win.items || win.items.length === 0) return;
    walkItems(win.items, win.title);
  });

  return devices;
};

const initDb = async () => {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      status TEXT,
      imagePath TEXT,
      acquired TEXT,
      lost TEXT,
      acquiredTip TEXT,
      lostTip TEXT,
      acquiredLocation TEXT,
      lostLocation TEXT,
      parent TEXT,
      specs TEXT,
      brand TEXT,
      buyPrice REAL,
      sellPrice REAL,
      buyCurrency TEXT,
      sellCurrency TEXT
    );
  `);

  const columns = await db.all("PRAGMA table_info(devices)");
  const hasBrand = columns.some((col) => col.name === "brand");
  if (!hasBrand) {
    await db.exec("ALTER TABLE devices ADD COLUMN brand TEXT");
  }
  const hasBuyPrice = columns.some((col) => col.name === "buyPrice");
  if (!hasBuyPrice) {
    await db.exec("ALTER TABLE devices ADD COLUMN buyPrice REAL");
  }
  const hasSellPrice = columns.some((col) => col.name === "sellPrice");
  if (!hasSellPrice) {
    await db.exec("ALTER TABLE devices ADD COLUMN sellPrice REAL");
  }
  const hasBuyCurrency = columns.some((col) => col.name === "buyCurrency");
  if (!hasBuyCurrency) {
    await db.exec("ALTER TABLE devices ADD COLUMN buyCurrency TEXT");
  }
  const hasSellCurrency = columns.some((col) => col.name === "sellCurrency");
  if (!hasSellCurrency) {
    await db.exec("ALTER TABLE devices ADD COLUMN sellCurrency TEXT");
  }

  const priceRows = await db.all(
    "SELECT id, acquiredTip, lostTip, buyPrice, sellPrice, buyCurrency, sellCurrency FROM devices"
  );
  for (const row of priceRows) {
    const buyParsed = row.buyPrice != null ? { amount: row.buyPrice, currency: row.buyCurrency } : parsePrice(row.acquiredTip);
    const sellParsed = row.sellPrice != null ? { amount: row.sellPrice, currency: row.sellCurrency } : parsePrice(row.lostTip);
    const shouldUpdate =
      (row.buyPrice == null && buyParsed.amount != null) ||
      (row.sellPrice == null && sellParsed.amount != null);
    if (shouldUpdate) {
      await db.run(
        "UPDATE devices SET buyPrice = COALESCE(?, buyPrice), buyCurrency = COALESCE(?, buyCurrency), sellPrice = COALESCE(?, sellPrice), sellCurrency = COALESCE(?, sellCurrency) WHERE id = ?",
        buyParsed.amount,
        buyParsed.currency,
        sellParsed.amount,
        sellParsed.currency,
        row.id
      );
    }
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);

  const row = await db.get("SELECT COUNT(*) as count FROM devices");
  if (row.count === 0) {
    const seed = normalizeDevices();
    const insert = await db.prepare(`
      INSERT INTO devices
      (name, category, status, imagePath, acquired, lost, acquiredTip, lostTip, acquiredLocation, lostLocation, parent, specs, brand, buyPrice, sellPrice, buyCurrency, sellCurrency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      for (const item of seed) {
        await insert.run(
          item.name,
          item.category,
          item.status,
          item.imagePath,
          item.acquired,
          item.lost,
          item.acquiredTip,
          item.lostTip,
          item.acquiredLocation,
          item.lostLocation,
          item.parent,
          JSON.stringify(item.specs ?? []),
          item.brand ?? null,
          item.buyPrice ?? null,
          item.sellPrice ?? null,
          item.buyCurrency ?? null,
          item.sellCurrency ?? null
        );
      }
    } finally {
      await insert.finalize();
    }
  }

  const categoryRows = await db.get("SELECT COUNT(*) as count FROM categories");
  if (categoryRows.count === 0) {
    const seedCategories = new Set(
      normalizeDevices()
        .map((item) => item.category)
        .filter(Boolean)
    );
    const insertCategory = await db.prepare("INSERT OR IGNORE INTO categories (name) VALUES (?)");
    try {
      for (const name of seedCategories) {
        await insertCategory.run(name);
      }
    } finally {
      await insertCategory.finalize();
    }
  }

  return db;
};

const main = async () => {
  const db = await initDb();

  app.use(express.json());

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) return cb(null, true);
      cb(new Error("Only image uploads are allowed"));
    }
  });

  const requireAdmin = (req, res, next) => {
    if (!ADMIN_PASSWORD) return next();
    const password = req.header("x-admin-password");
    if (password && password === ADMIN_PASSWORD) return next();
    return res.status(401).json({ error: "Unauthorized" });
  };

  app.get("/api/meta", (_req, res) => {
    res.json({ authRequired: Boolean(ADMIN_PASSWORD) });
  });

  app.post("/api/uploads", requireAdmin, (req, res) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        const message =
          err.message === "File too large" ? "文件过大（最大 5MB）" : err.message || "上传失败";
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: "未选择文件" });
      return res.json({ url: `/uploads/${req.file.filename}` });
    });
  });

  app.get("/api/categories", async (_req, res) => {
    const rows = await db.all("SELECT name FROM categories ORDER BY name ASC");
    res.json(rows.map((row) => row.name));
  });

  app.post("/api/categories", requireAdmin, async (req, res) => {
    const name = req.body?.name?.toString().trim();
    if (!name) return res.status(400).json({ error: "Name is required" });
    try {
      await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", name);
      const rows = await db.all("SELECT name FROM categories ORDER BY name ASC");
      res.status(201).json(rows.map((row) => row.name));
    } catch (error) {
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.get("/api/devices", async (_req, res) => {
    const rows = await db.all("SELECT * FROM devices ORDER BY id DESC");
    res.json(
      rows.map((row) => ({
        ...row,
        specs: row.specs ? JSON.parse(row.specs) : []
      }))
    );
  });

  app.get("/api/devices/:id", async (req, res) => {
    const row = await db.get("SELECT * FROM devices WHERE id = ?", req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({
      ...row,
      specs: row.specs ? JSON.parse(row.specs) : []
    });
  });

  app.post("/api/devices", requireAdmin, async (req, res) => {
    const payload = req.body ?? {};
    const { name } = payload;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const specs =
      Array.isArray(payload.specs) ?
        payload.specs :
        typeof payload.specs === "string" ?
          payload.specs.split("\n").map((line) => line.trim()).filter(Boolean) :
          [];

    if (payload.category) {
      await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", payload.category);
    }

    const buyParsed = resolvePrice(payload.buyPrice, payload.buyCurrency, payload.acquiredTip);
    const sellParsed = resolvePrice(payload.sellPrice, payload.sellCurrency, payload.lostTip);

    const result = await db.run(
      `
        INSERT INTO devices
        (name, category, status, imagePath, acquired, lost, acquiredTip, lostTip, acquiredLocation, lostLocation, parent, specs, brand, buyPrice, sellPrice, buyCurrency, sellCurrency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      name,
      payload.category ?? null,
      payload.status ?? "active",
      payload.imagePath ?? null,
      payload.acquired ?? null,
      payload.lost ?? null,
      payload.acquiredTip ?? null,
      payload.lostTip ?? null,
      payload.acquiredLocation ?? null,
      payload.lostLocation ?? null,
      payload.parent ?? null,
      JSON.stringify(specs),
      payload.brand ?? null,
      buyParsed.amount,
      sellParsed.amount,
      buyParsed.currency,
      sellParsed.currency
    );

    const created = await db.get("SELECT * FROM devices WHERE id = ?", result.lastID);
    res.status(201).json({
      ...created,
      specs: created.specs ? JSON.parse(created.specs) : []
    });
  });

  app.put("/api/devices/:id", requireAdmin, async (req, res) => {
    const payload = req.body ?? {};
    const row = await db.get("SELECT * FROM devices WHERE id = ?", req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });

    const specs =
      Array.isArray(payload.specs) ?
        payload.specs :
        typeof payload.specs === "string" ?
          payload.specs.split("\n").map((line) => line.trim()).filter(Boolean) :
          row.specs ?
            JSON.parse(row.specs) :
            [];

    const buyParsed = resolvePrice(payload.buyPrice, payload.buyCurrency, payload.acquiredTip ?? row.acquiredTip);
    const sellParsed = resolvePrice(payload.sellPrice, payload.sellCurrency, payload.lostTip ?? row.lostTip);

    const updated = {
      name: payload.name ?? row.name,
      category: payload.category ?? row.category,
      status: payload.status ?? row.status,
      imagePath: payload.imagePath ?? row.imagePath,
      acquired: payload.acquired ?? row.acquired,
      lost: payload.lost ?? row.lost,
      acquiredTip: payload.acquiredTip ?? row.acquiredTip,
      lostTip: payload.lostTip ?? row.lostTip,
      acquiredLocation: payload.acquiredLocation ?? row.acquiredLocation,
      lostLocation: payload.lostLocation ?? row.lostLocation,
      parent: payload.parent ?? row.parent,
      specs,
      brand: payload.brand ?? row.brand,
      buyPrice: buyParsed.amount ?? row.buyPrice,
      sellPrice: sellParsed.amount ?? row.sellPrice,
      buyCurrency: buyParsed.currency ?? row.buyCurrency,
      sellCurrency: sellParsed.currency ?? row.sellCurrency
    };

    if (updated.category) {
      await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", updated.category);
    }

    await db.run(
      `
        UPDATE devices
        SET name = ?, category = ?, status = ?, imagePath = ?, acquired = ?, lost = ?,
            acquiredTip = ?, lostTip = ?, acquiredLocation = ?, lostLocation = ?, parent = ?, specs = ?, brand = ?,
            buyPrice = ?, sellPrice = ?, buyCurrency = ?, sellCurrency = ?
        WHERE id = ?
      `,
      updated.name,
      updated.category,
      updated.status,
      updated.imagePath,
      updated.acquired,
      updated.lost,
      updated.acquiredTip,
      updated.lostTip,
      updated.acquiredLocation,
      updated.lostLocation,
      updated.parent,
      JSON.stringify(updated.specs ?? []),
      updated.brand,
      updated.buyPrice ?? null,
      updated.sellPrice ?? null,
      updated.buyCurrency ?? null,
      updated.sellCurrency ?? null,
      req.params.id
    );

    const refreshed = await db.get("SELECT * FROM devices WHERE id = ?", req.params.id);
    res.json({
      ...refreshed,
      specs: refreshed.specs ? JSON.parse(refreshed.specs) : []
    });
  });

  app.delete("/api/devices/:id", requireAdmin, async (req, res) => {
    const row = await db.get("SELECT * FROM devices WHERE id = ?", req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    await db.run("DELETE FROM devices WHERE id = ?", req.params.id);
    res.json({ ok: true });
  });

  app.post("/api/devices/bulk-update", requireAdmin, async (req, res) => {
    const { ids, changes } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
    if (!changes || typeof changes !== "object") return res.status(400).json({ error: "changes required" });

    const wantsUnsetCategory = changes.category === "";
    const fields = {
      category: wantsUnsetCategory ? null : changes.category ?? null,
      status: changes.status ?? null,
      brand: changes.brand ?? null
    };

    for (const id of ids) {
      if (wantsUnsetCategory) {
        await db.run(
          `UPDATE devices SET category = NULL, status = COALESCE(?, status), brand = COALESCE(?, brand) WHERE id = ?`,
          fields.status,
          fields.brand,
          id
        );
      } else {
        await db.run(
          `UPDATE devices SET category = COALESCE(?, category), status = COALESCE(?, status), brand = COALESCE(?, brand) WHERE id = ?`,
          fields.category,
          fields.status,
          fields.brand,
          id
        );
      }
    }
    if (fields.category) {
      await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", fields.category);
    }
    res.json({ ok: true });
  });

  app.post("/api/devices/bulk-delete", requireAdmin, async (req, res) => {
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
    const placeholders = ids.map(() => "?").join(",");
    await db.run(`DELETE FROM devices WHERE id IN (${placeholders})`, ids);
    res.json({ ok: true });
  });

  app.get("/api/export", requireAdmin, async (_req, res) => {
    const rows = await db.all("SELECT * FROM devices ORDER BY id DESC");
    res.json(rows.map((row) => ({ ...row, specs: row.specs ? JSON.parse(row.specs) : [] })));
  });

  app.post("/api/import", requireAdmin, async (req, res) => {
    const payload = req.body ?? {};
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
    const mode = payload.mode === "replace" ? "replace" : "append";
    if (items.length === 0) return res.status(400).json({ error: "No items" });
    if (mode === "replace") {
      await db.exec("DELETE FROM devices;");
      await db.exec("DELETE FROM categories;");
    }
    const insert = await db.prepare(
      `INSERT INTO devices (name, category, status, imagePath, acquired, lost, acquiredTip, lostTip, acquiredLocation, lostLocation, parent, specs, brand, buyPrice, sellPrice, buyCurrency, sellCurrency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let inserted = 0;
    let skipped = 0;
    try {
      for (const item of items) {
        if (!item?.name) {
          skipped += 1;
          continue;
        }
        const specs =
          Array.isArray(item.specs) ?
            item.specs :
            typeof item.specs === "string" ?
              item.specs.split("\n").map((line) => line.trim()).filter(Boolean) :
              [];
        const buyParsed = resolvePrice(item.buyPrice, item.buyCurrency, item.acquiredTip);
        const sellParsed = resolvePrice(item.sellPrice, item.sellCurrency, item.lostTip);

        await insert.run(
          item.name,
          item.category ?? null,
          item.status ?? "active",
          item.imagePath ?? null,
          item.acquired ?? null,
          item.lost ?? null,
          item.acquiredTip ?? null,
          item.lostTip ?? null,
          item.acquiredLocation ?? null,
          item.lostLocation ?? null,
          item.parent ?? null,
          JSON.stringify(specs),
          item.brand ?? null,
          buyParsed.amount,
          sellParsed.amount,
          buyParsed.currency,
          sellParsed.currency
        );
        inserted += 1;
        if (item.category) {
          await db.run("INSERT OR IGNORE INTO categories (name) VALUES (?)", item.category);
        }
      }
    } finally {
      await insert.finalize();
    }
    res.json({ ok: true, inserted, skipped });
  });

  app.use("/fonts", express.static(path.join(PUBLIC_DIR, "fonts")));
  app.use("/uploads", express.static(UPLOAD_DIR));
  app.use(express.static(path.join(__dirname)));

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
