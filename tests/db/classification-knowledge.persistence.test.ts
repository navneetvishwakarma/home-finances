import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import {
  accounts,
  classificationDatasets,
  classificationExamples,
  classificationRules,
  importBatches,
  statementTallies,
  transactions
} from "@/db/schema";
import {
  createAccount,
  createImportBatch,
  persistParsedTransactions,
  updateTransactionCategory
} from "@/modules/imports/persistence";
import {
  importClassificationDataset,
  seedLocalClassificationKnowledge
} from "@/modules/classification/persistence";

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDb("classification knowledge persistence", () => {
  const client = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.delete(statementTallies);
    await db.delete(transactions);
    await db.delete(importBatches);
    await db.delete(accounts);
    await db.delete(classificationRules);
    await db.delete(classificationExamples);
    await db.delete(classificationDatasets);
  });

  afterAll(async () => {
    await client.end();
  });

  test("imports local labeled transaction datasets into examples and seed rules", async () => {
    const result = await importClassificationDataset(db, {
      name: "local-fixture",
      sourcePath: "assets/datasets/test_transactions.csv"
    });

    expect(result.importedRowCount).toBe(1000);

    const examples = await db
      .select()
      .from(classificationExamples)
      .where(eq(classificationExamples.datasetId, result.id));
    const rules = await db.select().from(classificationRules);

    expect(examples.length).toBe(1000);
    expect(examples).toContainEqual(
      expect.objectContaining({
        normalizedText: "credit card emi",
        category: "emis"
      })
    );
    expect(rules).toContainEqual(
      expect.objectContaining({
        pattern: "credit card emi",
        category: "emis",
        source: "seed_dataset"
      })
    );
  });

  test("uses seed rules for future imports before system fallback rules", async () => {
    await importClassificationDataset(db, {
      name: "title-case-fixture",
      sourcePath: "assets/datasets/financial_transaction_test.csv"
    });
    const account = await createAccount(db, {
      displayName: "ICICI Savings Seed Rule Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "seed-rule.csv",
      fileFingerprint: "sha256:seed-rule",
      rawSource: "csv-content",
      status: "uploaded"
    });

    const [transaction] = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      rows: [
        {
          valueDate: "2026-04-01",
          transactionDate: "2026-04-01",
          description: "HDFC home loan EMI",
          withdrawalAmount: "15000.00",
          depositAmount: "0.00",
          balance: "85000.00",
          rawRow: {
            "S No.": "1",
            "Transaction Remarks": "HDFC home loan EMI",
            "Withdrawal Amount(INR)": "15000.00",
            "Deposit Amount(INR)": "0.00"
          }
        }
      ]
    });

    expect(transaction).toMatchObject({
      category: "emis",
      categorySource: "seed_rule"
    });
  });

  test("manual categorization creates a learned rule and backfills non-manual matches", async () => {
    const account = await createAccount(db, {
      displayName: "ICICI Savings Learned Rule Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "learned-rule.csv",
      fileFingerprint: "sha256:learned-rule",
      rawSource: "csv-content",
      status: "uploaded"
    });
    const [first, second] = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      rows: [
        {
          valueDate: "2026-04-01",
          transactionDate: "2026-04-01",
          description: "UPI GROCERY STORE",
          withdrawalAmount: "1200.00",
          depositAmount: "0.00",
          balance: "10000.00",
          rawRow: {
            "S No.": "1",
            "Transaction Remarks": "UPI GROCERY STORE",
            "Withdrawal Amount(INR)": "1200.00",
            "Deposit Amount(INR)": "0.00"
          }
        },
        {
          valueDate: "2026-04-02",
          transactionDate: "2026-04-02",
          description: "UPI GROCERY STORE BRANCH",
          withdrawalAmount: "1300.00",
          depositAmount: "0.00",
          balance: "8700.00",
          rawRow: {
            "S No.": "2",
            "Transaction Remarks": "UPI GROCERY STORE BRANCH",
            "Withdrawal Amount(INR)": "1300.00",
            "Deposit Amount(INR)": "0.00"
          }
        }
      ]
    });

    await updateTransactionCategory(db, {
      transactionId: first.id,
      category: "food"
    });

    const refreshed = await db.select().from(transactions);
    const learnedRules = await db.select().from(classificationRules);

    expect(refreshed).toContainEqual(
      expect.objectContaining({
        id: first.id,
        category: "food",
        categorySource: "manual"
      })
    );
    expect(refreshed).toContainEqual(
      expect.objectContaining({
        id: second.id,
        category: "food",
        categorySource: "learned_rule"
      })
    );
    const learnedRule = learnedRules.find(
      (rule) =>
        rule.pattern === "grocery store" &&
        rule.category === "food" &&
        rule.source === "manual_override"
    );

    expect(learnedRule?.supportCount).toBeGreaterThanOrEqual(1);
  });

  test("seeds local datasets idempotently and backfills existing non-manual transactions", async () => {
    await db.delete(classificationRules);
    await db.delete(classificationExamples);
    await db.delete(classificationDatasets);
    const account = await createAccount(db, {
      displayName: "ICICI Savings Seed Backfill Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "seed-backfill.csv",
      fileFingerprint: "sha256:seed-backfill",
      rawSource: "csv-content",
      status: "uploaded"
    });
    const [transaction] = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      rows: [
        {
          valueDate: "2026-04-01",
          transactionDate: "2026-04-01",
          description: "HDFC home loan EMI",
          withdrawalAmount: "15000.00",
          depositAmount: "0.00",
          balance: "85000.00",
          rawRow: {
            "S No.": "1",
            "Transaction Remarks": "HDFC home loan EMI",
            "Withdrawal Amount(INR)": "15000.00",
            "Deposit Amount(INR)": "0.00"
          }
        }
      ]
    });

    await seedLocalClassificationKnowledge(db);
    await seedLocalClassificationKnowledge(db);

    const datasets = await db.select().from(classificationDatasets);
    const refreshedRows = await db.select().from(transactions);

    expect(datasets).toHaveLength(2);
    expect(refreshedRows).toContainEqual(
      expect.objectContaining({
        id: transaction.id,
        category: "emis",
        categorySource: "seed_rule"
      })
    );
  });
});
