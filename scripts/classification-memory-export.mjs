import { writeFile } from "node:fs/promises";
import postgres from "postgres";

const outPath = readFlag("--out");

if (!outPath) {
  console.error("--out is required");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
const ownerUserId = process.env.CLASSIFICATION_MEMORY_OWNER_USER_ID || "legacy-local-user";

if (!databaseUrl) {
  console.error("DATABASE_URL is required to export classification memory.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  const rows = await sql`
    SELECT
      token_signature,
      category,
      source,
      priority,
      support_count
    FROM classification_memories
    WHERE superseded_at IS NULL
      AND owner_user_id = ${ownerUserId}
    ORDER BY priority DESC, token_signature ASC
  `;
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    memories: rows.map((row) => ({
      tokenSignature: row.token_signature,
      category: row.category,
      source: row.source,
      priority: row.priority,
      supportCount: row.support_count
    }))
  };

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Exported ${payload.memories.length} classification memories to ${outPath}`);
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
