type ServerLogLevel = "debug" | "info" | "warn" | "error" | "off";
type LogContext = Record<string, unknown>;

const levelRank: Record<ServerLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  off: 50
};

const secretKeyPattern = /(api[_-]?key|authorization|cookie|password|secret|token)/i;

export function createServerLogger(logger: string) {
  return {
    debug: (message: string, context?: LogContext) => writeLog("debug", logger, message, context),
    info: (message: string, context?: LogContext) => writeLog("info", logger, message, context),
    warn: (message: string, context?: LogContext) => writeLog("warn", logger, message, context),
    error: (message: string, context?: LogContext) => writeLog("error", logger, message, context)
  };
}

function writeLog(level: Exclude<ServerLogLevel, "off">, logger: string, message: string, context: LogContext = {}) {
  const configuredLevel = getConfiguredLogLevel();

  if (configuredLevel === "off" || levelRank[level] < levelRank[configuredLevel]) {
    return;
  }

  const sanitizedContext = sanitizeLogValue(context) as LogContext;
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    logger,
    message,
    ...sanitizedContext
  };
  const line = JSON.stringify(payload);

  if (level === "debug") {
    console.debug(line);
    return;
  }

  if (level === "info") {
    console.info(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.error(line);
}

function getConfiguredLogLevel(): ServerLogLevel {
  const configured = process.env.APP_LOG_LEVEL?.toLowerCase();

  if (isServerLogLevel(configured)) {
    return configured;
  }

  if (process.env.NODE_ENV === "test") {
    return "off";
  }

  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function isServerLogLevel(value: string | undefined): value is ServerLogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error" || value === "off";
}

function sanitizeLogValue(value: unknown, key = ""): unknown {
  if (secretKeyPattern.test(key)) {
    return "[REDACTED]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.APP_LOG_LEVEL === "debug" ? value.stack : undefined
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeLogValue(entryValue, entryKey)
      ])
    );
  }

  if (typeof value === "string" && value.length > 2_000) {
    return `${value.slice(0, 2_000)}...[TRUNCATED]`;
  }

  return value;
}
