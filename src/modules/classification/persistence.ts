import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  accounts,
  classificationDatasets,
  classificationExamples,
  classificationMemories,
  classificationRules,
  transactions
} from "@/db/schema";
import { classifyTransaction, isTransactionCategory } from "@/modules/classification/categories";
import {
  buildTokenSignature,
  isLearnableTokenSignature,
  tokenizeTransactionMemory
} from "@/modules/classification/classification-memory";
import {
  extractMerchantPattern,
  normalizeTransactionText,
  parseClassificationDatasetCsv
} from "@/modules/classification/dataset-ingestion";
import type {
  TransactionCategory,
  TransactionCategorySource
} from "@/modules/classification/categories";

type Db = PostgresJsDatabase<Record<string, unknown>>;

type StoredRule = typeof classificationRules.$inferSelect;
type StoredMemory = typeof classificationMemories.$inferSelect;
type ClassificationMemorySource = "manual_override" | "ai_import" | "imported_memory";
const legacyMemoryOwnerUserId = "legacy-local-user";
type ClassificationMemoryExport = {
  schemaVersion: 1;
  exportedAt: string;
  memories: Array<{
    tokenSignature: string;
    category: TransactionCategory;
    source: ClassificationMemorySource;
    priority: number;
    supportCount: number;
  }>;
};

export async function importClassificationDataset(
  db: Db,
  input: {
    name: string;
    sourcePath: string;
  }
) {
  const rawCsv = await readFile(input.sourcePath, "utf8");
  const examples = parseClassificationDatasetCsv(rawCsv);
  const checksum = `sha256:${createHash("sha256").update(rawCsv).digest("hex")}`;
  const [existingDataset] = await db
    .select()
    .from(classificationDatasets)
    .where(
      sql`${classificationDatasets.sourcePath} = ${input.sourcePath} AND ${classificationDatasets.checksum} = ${checksum}`
    );

  const dataset =
    existingDataset ??
    (
      await db
        .insert(classificationDatasets)
        .values({
          id: randomUUID(),
          name: input.name,
          sourcePath: input.sourcePath,
          checksum,
          importedRowCount: examples.length
        })
        .returning()
    )[0];

  if (examples.length > 0) {
    if (!existingDataset) {
      await db.insert(classificationExamples).values(
        examples.map((example) => ({
          id: randomUUID(),
          datasetId: dataset.id,
          originalText: example.originalText,
          normalizedText: example.normalizedText,
          category: example.category,
          sourceRowHash: example.sourceRowHash
        }))
      );
    }

    for (const example of examples) {
      const pattern = extractMerchantPattern(example.originalText);

      if (pattern) {
        await upsertClassificationRule(db, {
          pattern,
          category: example.category,
          source: "seed_dataset",
          priority: 50
        });
      }
    }
  }

  return dataset;
}

export async function seedLocalClassificationKnowledge(db: Db) {
  await importClassificationDataset(db, {
    name: "test_transactions",
    sourcePath: "assets/datasets/test_transactions.csv"
  });
  await importClassificationDataset(db, {
    name: "financial_transaction_test",
    sourcePath: "assets/datasets/financial_transaction_test.csv"
  });
  await backfillNonManualTransactions(db);
}

export async function classifyWithStoredRules(db: Db, description: string) {
  const normalizedText = normalizeTransactionText(description);
  const rules = await db.select().from(classificationRules);
  const matchedRule = rules
    .filter((rule) => normalizedText.includes(normalizeTransactionText(rule.pattern)))
    .sort(compareRules)[0];

  if (matchedRule) {
    await db
      .update(classificationRules)
      .set({ lastMatchedAt: new Date() })
      .where(sql`${classificationRules.id} = ${matchedRule.id}`);

    return {
      category: matchedRule.category as TransactionCategory,
      categorySource: ruleSourceToCategorySource(matchedRule.source)
    };
  }

  return classifyTransaction(description);
}

