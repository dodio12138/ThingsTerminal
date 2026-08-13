import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const resolvePath = (value, fallback) => {
  const selected = value || fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(ROOT_DIR, selected);
};

export const createConfig = (overrides = {}) => {
  const environment = overrides.environment || process.env.NODE_ENV || "development";
  const dataDir = resolvePath(overrides.dataDir || process.env.DATA_DIR, "data/runtime");
  const config = {
    rootDir: ROOT_DIR,
    environment,
    isProduction: environment === "production",
    port: Number(overrides.port || process.env.PORT || 3000),
    adminPassword: overrides.adminPassword ?? process.env.ADMIN_PASSWORD ?? "",
    dataDir,
    dbPath: resolvePath(overrides.dbPath || process.env.DB_PATH, path.join(dataDir, "devices.sqlite")),
    seedDbPath: resolvePath(overrides.seedDbPath || process.env.SEED_DB_PATH, "data/devices.sqlite"),
    uploadDir: resolvePath(overrides.uploadDir || process.env.UPLOAD_DIR, "public/uploads"),
    trustProxy: String(overrides.trustProxy ?? process.env.TRUST_PROXY ?? "0") === "1",
    logLevel: overrides.logLevel || process.env.LOG_LEVEL || "info"
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  if (config.isProduction && config.adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters in production");
  }
  return config;
};
