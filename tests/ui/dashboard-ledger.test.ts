import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DashboardLedger, MonthDashboard } from "@/modules/dashboard/DashboardLedger";

test("renders category totals and review-first expandable ledger rows", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardLedger, {
      data: createDashboard("import-1", "statement.csv", "icici-bank-csv")
    })
  );

  expect(html).toContain("Reconciliation status");
  expect(html).toContain("Confidence: exact match");
  expect(html).toContain("Category intelligence");
  expect(html).toContain("Transaction stream");
  expect(html).toContain("add-transaction-panel");
  expect(html).toContain("add-transaction-label");
  expect(html).toContain("Add transaction");
  expect(html).toContain("ledger-record-list");
  expect(html).toContain("ledger-record-summary");
  expect(html).toContain("ledger-record-details");
  expect(html).toContain("direction-pill is-incoming");
  expect(html).toContain("direction-pill is-outgoing");
  expect(html).toContain("money-in");
  expect(html).toContain("money-out");
  expect(html).toContain("APRIL SALARY CREDIT");
  expect(html).toContain("UPI GROCERY STORE");
  expect(html).toContain("Income");
  expect(html).toContain("Food");
  expect(html).toContain("INR 1,000.00");
  expect(html).toContain("INR 350.00");
  expect(html).toContain("Original description");
  expect(html).toContain("Running balance");
  expect(html).toContain("Source identity");
  expect(html).toContain("Edit transaction");
  expect(html).toContain("Delete transaction");
  expect(html).toContain("Manage import");
  expect(html).toContain("EMIs");
  expect(html).toContain("Education");
});

test("renders a consolidated month dashboard with instrument sections", () => {
  const html = renderToStaticMarkup(
    createElement(MonthDashboard, {
      dashboards: [
        createDashboard("import-1", "icici-bank-april.csv", "icici-bank-csv"),
        createDashboard("import-2", "icici-card-mar-apr.csv", "icici-credit-card-csv", {
          incomingMinorUnits: 25000,
          outgoingMinorUnits: 90000
        }),
        createDashboard("import-3", "icici-card-apr-may.csv", "icici-credit-card-csv", {
          incomingMinorUnits: 0,
          outgoingMinorUnits: 70000
        })
      ]
    })
  );

  expect(html).toContain("Complete month view");
  expect(html).toContain("Consolidation summary");
  expect(html).toContain("All instruments");
  expect(html).toContain("ICICI bank");
  expect(html).toContain("ICICI credit card");
  expect(html).toContain("3 files uploaded");
  expect(html).toContain("Credit card coverage");
  expect(html).toContain("2 billing files");
  expect(html).toContain("Instrument transactions");
  expect(html).toContain("INR 1,250.00");
  expect(html).toContain("INR 1,950.00");
});

function createDashboard(
  importBatchId: string,
  filename: string,
  sourceProfileId: string,
  overrides: {
    incomingMinorUnits?: number;
    outgoingMinorUnits?: number;
  } = {}
) {
  const incomingMinorUnits = overrides.incomingMinorUnits ?? 100000;
  const outgoingMinorUnits = overrides.outgoingMinorUnits ?? 35000;
  const netMovementMinorUnits = incomingMinorUnits - outgoingMinorUnits;

  return {
    importBatch: {
      id: importBatchId,
      accountId: "account-1",
      sourceProfileId,
      filename,
      fileFingerprint: `sha256:${importBatchId}`,
      rawSource: "csv",
      status: "imported",
      importedAt: new Date()
    },
    tally: {
      id: `tally-${importBatchId}`,
      accountId: "account-1",
      importBatchId,
      totalIncomingMinorUnits: incomingMinorUnits,
      totalOutgoingMinorUnits: outgoingMinorUnits,
      netMovementMinorUnits,
      openingBalanceMinorUnits: 0,
      closingBalanceMinorUnits: netMovementMinorUnits,
      calculatedClosingBalanceMinorUnits: netMovementMinorUnits,
      differenceMinorUnits: 0,
      createdAt: new Date()
    },
    transactions: [
      {
        id: `txn-${importBatchId}-1`,
        accountId: "account-1",
        importBatchId,
        transactionDate: "2026-04-01",
        description: "APRIL SALARY CREDIT",
        direction: "incoming",
        amountMinorUnits: incomingMinorUnits,
        runningBalanceMinorUnits: incomingMinorUnits,
        category: "income",
        categorySource: "system_rule",
        rowHash: `sha256:${importBatchId}-row-1`,
        rawSourcePayload: { "S No.": "1" },
        createdAt: new Date()
      },
      {
        id: `txn-${importBatchId}-2`,
        accountId: "account-1",
        importBatchId,
        transactionDate: "2026-04-02",
        description: "UPI GROCERY STORE",
        direction: "outgoing",
        amountMinorUnits: outgoingMinorUnits,
        runningBalanceMinorUnits: netMovementMinorUnits,
        category: "food",
        categorySource: "manual",
        rowHash: `sha256:${importBatchId}-row-2`,
        rawSourcePayload: { "S No.": "2" },
        createdAt: new Date()
      }
    ]
  };
}
