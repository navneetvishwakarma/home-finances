import { beforeEach, expect, test, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const createManualTransaction = vi.fn();

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
  runIciciCsvImport: vi.fn()
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

function formData(values: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}
