import { normalizeTransactionText } from "@/modules/classification/dataset-ingestion";

const noiseTokens = new Set([
  "upi",
  "neft",
  "imps",
  "mmt",
  "inf",
  "inft",
  "rtgs",
  "ach",
  "bil",
  "cms",
  "ref",
  "utr",
  "txn",
  "transaction",
  "transfer",
  "to",
  "from",
  "self",
  "ac",
  "acct",
  "account",
  "amount",
  "inr",
  "rs",
  "order",
  "payment",
  "pay",
  "paid",
  "debit",
  "credit"
]);

const genericSignatures = new Set(["", "transfer", "self", "transfer|self"]);

export function tokenizeTransactionMemory(text: string) {
  return normalizeTransactionText(text)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\butr[a-z0-9]+\b/g, " ")
    .replace(/\b[a-z]{2,}\d{5,}[a-z0-9]*\b/g, " ")
    .replace(/\b[a-z0-9]*\d{6,}[a-z0-9]*\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/\d+$/g, ""))
    .filter((token) => token.length >= 3)
    .filter((token) => !noiseTokens.has(token));
}

export function buildTokenSignature(tokens: string[]) {
  const uniqueTokens = Array.from(new Set(tokens)).sort();
  const signature = uniqueTokens.join("|");

  return isLearnableTokenSignature(signature) ? signature : "";
}

export function isLearnableTokenSignature(signature: string) {
  if (genericSignatures.has(signature)) {
    return false;
  }

  return signature.split("|").some((token) => token.length >= 4);
}
