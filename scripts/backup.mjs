import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createConfig } from "../server/config.js";
import { initializeDatabase } from "../server/database.js";

const config = createConfig();
const backupDir = path.join(config.rootDir, "data/backups");
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `devices-${stamp}.sqlite`);
const db = await initializeDatabase(config);
try {
  await db.exec("PRAGMA wal_checkpoint(FULL)");
  await db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
} finally {
  await db.close();
}
const check = await open({ filename: target, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
const integrity = await check.get("PRAGMA integrity_check");
await check.close();
if (integrity.integrity_check !== "ok") throw new Error("Backup integrity check failed");
console.log(target);