export async function classifyWithClassificationMemory(
  db: Db,
  description: string,
  ownerUserId = legacyMemoryOwnerUserId
) {
  const normalizedText = normalizeTransactionText(description);
  const tokenSignature = buildTokenSignature(tokenizeTransactionMemory(description));
  const matches = await db
    .select()
    .from(classificationMemories)
    .where(
      sql`${classificationMemories.ownerUserId} = ${ownerUserId}
        AND ${classificationMemories.supersededAt} IS NULL
        AND (
          ${classificationMemories.normalizedText} = ${normalizedText}
          OR ${classificationMemories.tokenSignature} = ${tokenSignature}
        )`
    );

  return resolveMemoryClassification(db, matches);
}

export async function learnClassificationMemory(
  db: Db,
  input: {
    description: string;
    category: TransactionCategory;
    source: ClassificationMemorySource;
    ownerUserId?: string;
  }
) {
  const ownerUserId = input.ownerUserId ?? legacyMemoryOwnerUserId;
  const normalizedText = normalizeTransactionText(input.description);
  const tokenSignature = buildTokenSignature(tokenizeTransactionMemory(input.description));

  if (!isLearnableTokenSignature(tokenSignature)) {
    return undefined;
  }

  const priority = memorySourcePriority(input.source);
  if (input.source === "manual_override") {
    await db
      .update(classificationMemories)
      .set({
        supersededAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        sql`${classificationMemories.ownerUserId} = ${ownerUserId}
          AND ${classificationMemories.tokenSignature} = ${tokenSignature}
          AND ${classificationMemories.supersededAt} IS NULL
          AND ${classificationMemories.category} <> ${input.category}
          AND ${classificationMemories.priority} < ${priority}`
      );
  }

  const [memory] = await db
    .insert(classificationMemories)
    .values({
      id: randomUUID(),
      ownerUserId,
      normalizedText,
      tokenSignature,
      category: input.category,
      source: input.source,
      priority,
      supportCount: 1
    })
    .onConflictDoUpdate({
      target: [
        classificationMemories.ownerUserId,
        classificationMemories.tokenSignature,
        classificationMemories.source
      ],
      set: {
        normalizedText,
        category: input.category,
        priority,
        supportCount: sql`${classificationMemories.supportCount} + 1`,
        supersededAt: null,
        updatedAt: new Date()
      }
    })
    .returning();

  return memory;
}

export async function exportClassificationMemory(
  db: Db,
  ownerUserId = legacyMemoryOwnerUserId
): Promise<ClassificationMemoryExport> {
  const memories = await db
    .select()
    .from(classificationMemories)
    .where(
      sql`${classificationMemories.ownerUserId} = ${ownerUserId}
        AND ${classificationMemories.supersededAt} IS NULL`
    );

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    memories: memories.map((memory) => ({
      tokenSignature: memory.tokenSignature,
      category: memory.category as TransactionCategory,
      source: memory.source as ClassificationMemorySource,
      priority: memory.priority,
      supportCount: memory.supportCount
    }))
  };
}

export async function importClassificationMemory(db: Db, payload: unknown, ownerUserId = legacyMemoryOwnerUserId) {
  const rows = parseClassificationMemoryPayload(payload);
  let importedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    if (!isValidClassificationMemoryImportRow(row)) {
      skippedCount += 1;
      continue;
    }

    await upsertClassificationMemoryRow(db, {
      ...row,
      ownerUserId,
      priority: memorySourcePriority(row.source)
    });
    importedCount += 1;
  }

  return { importedCount, skippedCount };
}

export async function learnManualClassificationRule(
  db: Db,
  input: {
    description: string;
    category: TransactionCategory;
    ownerUserId?: string;
  }
) {
  const memory = await learnClassificationMemory(db, {
    description: input.description,
    category: input.category,
    source: "manual_override",
    ownerUserId: input.ownerUserId
  });

  if (memory) {
    await backfillMatchingTransactionsByMemory(db, memory);
  }

  return memory;
}

