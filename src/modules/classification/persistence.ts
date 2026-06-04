import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  classificationDatasets,
  classificationExamples,
  classificationRules,
  transactions
} from "@/db/schema";
import { classifyTransaction } from "@/modules/classification/categories";
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

export async function learnManualClassificationRule(
  db: Db,
  input: {
    description: string;
    category: TransactionCategory;
  }
) {
  const pattern = extractMerchantPattern(input.description);

  if (!pattern) {
    return undefined;
  }

  const [rule] = await upsertClassificationRule(db, {
    pattern,
    category: input.category,
    source: "manual_override",
    priority: 100
  });

  await backfillMatchingTransactions(db, rule);

  return rule;
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
