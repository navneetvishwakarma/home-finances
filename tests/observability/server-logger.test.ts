import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createServerLogger } from "@/lib/server-logger";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

test("emits structured JSON logs at or above the configured level and redacts secrets", () => {
  process.env.APP_LOG_LEVEL = "warn";
  const logger = createServerLogger("imports");

  logger.debug("debug skipped", { candidateCount: 2 });
  logger.info("info skipped", { candidateCount: 2 });
  logger.warn("gemini fallback", {
    candidateCount: 2,
    geminiApiKey: "secret-key",
    nested: { authorization: "Bearer secret-token" }
  });

  expect(console.debug).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
  expect(console.warn).toHaveBeenCalledTimes(1);

  const payload = JSON.parse(String(vi.mocked(console.warn).mock.calls[0][0]));

  expect(payload).toMatchObject({
    level: "warn",
    logger: "imports",
    message: "gemini fallback",
    candidateCount: 2,
    geminiApiKey: "[REDACTED]",
    nested: { authorization: "[REDACTED]" }
  });
  expect(payload.timestamp).toEqual(expect.any(String));
});

test("suppresses every application log when the configured level is off", () => {
  process.env.APP_LOG_LEVEL = "off";
  const logger = createServerLogger("imports");

  logger.error("hidden", { failure: true });

  expect(console.debug).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

test("suppresses application logs under Vitest unless a level is configured", () => {
  delete process.env.APP_LOG_LEVEL;
  process.env.VITEST = "true";
  const logger = createServerLogger("imports");

  logger.info("hidden", { candidateCount: 2 });

  expect(console.info).not.toHaveBeenCalled();
});
