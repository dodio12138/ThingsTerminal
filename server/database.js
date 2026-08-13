import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { DEFAULT_SETTINGS } from "../shared/constants.js";

const safeJson = (value, fallback) => {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const addColumn = async (db, table, definition) => {
  const name = definition.trim().split(/\s+/)[0];
  const columns = await db.all(`PRAGMA table_info(${table})`);
  if (!columns.some((column) => column.name === name)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
};

const migrations = [
  {
    version: 1,
    name: "initial tables",
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          imagePath TEXT,
          acquired TEXT,
          lost TEXT,
          acquiredTip TEXT,
          lostTip TEXT,
          acquiredLocation TEXT,
          lostLocation TEXT,
          parent TEXT,
          specs TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        );
      `);
    }
  },
  {
    version: 2,
    name: "structured prices and stable relations",
    up: async (db) => {
      await addColumn(db, "devices", "brand TEXT");
      await addColumn(db, "devices", "buyPrice REAL");
      await addColumn(db, "devices", "sellPrice REAL");
      await addColumn(db, "devices", "buyCurrency TEXT");
      await addColumn(db, "devices", "sellCurrency TEXT");
      await addColumn(db, "devices", "parentId INTEGER REFERENCES devices(id) ON DELETE SET NULL");
      await addColumn(db, "devices", "tags TEXT NOT NULL DEFAULT '[]'");
      await addColumn(db, "devices", "warrantyUntil TEXT");
      await addColumn(db, "devices", "createdAt TEXT");
      await addColumn(db, "devices", "updatedAt TEXT");
      await db.exec(`
        UPDATE devices
        SET parentId = (
          SELECT parent_device.id FROM devices AS parent_device
          WHERE parent_device.name = devices.parent
          ORDER BY parent_device.id LIMIT 1
        )
        WHERE parentId IS NULL AND parent IS NOT NULL AND TRIM(parent) <> '';
        UPDATE devices SET createdAt = COALESCE(createdAt, datetime('now'));
        UPDATE devices SET updatedAt = COALESCE(updatedAt, createdAt, datetime('now'));
        CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category);
        CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
        CREATE INDEX IF NOT EXISTS idx_devices_parent_id ON devices(parentId);
      `);
    }
  },
  {
    version: 3,
    name: "application settings",
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      await db.run(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('app', ?)",
        JSON.stringify(DEFAULT_SETTINGS)
      );
    }
  },
  {
    version: 4,
    name: "materialize legacy parent collections",
    up: async (db) => {
      await db.exec(`
        INSERT INTO devices (name, category, status, specs, tags, createdAt, updatedAt)
        SELECT legacy.parent, MIN(legacy.category), 'active', '[]', '[]', datetime('now'), datetime('now')
        FROM devices AS legacy
        WHERE legacy.parent IS NOT NULL
          AND TRIM(legacy.parent) <> ''
          AND NOT EXISTS (SELECT 1 FROM devices existing WHERE existing.name = legacy.parent)
        GROUP BY legacy.parent;

        UPDATE devices
        SET parentId = (
          SELECT parent_device.id FROM devices AS parent_device
          WHERE parent_device.name = devices.parent
          ORDER BY parent_device.id LIMIT 1
        )
        WHERE parentId IS NULL AND parent IS NOT NULL AND TRIM(parent) <> '';
      `);
    }
  }
];

export const migrateDatabase = async (db) => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      appliedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const applied = new Set((await db.all("SELECT version FROM schema_migrations")).map((row) => row.version));
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    await db.exec("BEGIN IMMEDIATE");
    try {
      await migration.up(db);
      await db.run("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", migration.version, migration.name);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
};

export const initializeDatabase = async (config) => {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
  if (!fs.existsSync(config.dbPath) && fs.existsSync(config.seedDbPath) && path.resolve(config.dbPath) !== path.resolve(config.seedDbPath)) {
    fs.copyFileSync(config.seedDbPath, config.dbPath, fs.constants.COPYFILE_EXCL);
  }
  const db = await open({ filename: config.dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  await migrateDatabase(db);
  return db;
};

export const withTransaction = async (db, callback) => {
  await db.exec("BEGIN IMMEDIATE");
  try {
    const result = await callback();
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
};

export const mapDevice = (row) => {
  if (!row) return null;
  const { parentName, ...device } = row;
  return {
    ...device,
    specs: safeJson(row.specs, []),
    tags: safeJson(row.tags, []),
    parentId: row.parentId ?? null,
    parent: parentName || row.parent || null
  };
};

const DEVICE_SELECT = `
  SELECT d.*, COALESCE(p.name, d.parent) AS parentName
  FROM devices d
  LEFT JOIN devices p ON p.id = d.parentId
`;

export const listDevices = async (db, filters = {}) => {
  const clauses = [];
  const values = [];
  for (const key of ["category", "brand", "status"]) {
    if (filters[key]) {
      clauses.push(`d.${key} = ?`);
      values.push(filters[key]);
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return (await db.all(`${DEVICE_SELECT} ${where} ORDER BY d.id DESC`, ...values)).map(mapDevice);
};

export const getDevice = async (db, id) => mapDevice(await db.get(`${DEVICE_SELECT} WHERE d.id = ?`, id));

export const getSettings = async (db) => {
  const row = await db.get("SELECT value FROM settings WHERE key = 'app'");
  return { ...DEFAULT_SETTINGS, ...safeJson(row?.value, {}) };
};

export const saveSettings = async (db, settings) => {
  await db.run(
    `INSERT INTO settings (key, value, updatedAt) VALUES ('app', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')`,
    JSON.stringify(settings)
  );
  return settings;
};

export const insertDevice = async (db, device) => {
  const parent = device.parentId ? await db.get("SELECT name FROM devices WHERE id = ?", device.parentId) : null;
  const result = await db.run(
    `INSERT INTO devices
      (name, category, status, imagePath, acquired, lost, acquiredTip, lostTip, acquiredLocation, lostLocation,
       parent, parentId, specs, brand, buyPrice, sellPrice, buyCurrency, sellCurrency, tags, warrantyUntil, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    device.name, device.category, device.status, device.imagePath, device.acquired, device.lost,
    device.acquiredTip, device.lostTip, device.acquiredLocation, device.lostLocation,
    parent?.name || null, device.parentId, JSON.stringify(device.specs), device.brand,
    device.buyPrice, device.sellPrice, device.buyCurrency, device.sellCurrency,
    JSON.stringify(device.tags), device.warrantyUntil
  );
  return getDevice(db, result.lastID);
};

export const updateDeviceRow = async (db, id, device) => {
  const parent = device.parentId ? await db.get("SELECT name FROM devices WHERE id = ?", device.parentId) : null;
  await db.run(
    `UPDATE devices SET
      name = ?, category = ?, status = ?, imagePath = ?, acquired = ?, lost = ?, acquiredTip = ?, lostTip = ?,
      acquiredLocation = ?, lostLocation = ?, parent = ?, parentId = ?, specs = ?, brand = ?, buyPrice = ?,
      sellPrice = ?, buyCurrency = ?, sellCurrency = ?, tags = ?, warrantyUntil = ?, updatedAt = datetime('now')
     WHERE id = ?`,
    device.name, device.category, device.status, device.imagePath, device.acquired, device.lost,
    device.acquiredTip, device.lostTip, device.acquiredLocation, device.lostLocation,
    parent?.name || null, device.parentId, JSON.stringify(device.specs), device.brand,
    device.buyPrice, device.sellPrice, device.buyCurrency, device.sellCurrency,
    JSON.stringify(device.tags), device.warrantyUntil, id
  );
  return getDevice(db, id);
};
