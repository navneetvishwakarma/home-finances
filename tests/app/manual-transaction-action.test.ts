import { beforeEach, expect, test, vi } from "vitest";
import { parseImportResults } from "@/modules/imports/import-results";

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const createManualTransaction = vi.fn();
const closeMonth = vi.fn();
const deactivateAccount = vi.fn();
const reactivateAccount = vi.fn();
const renameAccount = vi.fn();
const reopenMonth = vi.fn();
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
  closeMonth,
  deactivateAccount,
  deleteImportBatch: vi.fn(),
  deleteTransaction: vi.fn(),
  reactivateAccount,
  renameAccount,
  reopenMonth,
  updateTransactionCategory: vi.fn(),
  updateTransactionDetails: vi.fn()
}));

beforeEach(() => {
  redirect.mockClear();
  closeMonth.mockReset();
  createManualTransaction.mockReset();
  deactivateAccount.mockReset();
  reactivateAccount.mockReset();
  renameAccount.mockReset();
  reopenMonth.mockReset();
  runIciciCsvImport.mockReset();
});

test("closeMonthAction closes the selected month and redirects back to it", async () => {
  closeMonth.mockResolvedValueOnce({ month: "2026-04", status: "closed" });
  const { closeMonthAction } = await import("@/app/actions");

  await expect(
    closeMonthAction(formData({ month: "2026-04", note: "Reviewed" }))
  ).rejects.toThrow("REDIRECT:/?month=2026-04&success=Month%20closed");

  expect(closeMonth).toHaveBeenCalledWith(
    { db: true },
    {
      month: "2026-04",
      note: "Reviewed",
      ownerUserId: "user-1"
    }
  );
});

test("reopenMonthAction reopens the selected month and redirects back to it", async () => {
  reopenMonth.mockResolvedValueOnce({ month: "2026-04", status: "reopened" });
  const { reopenMonthAction } = await import("@/app/actions");

  await expect(reopenMonthAction(formData({ month: "2026-04" }))).rejects.toThrow(
    "REDIRECT:/?month=2026-04&success=Month%20reopened"
  );

  expect(reopenMonth).toHaveBeenCalledWith(
    { db: true },
    {
      month: "2026-04",
      ownerUserId: "user-1"
    }
  );
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

test("renameAccountAction validates and renames the owned account", async () => {
  renameAccount.mockResolvedValueOnce({ id: "account-1", displayName: "Primary savings" });
  const { renameAccountAction } = await import("@/app/actions");

  await expect(
    renameAccountAction(
      formData({
        accountId: "account-1",
        displayName: "Primary savings"
      })
    )
  ).rejects.toThrow("REDIRECT:/?view=metadata&success=Account%20renamed");

  expect(renameAccount).toHaveBeenCalledWith(
    { db: true },
    {
      accountId: "account-1",
      displayName: "Primary savings",
      ownerUserId: "user-1"
    }
  );
});

test("renameAccountAction rejects invalid names", async () => {
  const { renameAccountAction } = await import("@/app/actions");

  await expect(
    renameAccountAction(
      formData({
        accountId: "account-1",
        displayName: ""
      })
    )
  ).rejects.toThrow("REDIRECT:/?view=metadata&error=Account%20name%20is%20required");

  expect(renameAccount).not.toHaveBeenCalled();
});

test("deactivateAccountAction and reactivateAccountAction toggle account status", async () => {
  deactivateAccount.mockResolvedValueOnce({ id: "account-1", active: false });
  reactivateAccount.mockResolvedValueOnce({ id: "account-1", active: true });
  const { deactivateAccountAction, reactivateAccountAction } = await import("@/app/actions");

  await expect(deactivateAccountAction(formData({ accountId: "account-1" }))).rejects.toThrow(
    "REDIRECT:/?view=metadata&success=Account%20deactivated"
  );
  await expect(reactivateAccountAction(formData({ accountId: "account-1" }))).rejects.toThrow(
    "REDIRECT:/?view=metadata&success=Account%20reactivated"
  );

  expect(deactivateAccount).toHaveBeenCalledWith(
    { db: true },
    {
      accountId: "account-1",
      ownerUserId: "user-1"
    }
  );
  expect(reactivateAccount).toHaveBeenCalledWith(
    { db: true },
    {
      accountId: "account-1",
      ownerUserId: "user-1"
    }
  );
});

test("importIciciStatement includes skipped duplicate rows in the success redirect", async () => {
  runIciciCsvImport.mockResolvedValueOnce({
    alreadyImported: true,
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
    "REDIRECT:/?month=2026-04&success=Import%20processed&importResults="
  );
});

test("importIciciStatement reports mixed per-file success and errors", async () => {
  runIciciCsvImport
    .mockResolvedValueOnce({
      importBatch: { skippedRowCount: 0 },
      transactions: [{ transactionDate: "2026-04-30" }, { transactionDate: "2026-04-29" }]
    })
    .mockRejectedValueOnce(new Error("Unsupported CSV headers"))
    .mockResolvedValueOnce({
      importBatch: { skippedRowCount: 0 },
      transactions: [{ transactionDate: "2026-05-01" }]
    });
  const { importIciciStatement } = await import("@/app/actions");

  const redirectUrl = await redirectedUrl(
    importIciciStatement(
      formData({
        accountDisplayName: "Primary account",
        statements: [
          new File(["csv"], "april.csv", { type: "text/csv" }) as any,
          new File(["bad"], "bad.csv", { type: "text/csv" }) as any,
          new File(["csv"], "may.csv", { type: "text/csv" }) as any
        ]
      })
    )
  );
  const url = new URL(`http://localhost${redirectUrl}`);
  const results = parseImportResults(url.searchParams.get("importResults") ?? "");

  expect(url.searchParams.get("month")).toBe("2026-05");
  expect(results).toEqual([
    { filename: "april.csv", status: "success", month: "2026-04", rowCount: 2 },
    {
      filename: "bad.csv",
      status: "error",
      error: "This file format is not supported. Supported: ICICI bank CSV, HDFC bank CSV, ICICI credit card CSV."
    },
    { filename: "may.csv", status: "success", month: "2026-05", rowCount: 1 }
  ]);
});

test("importIciciStatement redirects with all file errors when every file fails", async () => {
  runIciciCsvImport
    .mockRejectedValueOnce(new Error("Unsupported CSV headers"))
    .mockRejectedValueOnce(new Error("File contains no transactions."));
  const { importIciciStatement } = await import("@/app/actions");

  const redirectUrl = await redirectedUrl(
    importIciciStatement(
      formData({
        accountDisplayName: "Primary account",
        statements: [
          new File(["bad"], "bad.csv", { type: "text/csv" }) as any,
          new File(["empty"], "empty.csv", { type: "text/csv" }) as any
        ]
      })
    )
  );
  const url = new URL(`http://localhost${redirectUrl}`);
  const results = parseImportResults(url.searchParams.get("importResults") ?? "");

  expect(url.searchParams.get("error")).toBe("All files failed. See details.");
  expect(results.map((result) => result.filename)).toEqual(["bad.csv", "empty.csv"]);
  expect(results.every((result) => result.status === "error")).toBe(true);
});

async function redirectedUrl(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("REDIRECT:")) {
      return message.slice("REDIRECT:".length);
    }
    throw error;
  }

  throw new Error("Expected redirect");
}

function formData(values: Record<string, string | File | File[]>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        data.append(key, item);
      }
    } else {
      data.set(key, value);
    }
  }

  return data;
}