export async function learnAiImportClassificationRule(
  db: Db,
  input: {
    merchantKeyword: string;
    category: TransactionCategory;
  }
) {
  const pattern = input.merchantKeyword.trim().toUpperCase();

  if (pattern.length < 2) {
    return undefined;
  }

  const [rule] = await upsertClassificationRule(db, {
    pattern,
    category: input.category,
    source: "ai_import",
    priority: 25
  });

  return rule;
}

async function resolveMemoryClassification(db: Db, memories: StoredMemory[]) {
  if (memories.length === 0) {
    return undefined;
  }

  const sortedMemories = [...memories].sort(compareMemories);
  const highestPriority = sortedMemories[0].priority;
  const highestPriorityMemories = sortedMemories.filter((memory) => memory.priority === highestPriority);
  const categories = new Set(highestPriorityMemories.map((memory) => memory.category));

  if (categories.size !== 1) {
    return undefined;
  }

  const [matchedMemory] = highestPriorityMemories;
  await db
    .update(classificationMemories)
    .set({ lastMatchedAt: new Date(), updatedAt: new Date() })
    .where(sql`${classificationMemories.id} = ${matchedMemory.id}`);

  return {
    category: matchedMemory.category as TransactionCategory,
    categorySource: memorySourceToCategorySource(matchedMemory.source)
  };
}

async function upsertClassificationMemoryRow(
  db: Db,
  input: {
    ownerUserId: string;
    tokenSignature: string;
    category: TransactionCategory;
    source: ClassificationMemorySource;
    priority: number;
    supportCount: number;
  }
) {
  if (input.source === "manual_override") {
    await db
      .update(classificationMemories)
      .set({
        supersededAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        sql`${classificationMemories.ownerUserId} = ${input.ownerUserId}
          AND ${classificationMemories.tokenSignature} = ${input.tokenSignature}
          AND ${classificationMemories.supersededAt} IS NULL
          AND ${classificationMemories.category} <> ${input.category}
          AND ${classificationMemories.priority} < ${input.priority}`
      );
  }

  await db
    .insert(classificationMemories)
    .values({
      id: randomUUID(),
      ownerUserId: input.ownerUserId,
      normalizedText: memoryImportNormalizedText(input.tokenSignature),
      tokenSignature: input.tokenSignature,
      category: input.category,
      source: input.source,
      priority: input.priority,
      supportCount: input.supportCount
    })
    .onConflictDoUpdate({
      target: [
        classificationMemories.ownerUserId,
        classificationMemories.tokenSignature,
        classificationMemories.source
      ],
      set: {
        normalizedText: memoryImportNormalizedText(input.tokenSignature),
        category: input.category,
        priority: input.priority,
        supportCount: sql`greatest(${classificationMemories.supportCount}, ${input.supportCount})`,
        supersededAt: null,
        updatedAt: new Date()
      }
    });
}

export async function backfillNonManualTransactions(db: Db) {
  const ledgerRows = await db.select().from(transactions);

  for (const transaction of ledgerRows) {
    if (transaction.categorySource === "manual") {
      continue;
    }

    const classification = await classifyWithStoredRules(db, transaction.description);

    await db
      .update(transactions)
      .set({
        category: classification.category,
        categorySource: classification.categorySource
      })
      .where(sql`${transactions.id} = ${transaction.id}`);
  }
}

async function upsertClassificationRule(
  db: Db,
  input: {
    pattern: string;
    category: TransactionCategory;
    source: "seed_dataset" | "manual_override" | "ai_import" | "system";
    priority: number;
  }
) {
  return db
    .insert(classificationRules)
    .values({
      id: randomUUID(),
      pattern: input.pattern,
      category: input.category,
      source: input.source,
      priority: input.priority,
      supportCount: 1
    })
    .onConflictDoUpdate({
      target: [classificationRules.pattern, classificationRules.source],
      set: {
        category: input.category,
        priority: input.priority,
        supportCount: sql`${classificationRules.supportCount} + 1`
      }
    })
    .returning();
}

async function backfillMatchingTransactions(db: Db, rule: StoredRule) {
  const ledgerRows = await db.select().from(transactions);
  const categorySource = ruleSourceToCategorySource(rule.source);
  const matches = ledgerRows.filter(
    (transaction) =>
      transaction.categorySource !== "manual" &&
      normalizeTransactionText(transaction.description).includes(rule.pattern)
  );

  for (const transaction of matches) {
    await db
      .update(transactions)
      .set({
        category: rule.category,
        categorySource
      })
      .where(sql`${transactions.id} = ${transaction.id}`);
  }
}

function compareRules(left: StoredRule, right: StoredRule) {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return right.pattern.length - left.pattern.length;
}

async function backfillMatchingTransactionsByMemory(db: Db, memory: StoredMemory) {
  const ledgerRows = await db
    .select()
    .from(transactions)
    .where(
      sql`${transactions.accountId} IN (
        SELECT ${accounts.id}
        FROM ${accounts}
        WHERE ${accounts.ownerUserId} = ${memory.ownerUserId}
      )`
    );
  const categorySource = memorySourceToCategorySource(memory.source);
  const matches = ledgerRows.filter((transaction) => {
    if (transaction.categorySource === "manual") {
      return false;
    }

    const normalizedText = normalizeTransactionText(transaction.description);
    const tokenSignature = buildTokenSignature(tokenizeTransactionMemory(transaction.description));

    return normalizedText === memory.normalizedText || tokenSignature === memory.tokenSignature;
  });

  for (const transaction of matches) {
    await db
      .update(transactions)
      .set({
        category: memory.category,
        categorySource
      })
      .where(sql`${transactions.id} = ${transaction.id}`);
  }
}

function compareMemories(left: StoredMemory, right: StoredMemory) {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  return right.supportCount - left.supportCount;
}

function memorySourcePriority(source: ClassificationMemorySource) {
  if (source === "manual_override") {
    return 100;
  }

  return 25;
}

function memoryImportNormalizedText(tokenSignature: string) {
  return `token:${tokenSignature}`;
}

function parseClassificationMemoryPayload(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid classification memory payload");
  }

  const record = payload as { schemaVersion?: unknown; memories?: unknown };
  if (record.schemaVersion !== 1 || !Array.isArray(record.memories)) {
    throw new Error("Unsupported classification memory schema");
  }

  return record.memories;
}

