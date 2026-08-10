import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createConfig } from "../server/config.js";
import { migrateDatabase } from "../server/database.js";

const sourceArg = process.argv[2];
if (!sourceArg) throw new Error("Usage: npm run restore -- /absolute/path/to/backup.sqlite");
const source = path.resolve(sourceArg);
if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("Backup file does not exist");

const sourceDb = await open({ filename: source, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
const integrity = await sourceDb.get("PRAGMA integrity_check");
const devicesTable = await sourceDb.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'");
await sourceDb.close();
if (integrity.integrity_check !== "ok" || !devicesTable) throw new Error("Backup is not a valid Things Terminal database");

const config = createConfig();
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
if (fs.existsSync(config.dbPath)) {
  const safetyCopy = `${config.dbPath}.before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(config.dbPath, safetyCopy, fs.constants.COPYFILE_EXCL);
  console.log(`Safety copy: ${safetyCopy}`);
}
fs.copyFileSync(source, config.dbPath);
const restored = await open({ filename: config.dbPath, driver: sqlite3.Database });
await migrateDatabase(restored);
const count = await restored.get("SELECT COUNT(*) AS count FROM devices");
await restored.close();
console.log(`Restored ${count.count} devices to ${config.dbPath}`);
