import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { classifyImportTransactionsWithAi } from "@/modules/classification/ai-import-classifier";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, GEMINI_API_KEY: "test-gemini-key" };
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

test("sends one sanitized Gemini request for multiple import rows and maps valid categories by rowId", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { rowId: "row-1", merchantKeyword: "BIGBASKET", category: "food" },
                    { rowId: "row-2", merchantKeyword: "ZERODHA", category: "savings_investments" }
                  ])
                }
              ]
            }
          }
        ]
      }),
      { status: 200 }
    )
  );

  const result = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    },
    {
      rowId: "row-2",
      description: "ZERODHA BROKING",
      transactionDate: "2026-04-05",
      direction: "outgoing",
      amountMinorUnits: 500000
    }
  ]);

  expect(result.status).toBe("ok");
  expect(result.classifications.get("row-1")).toEqual({
    category: "food",
    merchantKeyword: "BIGBASKET"
  });
  expect(result.classifications.get("row-2")).toEqual({
    category: "savings_investments",
    merchantKeyword: "ZERODHA"
  });
  expect(fetch).toHaveBeenCalledTimes(1);

  const [url, request] = vi.mocked(fetch).mock.calls[0];
  const body = JSON.parse(String((request as RequestInit).body));
  const bodyText = JSON.stringify(body);

  expect(String(url)).toContain("models/gemini-3.1-flash-lite:generateContent");
  expect(bodyText).toContain("UPI/BIGBASKET");
  expect(bodyText).toContain("amountMinorUnits");
  expect(bodyText).not.toContain("accountId");
  expect(bodyText).not.toContain("accountDisplayName");
  expect(bodyText).not.toContain("userId");
  expect(bodyText).not.toContain("runningBalance");
  expect(bodyText).not.toContain("rawSourcePayload");
});

test("ignores unsupported categories and duplicate row ids without failing the batch", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { rowId: "row-1", merchantKeyword: "BIGBASKET", category: "food" },
                    { rowId: "row-2", merchantKeyword: "STORE", category: "not_real" },
                    { rowId: "row-3", merchantKeyword: "CRED", category: "debt_cards" },
                    { rowId: "row-3", merchantKeyword: "CRED PAY", category: "debt_cards" },
                    { rowId: "row-404", merchantKeyword: "EXTRA", category: "shopping" }
                  ])
                }
              ]
            }
          }
        ]
      }),
      { status: 200 }
    )
  );

  const result = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    },
    {
      rowId: "row-2",
      description: "UPI/STORE",
      transactionDate: "2026-04-05",
      direction: "outgoing",
      amountMinorUnits: 50000
    },
    {
      rowId: "row-3",
      description: "CRED",
      transactionDate: "2026-04-06",
      direction: "outgoing",
      amountMinorUnits: 100000
    }
  ]);

  expect(result.status).toBe("ok");
  expect([...result.classifications.entries()]).toEqual([
    ["row-1", { category: "food", merchantKeyword: "BIGBASKET" }]
  ]);
});

test("returns fallback without throwing when Gemini is unavailable or returns invalid JSON", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response("quota", { status: 429 }));

  const quotaResult = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    }
  ]);

  vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

  const networkResult = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    }
  ]);

  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "not-json" }] } }]
      }),
      { status: 200 }
    )
  );

  const schemaResult = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    }
  ]);

  expect(quotaResult).toMatchObject({ status: "fallback" });
  expect(networkResult).toMatchObject({ status: "fallback" });
  expect(schemaResult).toMatchObject({ status: "fallback" });
});

test("disables AI categorization without calling Gemini when the API key is missing", async () => {
  delete process.env.GEMINI_API_KEY;

  const result = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    }
  ]);

  expect(result.status).toBe("disabled");
  expect(result.classifications.size).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});

test("logs sanitized Gemini fallback details when generateContent returns a non-ok response", async () => {
  process.env.APP_LOG_LEVEL = "debug";
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: {
          code: 403,
          message: "Your project has been denied access. Please contact support.",
          status: "PERMISSION_DENIED"
        }
      }),
      { status: 403 }
    )
  );

  const result = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    }
  ]);

  expect(result.status).toBe("fallback");
  expect(console.warn).toHaveBeenCalledTimes(1);

  const payload = JSON.parse(String(vi.mocked(console.warn).mock.calls[0][0]));

  expect(payload).toMatchObject({
    level: "warn",
    logger: "ai-import-classifier",
    message: "gemini.generateContent.fallback",
    model: "gemini-3.1-flash-lite",
    statusCode: 403,
    candidateCount: 1,
    errorMessage: "Your project has been denied access. Please contact support."
  });
  expect(payload.latencyMs).toEqual(expect.any(Number));
  expect(JSON.stringify(payload)).not.toContain("test-gemini-key");
  expect(JSON.stringify(payload)).not.toContain("UPI/BIGBASKET");
});

test("logs Gemini request metadata and successful response outcome at debug level", async () => {
  process.env.APP_LOG_LEVEL = "debug";
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([{ rowId: "row-1", merchantKeyword: "BIGBASKET", category: "food" }])
                }
              ]
            }
          }
        ]
      }),
      { status: 200 }
    )
  );

  const result = await classifyImportTransactionsWithAi([
    {
      rowId: "row-1",
      description: "UPI/BIGBASKET",
      transactionDate: "2026-04-04",
      direction: "outgoing",
      amountMinorUnits: 125000
    }
  ]);

  expect(result.status).toBe("ok");
  expect(console.debug).toHaveBeenCalledTimes(1);
  expect(console.info).toHaveBeenCalledTimes(1);

  const requestLog = JSON.parse(String(vi.mocked(console.debug).mock.calls[0][0]));
  const responseLog = JSON.parse(String(vi.mocked(console.info).mock.calls[0][0]));

  expect(requestLog).toMatchObject({
    level: "debug",
    logger: "ai-import-classifier",
    message: "gemini.generateContent.request",
    model: "gemini-3.1-flash-lite",
    candidateCount: 1
  });
  expect(responseLog).toMatchObject({
    level: "info",
    logger: "ai-import-classifier",
    message: "gemini.generateContent.ok",
    model: "gemini-3.1-flash-lite",
    statusCode: 200,
    candidateCount: 1,
    classificationCount: 1
  });
  expect(JSON.stringify([requestLog, responseLog])).not.toContain("test-gemini-key");
  expect(JSON.stringify([requestLog, responseLog])).not.toContain("UPI/BIGBASKET");
});
