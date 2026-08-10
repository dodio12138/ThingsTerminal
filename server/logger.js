const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export const createLogger = (minimumLevel = "info") => {
  const threshold = LEVELS[minimumLevel] ?? LEVELS.info;
  const write = (level, message, context = {}) => {
    if ((LEVELS[level] ?? LEVELS.info) < threshold) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    };
    const output = JSON.stringify(entry);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  };
  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  };
};
