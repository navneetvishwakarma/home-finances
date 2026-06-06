import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import {
  accounts,
  accountStatementTemplates,
  classificationDatasets,
  classificationExamples,
  classificationMemories,
  classificationRules,
  importBatches,
  statementTallies,
  transactions,
  transferMatches
} from "@/db/schema";
import {
  createAccount,
  createImportBatch,
  persistParsedTransactions,
  updateTransactionCategory
} from "@/modules/imports/persistence";
import {
  classifyWithClassificationMemory,
  exportClassificationMemory,
  importClassificationMemory,
  learnClassificationMemory,
  importClassificationDataset,
  seedLocalClassificationKnowledge
} from "@/modules/classification/persistence";

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDb("classification knowledge persistence", () => {
  const client = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.delete(transferMatches);
    await db.delete(statementTallies);
    await db.delete(transactions);
    await db.delete(importBatches);
    await db.delete(accountStatementTemplates);
    await db.delete(accounts);
    await db.delete(classificationMemories);
    await db.delete(classificationRules);
    await db.delete(classificationExamples);
    await db.delete(classificationDatasets);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.APP_LOG_LEVEL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  test("manual categorization creates learned memory and backfills non-manual matches", async () => {
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
          description: "UPI GROCERY STORE ORDER999",
          withdrawalAmount: "1300.00",
          depositAmount: "0.00",
          balance: "8700.00",
          rawRow: {
            "S No.": "2",
            "Transaction Remarks": "UPI GROCERY STORE ORDER999",
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
    const learnedMemories = await db.select().from(classificationMemories);

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
    const learnedMemory = learnedMemories.find(
      (memory) =>
        memory.tokenSignature === "grocery|store" &&
        memory.category === "food" &&
        memory.source === "manual_override"
    );

    expect(learnedMemory?.supportCount).toBeGreaterThanOrEqual(1);
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

  test("uses AI import categorization for weak fallback rows and stores reusable AI memory", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify([
                        { rowId: "row-1", merchantKeyword: "BIGBASKET", category: "food" }
                      ])
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );
    const account = await createAccount(db, {
      displayName: "ICICI Savings AI Rule Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "ai-rule.csv",
      fileFingerprint: "sha256:ai-rule",
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
          description: "UPI/BIGBASKET/ORDER123",
          withdrawalAmount: "1200.00",
          depositAmount: "0.00",
          balance: "10000.00",
          rawRow: {
            "S No.": "1",
            "Transaction Remarks": "UPI/BIGBASKET/ORDER123",
            "Withdrawal Amount(INR)": "1200.00",
            "Deposit Amount(INR)": "0.00",
            "Balance(INR)": "10000.00"
          }
        }
      ]
    });
    const memories = await db.select().from(classificationMemories);

    expect(transaction).toMatchObject({
      category: "food",
      categorySource: "ai"
    });
    expect(memories).toContainEqual(
      expect.objectContaining({
        normalizedText: "upi bigbasket order123",
        tokenSignature: "bigbasket",
        category: "food",
        source: "ai_import"
      })
    );

    const secondImportBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "ai-rule-reuse.csv",
      fileFingerprint: "sha256:ai-rule-reuse",
      rawSource: "csv-content",
      status: "uploaded"
    });
    const [reusedTransaction] = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: secondImportBatch.id,
      rows: [
        {
          valueDate: "2026-04-02",
          transactionDate: "2026-04-02",
          description: "UPI/BIGBASKET/ORDER999",
          withdrawalAmount: "900.00",
          depositAmount: "0.00",
          balance: "9100.00",
          rawRow: {
            "S No.": "2",
            "Transaction Remarks": "UPI/BIGBASKET/ORDER999",
            "Withdrawal Amount(INR)": "900.00",
            "Deposit Amount(INR)": "0.00"
          }
        }
      ]
    });

    expect(reusedTransaction).toMatchObject({
      category: "food",
      categorySource: "ai"
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("uses local classification memory for weak rows before Gemini even when the API key is missing", async () => {
    await db.delete(classificationMemories);
    delete process.env.GEMINI_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    await learnClassificationMemory(db, {
      description: "UPI/PETSHOP/ORDER123",
      category: "shopping",
      source: "manual_override"
    });
    const account = await createAccount(db, {
      displayName: "ICICI Savings Local Memory Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "local-memory.csv",
      fileFingerprint: "sha256:local-memory",
      rawSource: "csv-content",
      status: "uploaded"
    });

    const persisted = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      rows: [
        {
          valueDate: "2026-04-01",
          transactionDate: "2026-04-01",
          description: "UPI PETSHOP ORDER999",
          withdrawalAmount: "1200.00",
          depositAmount: "0.00",
          balance: "10000.00",
          rawRow: {
            "S No.": "1",
            "Transaction Remarks": "UPI PETSHOP ORDER999",
            "Withdrawal Amount(INR)": "1200.00",
            "Deposit Amount(INR)": "0.00"
          }
        }
      ]
    });

    expect(persisted[0]).toMatchObject({
      category: "shopping",
      categorySource: "learned_rule"
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("logs import classification counts without raw descriptions, account ids, CSVs, or API keys", async () => {
    await db.delete(classificationMemories);
    process.env.APP_LOG_LEVEL = "debug";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify([
                        { rowId: "row-1", merchantKeyword: "SENSITIVE SHOP", category: "shopping" }
                      ])
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200 }
        )
      )
    );
    const account = await createAccount(db, {
      displayName: "ICICI Savings Logging Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "logging.csv",
      fileFingerprint: "sha256:logging",
      rawSource: "csv-content-with-sensitive-shop",
      status: "uploaded"
    });

    await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      rows: [
        {
          valueDate: "2026-04-01",
          transactionDate: "2026-04-01",
          description: "UPI/SENSITIVE SHOP/ORDER123",
          withdrawalAmount: "1200.00",
          depositAmount: "0.00",
          balance: "10000.00",
          rawRow: {
            "S No.": "1",
            "Transaction Remarks": "UPI/SENSITIVE SHOP/ORDER123",
            "Withdrawal Amount(INR)": "1200.00",
            "Deposit Amount(INR)": "0.00"
          }
        }
      ]
    });

    const logs = vi
      .mocked(console.info)
      .mock.calls.map((call) => JSON.parse(String(call[0])))
      .filter((payload) => payload.logger === "import-classification");
    const serializedLogs = JSON.stringify(logs);

    expect(logs).toEqual([
      expect.objectContaining({
        message: "import.classification.pre_ai",
        weakCandidateCount: 1,
        localMemoryHitCount: 0,
        aiRequiredCount: 1
      }),
      expect.objectContaining({
        message: "import.classification.post_ai",
        aiClassificationCount: 1,
        storedMemoryCount: 1
      })
    ]);
    expect(serializedLogs).not.toContain("UPI/SENSITIVE SHOP/ORDER123");
    expect(serializedLogs).not.toContain("csv-content-with-sensitive-shop");
    expect(serializedLogs).not.toContain(account.id);
    expect(serializedLogs).not.toContain("test-gemini-key");
  });

  test("stores AI classification memory and reuses it for similar descriptions", async () => {
    await db.delete(classificationMemories);

    const learned = await learnClassificationMemory(db, {
      description: "UPI/BIGBASKET/ORDER123",
      category: "food",
      source: "ai_import"
    });
    const classification = await classifyWithClassificationMemory(db, "UPI BIGBASKET ORDER999");

    expect(learned).toEqual(
      expect.objectContaining({
        normalizedText: "upi bigbasket order123",
        tokenSignature: "bigbasket",
        category: "food",
        source: "ai_import",
        priority: 25,
        supportCount: 1,
        supersededAt: null
      })
    );
    expect(classification).toEqual({
      category: "food",
      categorySource: "ai"
    });
  });

  test("manual classification memory supersedes conflicting AI memory for the same signature", async () => {
    await db.delete(classificationMemories);

    await learnClassificationMemory(db, {
      description: "UPI/BIGBASKET/ORDER123",
      category: "shopping",
      source: "ai_import"
    });
    await learnClassificationMemory(db, {
      description: "UPI BIGBASKET ORDER999",
      category: "food",
      source: "manual_override"
    });

    const memories = await db.select().from(classificationMemories);
    const classification = await classifyWithClassificationMemory(db, "UPI/BIGBASKET/ORDER555");

    expect(memories).toContainEqual(
      expect.objectContaining({
        tokenSignature: "bigbasket",
        category: "shopping",
        source: "ai_import",
        supersededAt: expect.any(Date)
      })
    );
    expect(memories).toContainEqual(
      expect.objectContaining({
        tokenSignature: "bigbasket",
        category: "food",
        source: "manual_override",
        supersededAt: null
      })
    );
    expect(classification).toEqual({
      category: "food",
      categorySource: "learned_rule"
    });
  });

  test("resolves exact and token memory matches by priority together", async () => {
    await db.delete(classificationMemories);

    await learnClassificationMemory(db, {
      description: "UPI/BIGBASKET/ORDER999",
      category: "food",
      source: "manual_override"
    });
    await learnClassificationMemory(db, {
      description: "UPI/BIGBASKET/ORDER123",
      category: "shopping",
      source: "ai_import"
    });

    const classification = await classifyWithClassificationMemory(db, "UPI/BIGBASKET/ORDER123");

    expect(classification).toEqual({
      category: "food",
      categorySource: "learned_rule"
    });
  });

  test("keeps classification memory scoped to the account owner", async () => {
    await db.delete(classificationMemories);
    await learnClassificationMemory(db, {
      description: "UPI/OWNER SHOP/ORDER123",
      category: "food",
      source: "manual_override",
      ownerUserId: "owner-a"
    });
    await learnClassificationMemory(db, {
      description: "UPI/OWNER SHOP/ORDER123",
      category: "shopping",
      source: "manual_override",
      ownerUserId: "owner-b"
    });

    await expect(classifyWithClassificationMemory(db, "UPI OWNER SHOP ORDER999", "owner-a")).resolves.toEqual({
      category: "food",
      categorySource: "learned_rule"
    });
    await expect(classifyWithClassificationMemory(db, "UPI OWNER SHOP ORDER999", "owner-b")).resolves.toEqual({
      category: "shopping",
      categorySource: "learned_rule"
    });
  });

  test("does not classify locally when active memories for a signature have equal priority conflicts", async () => {
    await db.delete(classificationMemories);

    await db.insert(classificationMemories).values([
      {
        id: randomUUID(),
        ownerUserId: "legacy-local-user",
        normalizedText: "upi conflict merchant one",
        tokenSignature: "conflict|merchant",
        category: "food",
        source: "ai_import",
        priority: 25,
        supportCount: 1
      },
      {
        id: randomUUID(),
        ownerUserId: "legacy-local-user",
        normalizedText: "upi conflict merchant two",
        tokenSignature: "conflict|merchant",
        category: "shopping",
        source: "imported_memory",
        priority: 25,
        supportCount: 1
      }
    ]);

    await expect(classifyWithClassificationMemory(db, "UPI/CONFLICT/MERCHANT/ORDER123")).resolves.toBeUndefined();
  });

  test("exports and imports portable classification memory without raw account or secret data", async () => {
    await db.delete(classificationMemories);

    await learnClassificationMemory(db, {
      description: "UPI/MANUAL SHOP/ORDER123",
      category: "shopping",
      source: "manual_override"
    });
    await learnClassificationMemory(db, {
      description: "UPI/AI CAFE/ORDER123",
      category: "food",
      source: "ai_import"
    });

    const exported = await exportClassificationMemory(db);
    const serialized = JSON.stringify(exported);

    expect(exported).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        exportedAt: expect.any(String),
        memories: expect.arrayContaining([
          expect.objectContaining({
            tokenSignature: "manual|shop",
            category: "shopping",
            source: "manual_override",
            priority: 100,
            supportCount: 1
          }),
          expect.objectContaining({
            tokenSignature: "cafe",
            category: "food",
            source: "ai_import",
            priority: 25,
            supportCount: 1
          })
        ])
      })
    );
    expect(serialized).not.toContain("accountId");
    expect(serialized).not.toContain("ownerUserId");
    expect(serialized).not.toContain("rawSource");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("UPI/MANUAL SHOP/ORDER123");
    expect(serialized).not.toContain("manual shop");

    await db.delete(classificationMemories);
    const result = await importClassificationMemory(db, exported);
    const classification = await classifyWithClassificationMemory(db, "UPI MANUAL SHOP ORDER999");

    expect(result).toEqual({ importedCount: 2, skippedCount: 0 });
    for (const memory of exported.memories) {
      expect(memory).not.toHaveProperty("normalizedText");
    }
    expect(classification).toEqual({
      category: "shopping",
      categorySource: "learned_rule"
    });
  });

  test("imports valid memory only and keeps manual precedence over conflicting AI memory", async () => {
    await db.delete(classificationMemories);

    const result = await importClassificationMemory(db, {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      memories: [
        {
          normalizedText: "upi precedence merchant order123",
          tokenSignature: "merchant|precedence",
          category: "food",
          source: "ai_import",
          priority: 25,
          supportCount: 1
        },
        {
          normalizedText: "upi precedence merchant order999",
          tokenSignature: "merchant|precedence",
          category: "shopping",
          source: "manual_override",
          priority: 100,
          supportCount: 1
        },
        {
          normalizedText: "upi invalid merchant",
          tokenSignature: "invalid|merchant",
          category: "not_real",
          source: "imported_memory",
          priority: 25,
          supportCount: 1
        },
        {
          normalizedText: "neft transfer to self",
          tokenSignature: "",
          category: "transfers",
          source: "imported_memory",
          priority: 25,
          supportCount: 1
        }
      ]
    });
    const memories = await db.select().from(classificationMemories);
    const classification = await classifyWithClassificationMemory(db, "UPI/PRECEDENCE/MERCHANT/ORDER555");

    expect(result).toEqual({ importedCount: 2, skippedCount: 2 });
    expect(memories).toHaveLength(2);
    expect(classification).toEqual({
      category: "shopping",
      categorySource: "learned_rule"
    });
  });

  test("derives imported memory priority from source instead of trusting payload priority", async () => {
    await db.delete(classificationMemories);

    const result = await importClassificationMemory(db, {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      memories: [
        {
          normalizedText: "upi priority tamper merchant order123",
          tokenSignature: "merchant|priority|tamper",
          category: "food",
          source: "imported_memory",
          priority: 1000,
          supportCount: 1
        },
        {
          normalizedText: "upi priority tamper merchant order999",
          tokenSignature: "merchant|priority|tamper",
          category: "shopping",
          source: "manual_override",
          priority: 100,
          supportCount: 1
        }
      ]
    });
    const memories = await db.select().from(classificationMemories);
    const classification = await classifyWithClassificationMemory(db, "UPI/PRIORITY/TAMPER/MERCHANT/ORDER555");

    expect(result).toEqual({ importedCount: 2, skippedCount: 0 });
    expect(memories).toContainEqual(
      expect.objectContaining({
        tokenSignature: "merchant|priority|tamper",
        source: "imported_memory",
        priority: 25,
        supersededAt: expect.any(Date)
      })
    );
    expect(classification).toEqual({
      category: "shopping",
      categorySource: "learned_rule"
    });
  });

  test("keeps learned and seed rules ahead of AI import categorization", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", vi.fn());
    await db.insert(classificationRules).values([
      {
        id: randomUUID(),
        pattern: "priority merchant learned",
        category: "shopping",
        source: "manual_override",
        priority: 100
      },
      {
        id: randomUUID(),
        pattern: "priority merchant seed",
        category: "education",
        source: "seed_dataset",
        priority: 50
      }
    ]);
    const account = await createAccount(db, {
      displayName: "ICICI Savings AI Priority Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "ai-priority.csv",
      fileFingerprint: "sha256:ai-priority",
      rawSource: "csv-content",
      status: "uploaded"
    });

    const persisted = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      rows: [
        {
          valueDate: "2026-04-01",
          transactionDate: "2026-04-01",
          description: "UPI PRIORITY MERCHANT LEARNED",
          withdrawalAmount: "1200.00",
          depositAmount: "0.00",
          balance: "10000.00",
          rawRow: { "S No.": "1", "Transaction Remarks": "UPI PRIORITY MERCHANT LEARNED" }
        },
        {
          valueDate: "2026-04-02",
          transactionDate: "2026-04-02",
          description: "UPI PRIORITY MERCHANT SEED",
          withdrawalAmount: "1300.00",
          depositAmount: "0.00",
          balance: "8700.00",
          rawRow: { "S No.": "2", "Transaction Remarks": "UPI PRIORITY MERCHANT SEED" }
        }
      ]
    });

    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "UPI PRIORITY MERCHANT LEARNED",
          category: "shopping",
          categorySource: "learned_rule"
        }),
        expect.objectContaining({
          description: "UPI PRIORITY MERCHANT SEED",
          category: "education",
          categorySource: "seed_rule"
        })
      ])
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  test("persists rule-based categories when configured AI is unavailable", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const account = await createAccount(db, {
      displayName: "ICICI Savings AI Fallback Test",
      providerLabel: "ICICI Bank",
      currency: "INR"
    });
    const importBatch = await createImportBatch(db, {
      accountId: account.id,
      sourceProfileId: "icici-bank-csv",
      filename: "ai-fallback.csv",
      fileFingerprint: "sha256:ai-fallback",
      rawSource: "csv-content",
      status: "uploaded"
    });

    const persisted = await persistParsedTransactions(db, {
      accountId: account.id,
      importBatchId: importBatch.id,
      rows: [
        {
          valueDate: "2026-04-01",
          transactionDate: "2026-04-01",
          description: "UPI AI FALLBACK MERCHANT",
          withdrawalAmount: "1200.00",
          depositAmount: "0.00",
          balance: "10000.00",
          rawRow: {
            "S No.": "1",
            "Transaction Remarks": "UPI AI FALLBACK MERCHANT",
            "Withdrawal Amount(INR)": "1200.00",
            "Deposit Amount(INR)": "0.00"
          }
        }
      ]
    });

    expect(persisted[0]).toMatchObject({
      category: "other",
      categorySource: "system_rule"
    });
    expect(persisted.aiClassificationFallback).toBe(true);
  });
});
