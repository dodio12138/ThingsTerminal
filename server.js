import { createApp } from "./server/app.js";

const { app, config, logger, db } = await createApp();
const server = app.listen(config.port, () => {
  logger.info("server_started", {
    url: `http://localhost:${config.port}`,
    environment: config.environment,
    database: config.dbPath
  });
});
server.on("error", async (error) => {
  logger.error("server_error", { code: error.code, error: error.message });
  await db.close();
  process.exit(1);
});

const shutdown = async (signal) => {
  logger.info("server_stopping", { signal });
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