function isValidClassificationMemoryImportRow(
  row: unknown
): row is {
  tokenSignature: string;
  category: TransactionCategory;
  source: ClassificationMemorySource;
  priority: number;
  supportCount: number;
} {
  if (typeof row !== "object" || row === null) {
    return false;
  }

  const record = row as Record<string, unknown>;
  return (
    typeof record.tokenSignature === "string" &&
    isLearnableTokenSignature(record.tokenSignature) &&
    typeof record.category === "string" &&
    isTransactionCategory(record.category) &&
    typeof record.source === "string" &&
    isClassificationMemorySource(record.source) &&
    typeof record.priority === "number" &&
    Number.isInteger(record.priority) &&
    record.priority > 0 &&
    typeof record.supportCount === "number" &&
    Number.isInteger(record.supportCount) &&
    record.supportCount > 0
  );
}

function isClassificationMemorySource(source: string): source is ClassificationMemorySource {
  return source === "manual_override" || source === "ai_import" || source === "imported_memory";
}

function memorySourceToCategorySource(source: string): TransactionCategorySource {
  if (source === "ai_import") {
    return "ai";
  }

  return "learned_rule";
}

function ruleSourceToCategorySource(source: string): TransactionCategorySource {
  if (source === "manual_override") {
    return "learned_rule";
  }

  if (source === "seed_dataset") {
    return "seed_rule";
  }

  if (source === "ai_import") {
    return "ai";
  }

  return "system_rule";
}
