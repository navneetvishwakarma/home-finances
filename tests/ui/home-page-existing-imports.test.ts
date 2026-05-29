import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("@/db/client", () => ({
  getMigratedDatabase: vi.fn(async () => ({}))
}));

vi.mock("@/modules/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-1",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }))
}));

vi.mock("@/modules/imports/persistence", () => ({
  getImportDashboard: vi.fn(),
  isCompleteImportDashboard: vi.fn((dashboard) => Boolean(dashboard.importBatch && dashboard.tally)),
  getAvailableLedgerMonths: vi.fn(async () => ["2026-04", "2026-03"]),
  getConsolidatedMonthTally: vi.fn(async () => ({
    month: "2026-04",
    totalIncomingMinorUnits: 100000,
    totalOutgoingMinorUnits: 35000,
    netMovementMinorUnits: 65000,
    instrumentCount: 1,
    manualTransactionCount: 0
  })),
  getMonthDashboards: vi.fn(async () => [
    {
      importBatch: {
        id: "import-existing-1",
        accountId: "account-1",
        sourceProfileId: "icici-bank-csv",
        filename: "existing-bank.csv",
        fileFingerprint: "sha256:existing-bank",
        rawSource: "csv",
        status: "imported",
        importedAt: new Date()
      },
      tally: {
        id: "tally-existing-1",
        accountId: "account-1",
        importBatchId: "import-existing-1",
        totalIncomingMinorUnits: 100000,
        totalOutgoingMinorUnits: 35000,
        netMovementMinorUnits: 65000,
        openingBalanceMinorUnits: 0,
        closingBalanceMinorUnits: 65000,
        calculatedClosingBalanceMinorUnits: 65000,
        differenceMinorUnits: 0,
        createdAt: new Date()
      },
      transactions: [
        {
          id: "txn-existing-1",
          accountId: "account-1",
          importBatchId: "import-existing-1",
          transactionDate: "2026-04-01",
          description: "APRIL SALARY CREDIT",
          direction: "incoming",
          amountMinorUnits: 100000,
          runningBalanceMinorUnits: 100000,
          category: "income",
          categorySource: "system_rule",
          rowHash: "sha256:row-1",
          rawSourcePayload: { "S No.": "1" },
          createdAt: new Date()
        }
      ]
    }
  ]),
  getLatestImportDashboards: vi.fn(async () => [
    {
      importBatch: {
        id: "import-incomplete",
        accountId: "account-1",
        sourceProfileId: "icici-bank-csv",
        filename: "uploaded-without-tally.csv",
        fileFingerprint: "sha256:incomplete",
        rawSource: "csv",
        status: "uploaded",
        importedAt: new Date()
      },
      tally: undefined,
      transactions: []
    },
    {
      importBatch: {
        id: "import-existing-1",
        accountId: "account-1",
        sourceProfileId: "icici-bank-csv",
        filename: "existing-bank.csv",
        fileFingerprint: "sha256:existing-bank",
        rawSource: "csv",
        status: "imported",
        importedAt: new Date()
      },
      tally: {
        id: "tally-existing-1",
        accountId: "account-1",
        importBatchId: "import-existing-1",
        totalIncomingMinorUnits: 100000,
        totalOutgoingMinorUnits: 35000,
        netMovementMinorUnits: 65000,
        openingBalanceMinorUnits: 0,
        closingBalanceMinorUnits: 65000,
        calculatedClosingBalanceMinorUnits: 65000,
        differenceMinorUnits: 0,
        createdAt: new Date()
      },
      transactions: [
        {
          id: "txn-existing-1",
          accountId: "account-1",
          importBatchId: "import-existing-1",
          transactionDate: "2026-04-01",
          description: "APRIL SALARY CREDIT",
          direction: "incoming",
          amountMinorUnits: 100000,
          runningBalanceMinorUnits: 100000,
          category: "income",
          categorySource: "system_rule",
          rowHash: "sha256:row-1",
          rawSourcePayload: { "S No.": "1" },
          createdAt: new Date()
        }
      ]
    }
  ])
}));

test("renders existing imported transactions when no import batch query is provided", async () => {
  const { default: HomePage } = await import("@/app/page");

  const page = await HomePage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Instrument summary");
  expect(html).toContain("Month view");
  expect(html).toContain("April 2026");
  expect(html).toContain("March 2026");
  expect(html).toContain("existing-bank.csv");
  expect(html).toContain("APRIL SALARY CREDIT");
  expect(html).not.toContain("uploaded-without-tally.csv");
  expect(html).not.toContain("After import, this workspace shows");
});
