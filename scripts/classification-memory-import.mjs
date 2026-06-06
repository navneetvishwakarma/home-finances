import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const inputPath = readFlag("--in");

if (!inputPath) {
  console.error("--in is required");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
const ownerUserId = process.env.CLASSIFICATION_MEMORY_OWNER_USER_ID || "legacy-local-user";

if (!databaseUrl) {
  console.error("DATABASE_URL is required to import classification memory.");
  process.exit(1);
}

const categories = new Set([
  "income",
  "rent_home",
  "food",
  "transport",
  "utilities",
  "healthcare",
  "savings_investments",
  "emis",
  "debt_cards",
  "transfers",
  "fees_taxes",
  "shopping",
  "travel",
  "entertainment",
  "education",
  "other",
  "uncategorized"
]);
const sources = new Set(["manual_override", "ai_import", "imported_memory"]);
const genericSignatures = new Set(["", "transfer", "self", "transfer|self"]);

const payload = JSON.parse(await readFile(inputPath, "utf8"));
const rows = parsePayload(payload);
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
let importedCount = 0;
let skippedCount = 0;

try {
  for (const row of rows) {
    if (!isValidRow(row)) {
      skippedCount += 1;
      continue;
    }

    const priority = sourcePriority(row.source);

    if (row.source === "manual_override") {
      await sql`
        UPDATE classification_memories
        SET superseded_at = now(), updated_at = now()
        WHERE owner_user_id = ${ownerUserId}
          AND token_signature = ${row.tokenSignature}
          AND superseded_at IS NULL
          AND category <> ${row.category}
          AND priority < ${priority}
      `;
    }

    await sql`
      INSERT INTO classification_memories (
        id,
        owner_user_id,
        normalized_text,
        token_signature,
        category,
        source,
        priority,
        support_count
      )
      VALUES (
        ${randomUUID()},
        ${ownerUserId},
        ${normalizedTextForSignature(row.tokenSignature)},
        ${row.tokenSignature},
        ${row.category},
        ${row.source},
        ${priority},
        ${row.supportCount}
      )
      ON CONFLICT (owner_user_id, token_signature, source)
      DO UPDATE SET
        normalized_text = excluded.normalized_text,
        category = excluded.category,
        priority = excluded.priority,
        support_count = greatest(classification_memories.support_count, excluded.support_count),
        superseded_at = NULL,
        updated_at = now()
    `;
    importedCount += 1;
  }

  console.log(`Imported ${importedCount} classification memories. Skipped ${skippedCount}.`);
} finally {
  await sql.end();
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function parsePayload(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 || !Array.isArray(value.memories)) {
    throw new Error("Unsupported classification memory schema");
  }

  return value.memories;
}

function isValidRow(row) {
  return (
    row &&
    typeof row === "object" &&
    typeof row.tokenSignature === "string" &&
    isLearnableSignature(row.tokenSignature) &&
    typeof row.category === "string" &&
    categories.has(row.category) &&
    typeof row.source === "string" &&
    sources.has(row.source) &&
    Number.isInteger(row.priority) &&
    row.priority > 0 &&
    Number.isInteger(row.supportCount) &&
    row.supportCount > 0
  );
}

function isLearnableSignature(signature) {
  if (genericSignatures.has(signature)) {
    return false;
  }

  return signature.split("|").some((token) => token.length >= 4);
}

function sourcePriority(source) {
  return source === "manual_override" ? 100 : 25;
}

function normalizedTextForSignature(tokenSignature) {
  return `token:${tokenSignature}`;
}
