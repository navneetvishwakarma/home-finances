import { beforeEach, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const createManualTransaction = vi.fn();
const runIciciCsvImport = vi.fn();

vi.mock("next/navigation", () => ({
  redirect
}));

vi.mock("@/db/client", () => ({
  getMigratedDatabase: vi.fn(async () => ({ db: true }))
}));

vi.mock("@/modules/auth/session", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: "user-1" }))
}));

vi.mock("@/modules/auth/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

vi.mock("@/modules/imports/import-flow", () => ({
  runIciciCsvImport
}));

vi.mock("@/modules/imports/persistence", () => ({
  createManualTransaction,
  deleteImportBatch: vi.fn(),
  deleteTransaction: vi.fn(),
  updateTransactionCategory: vi.fn(),
  updateTransactionDetails: vi.fn()
}));

beforeEach(() => {
  redirect.mockClear();
  createManualTransaction.mockReset();
  runIciciCsvImport.mockReset();
});

test("createManualTransactionAction passes through an optional running balance", async () => {
  createManualTransaction.mockResolvedValueOnce({
    transactionDate: "2026-04-10"
  });
  const { createManualTransactionAction } = await import("@/app/actions");

  await expect(
    createManualTransactionAction(
      formData({
        accountId: "account-1",
        importBatchId: "import-1",
        transactionDate: "2026-04-10",
        description: "Cash groceries",
        direction: "outgoing",
        amount: "1800.00",
        runningBalance: "58,200.00",
        category: "food",
        tags: "cash, weekly"
      })
    )
  ).rejects.toThrow("REDIRECT:/?month=2026-04&success=Transaction%20added");

  expect(createManualTransaction).toHaveBeenCalledWith(
    { db: true },
    expect.objectContaining({
      accountId: "account-1",
      amountMinorUnits: 180000,
      runningBalanceMinorUnits: 5820000,
      ownerUserId: "user-1"
    })
  );
});

test("importIciciStatement includes skipped duplicate rows in the success redirect", async () => {
  runIciciCsvImport.mockResolvedValueOnce({
    importBatch: {
      skippedRowCount: 3
    },
    transactions: [
      {
        transactionDate: "2026-04-30"
      }
    ]
  });
  const { importIciciStatement } = await import("@/app/actions");

  await expect(
    importIciciStatement(
      formData({
        accountDisplayName: "Primary account",
        statements: new File(["csv"], "overlap.csv", { type: "text/csv" }) as any
      })
    )
  ).rejects.toThrow(
    "REDIRECT:/?month=2026-04&success=Import%20complete%3A%201%20row%20imported%2C%203%20duplicate%20rows%20skipped"
  );
});

function formData(values: Record<string, string | File>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}
