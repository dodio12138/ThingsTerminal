import { createConfig } from "../server/config.js";
import { initializeDatabase } from "../server/database.js";

const config = createConfig();
const db = await initializeDatabase(config);
const migrations = await db.all("SELECT version, name, appliedAt FROM schema_migrations ORDER BY version");
await db.close();
console.table(migrations);
