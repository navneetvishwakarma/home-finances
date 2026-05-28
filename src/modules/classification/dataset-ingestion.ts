import { createHash } from "node:crypto";
import { parseCsvRecords } from "@/modules/source-profiles/csv";
import {
  isTransactionCategory,
  type TransactionCategory
} from "@/modules/classification/categories";

export type ParsedClassificationExample = {
  originalText: string;
  normalizedText: string;
  category: TransactionCategory;
  sourceRowHash: string;
};

const genericPatternTexts = new Set([
  "neft transfer to self",
  "imps transfer to self",
  "mmt transfer to self",
  "transfer to self"
]);

const leadingChannelTokens = /^(upi|neft|imps|mmt|inf|inft)\s+/;
const merchantAnchors = [
  "zerodha",
  "groww",
  "flipkart",
  "amazon",
  "myntra",
  "zomato",
  "swiggy",
  "netflix",
  "makemytrip",
  "uber",
  "ola",
  "irctc",
  "redbus",
  "dominos"
];

export function mapDatasetCategory(label: string): TransactionCategory {
  const normalized = label.trim().toLowerCase().replaceAll(" ", "_");
  const mapped = {
    emi: "emis",
    investment: "savings_investments"
  }[normalized] ?? normalized;

  if (!isTransactionCategory(mapped)) {
    throw new Error(`Unsupported classification category: ${label}`);
  }

  return mapped;
}

export function normalizeTransactionText(text: string) {
  return text
    .toLowerCase()
    .replace(/\|\s*ref:[a-z0-9-]+/gi, " ")
    .replace(/\|\s*amount:\s*inr\s*[\d,.]+/gi, " ")
    .replace(/\binr\s*[\d,.]+/gi, " ")
    .replace(/\btxn[a-z0-9]+\b/gi, " ")
    .replace(/[|/\\:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMerchantPattern(text: string) {
  const normalized = normalizeTransactionText(text).replace(leadingChannelTokens, "").trim();
  const merchantAnchor = merchantAnchors.find((anchor) => normalized.includes(anchor));

  if (normalized.length < 4 || genericPatternTexts.has(normalized)) {
    return undefined;
  }

  if (merchantAnchor) {
    return merchantAnchor;
  }

  return normalized;
}

export function parseClassificationDatasetCsv(rawCsv: string): ParsedClassificationExample[] {
  const records = parseCsvRecords(rawCsv).filter((record) => record.some(Boolean));
  const [headers, ...rows] = records;
  const textIndex = findHeaderIndex(headers, ["transaction_text", "transaction_text", "transaction text"]);
  const categoryIndex = findHeaderIndex(headers, ["category", "label"]);

  return rows
    .filter((row) => row[textIndex] && row[categoryIndex])
    .map((row) => {
      const originalText = row[textIndex];
      const category = mapDatasetCategory(row[categoryIndex]);

      return {
        originalText,
        normalizedText: normalizeTransactionText(originalText),
        category,
        sourceRowHash: `sha256:${createHash("sha256")
          .update(JSON.stringify({ originalText, category }))
          .digest("hex")}`
      };
    });
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  const index = normalizedHeaders.findIndex((header) => candidates.includes(header));

  if (index === -1) {
    throw new Error(`Missing classification dataset header: ${candidates.join(" or ")}`);
  }

  return index;
}
