import {
  isTransactionCategory,
  transactionCategories,
  type TransactionCategory
} from "@/modules/classification/categories";
import { createServerLogger } from "@/lib/server-logger";

export type AiImportTransaction = {
  rowId: string;
  description: string;
  transactionDate: string;
  direction: "incoming" | "outgoing";
  amountMinorUnits: number;
};

export type AiImportClassification = {
  category: TransactionCategory;
  merchantKeyword: string;
};

export type AiImportClassificationResult =
  | {
      status: "disabled";
      classifications: Map<string, AiImportClassification>;
    }
  | {
      status: "ok";
      classifications: Map<string, AiImportClassification>;
    }
  | {
      status: "fallback";
      classifications: Map<string, AiImportClassification>;
    };

const logger = createServerLogger("ai-import-classifier");

export async function classifyImportTransactionsWithAi(
  transactions: AiImportTransaction[]
): Promise<AiImportClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const classifications = new Map<string, AiImportClassification>();

  if (!apiKey || transactions.length === 0) {
    return { status: "disabled", classifications };
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const startedAt = Date.now();

  try {
    logger.debug("gemini.generateContent.request", {
      model,
      candidateCount: transactions.length
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildGeminiRequest(transactions)),
        signal: AbortSignal.timeout(15_000)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn("gemini.generateContent.fallback", {
        model,
        statusCode: response.status,
        candidateCount: transactions.length,
        latencyMs: Date.now() - startedAt,
        errorMessage: extractGeminiErrorMessage(errorText)
      });
      return { status: "fallback", classifications };
    }

    const payload = await response.json();
    const parsed = parseGeminiClassifications(payload);
    const validRowIds = new Set(transactions.map((transaction) => transaction.rowId));
    const duplicateRowIds = duplicatedRowIds(parsed);

    for (const item of parsed) {
      if (
        !validRowIds.has(item.rowId) ||
        duplicateRowIds.has(item.rowId) ||
        !isTransactionCategory(item.category) ||
        typeof item.merchantKeyword !== "string" ||
        item.merchantKeyword.trim().length === 0
      ) {
        continue;
      }

      classifications.set(item.rowId, {
        category: item.category,
        merchantKeyword: item.merchantKeyword.trim().toUpperCase()
      });
    }

    logger.info("gemini.generateContent.ok", {
      model,
      statusCode: response.status,
      candidateCount: transactions.length,
      classificationCount: classifications.size,
      latencyMs: Date.now() - startedAt
    });
    return { status: "ok", classifications };
  } catch (error) {
    logger.error("gemini.generateContent.error", {
      model,
      candidateCount: transactions.length,
      latencyMs: Date.now() - startedAt,
      error
    });
    return { status: "fallback", classifications };
  }
}

function buildGeminiRequest(transactions: AiImportTransaction[]) {
  const categories = transactionCategories.map((category) => category.slug);

  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Classify each transaction into one of the allowed categories.",
              "Return only JSON matching the schema.",
              `Allowed categories: ${categories.join(", ")}.`,
              "Use compact reusable merchantKeyword values.",
              JSON.stringify({ transactions })
            ].join("\n")
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            rowId: { type: "STRING" },
            merchantKeyword: { type: "STRING" },
            category: { type: "STRING", enum: categories }
          },
          required: ["rowId", "merchantKeyword", "category"]
        }
      }
    }
  };
}

function parseGeminiClassifications(payload: unknown): Array<{
  rowId: string;
  merchantKeyword: string;
  category: string;
}> {
  const text = extractGeminiText(payload);
  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is { rowId: string; merchantKeyword: string; category: string } => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const record = item as Record<string, unknown>;
    return (
      typeof record.rowId === "string" &&
      typeof record.merchantKeyword === "string" &&
      typeof record.category === "string"
    );
  });
}

function extractGeminiText(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return "[]";
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) {
    return "[]";
  }

  const [candidate] = candidates;
  const parts = (candidate as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) {
    return "[]";
  }

  const text = (parts[0] as { text?: unknown } | undefined)?.text;
  return typeof text === "string" ? text : "[]";
}

function duplicatedRowIds(items: Array<{ rowId: string }>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (seen.has(item.rowId)) {
      duplicates.add(item.rowId);
    }
    seen.add(item.rowId);
  }

  return duplicates;
}

function extractGeminiErrorMessage(text: string) {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") {
      return parsed.error.message;
    }
  } catch {}

  return text;
}
