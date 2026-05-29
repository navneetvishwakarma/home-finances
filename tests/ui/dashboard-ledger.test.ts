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
  expect(html).toContain("Running balance after this transaction");
  expect(html).toContain("Source identity");
  expect(html).toContain("Edit transaction");
  expect(html).toContain("Delete transaction");
  expect(html).toContain("Manage import");
  expect(html).toContain("EMIs");
  expect(html).toContain("Education");
});

test("marks estimated running balances in ledger rows", () => {
  const dashboard = createDashboard("manual-1", "Manual transactions", "manual-transactions");
  dashboard.transactions[1].balanceEstimated = true;
  const html = renderToStaticMarkup(
    createElement(DashboardLedger, {
      data: dashboard
    })
  );

  expect(html).toContain("~INR 650.00");
  expect(html).toContain("Estimated from the previous known balance");
});

test("renders a consolidated month dashboard with instrument sections", () => {
  const html = renderToStaticMarkup(
    createElement(MonthDashboard, {
      dashboards: [
        createDashboard("import-1", "icici-bank-april.csv", "icici-bank-csv"),
        createDashboard("import-2", "icici-card-mar-apr.csv", "icici-credit-card-csv", {
          accountId: "account-2",
          incomingMinorUnits: 25000,
          outgoingMinorUnits: 90000
        }),
        createDashboard("import-3", "icici-card-apr-may.csv", "icici-credit-card-csv", {
          accountId: "account-2",
          incomingMinorUnits: 0,
          outgoingMinorUnits: 70000
        })
      ],
      consolidatedTally: {
        month: "2026-04",
        totalIncomingMinorUnits: 125000,
        totalOutgoingMinorUnits: 195000,
        netMovementMinorUnits: -70000,
        instrumentCount: 2,
        manualTransactionCount: 1
      },
      categoryBreakdown: [
        {
          category: "uncategorized",
          label: "Uncategorized",
          outgoingTotalMinorUnits: 50000,
          incomingTotalMinorUnits: 0,
          transactionCount: 1,
          percentageOfTotalOutgoing: 20
        },
        {
          category: "food",
          label: "Food",
          outgoingTotalMinorUnits: 200000,
          incomingTotalMinorUnits: 0,
          transactionCount: 3,
          percentageOfTotalOutgoing: 80
        }
      ],
      selectedMonth: "2026-04",
      selectedCategory: "food"
    })
  );

  expect(html).toContain("Complete month view");
  expect(html).toContain("Month summary");
  expect(html).toContain("All instruments");
  expect(html).toContain("ICICI bank");
  expect(html).toContain("ICICI credit card");
  expect(html).toContain("2 instruments");
  expect(html).toContain("includes 1 manual entry");
  expect(html).toContain("Credit card coverage");
  expect(html).toContain("2 billing files");
  expect(html).toContain("Instrument transactions");
  expect(html).toContain("Spend by category");
  expect(html).toContain("Review uncategorized");
  expect(html).toContain("Clear filter");
  expect(html).toContain("80.0%");
  expect(html).toContain("3 transactions");
  expect(html).toContain("/?month=2026-04&amp;category=food#all-instruments");
  expect(html).toContain("INR 1,250.00");
  expect(html).toContain("INR 1,950.00");
});

test("does not render a consolidated card for a single instrument", () => {
  const html = renderToStaticMarkup(
    createElement(MonthDashboard, {
      dashboards: [createDashboard("import-1", "icici-bank-april.csv", "icici-bank-csv")],
      consolidatedTally: {
        month: "2026-04",
        totalIncomingMinorUnits: 100000,
        totalOutgoingMinorUnits: 35000,
        netMovementMinorUnits: 65000,
        instrumentCount: 1,
        manualTransactionCount: 0
      }
    })
  );

  expect(html).not.toContain("Month summary");
  expect(html).toContain("statement total");
});

test("hides transaction edit controls when a month is closed", () => {
  const html = renderToStaticMarkup(
    createElement(MonthDashboard, {
      dashboards: [createDashboard("import-1", "icici-bank-april.csv", "icici-bank-csv")],
      monthCloseStatus: {
        month: "2026-04",
        status: "closed",
        note: "Reviewed"
      }
    })
  );

  expect(html).toContain("Month closed");
  expect(html).not.toContain("Add transaction");
  expect(html).not.toContain("Edit transaction");
  expect(html).not.toContain("Delete transaction");
});

function createDashboard(
  importBatchId: string,
  filename: string,
  sourceProfileId: string,
  overrides: {
    accountId?: string;
    incomingMinorUnits?: number;
    outgoingMinorUnits?: number;
  } = {}
) {
  const accountId = overrides.accountId ?? "account-1";
  const incomingMinorUnits = overrides.incomingMinorUnits ?? 100000;
  const outgoingMinorUnits = overrides.outgoingMinorUnits ?? 35000;
  const netMovementMinorUnits = incomingMinorUnits - outgoingMinorUnits;

  return {
    importBatch: {
      id: importBatchId,
      accountId,
      sourceProfileId,
      filename,
      fileFingerprint: `sha256:${importBatchId}`,
      rawSource: "csv",
      status: "imported",
      skippedRowCount: 0,
      importedAt: new Date()
    },
    tally: {
      id: `tally-${importBatchId}`,
      accountId,
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
        accountId,
        importBatchId,
        transactionDate: "2026-04-01",
        description: "APRIL SALARY CREDIT",
        direction: "incoming",
        amountMinorUnits: incomingMinorUnits,
        runningBalanceMinorUnits: incomingMinorUnits,
        balanceEstimated: false,
        category: "income",
        categorySource: "system_rule",
        rowHash: `sha256:${importBatchId}-row-1`,
        rawSourcePayload: { "S No.": "1" },
        createdAt: new Date()
      },
      {
        id: `txn-${importBatchId}-2`,
        accountId,
        importBatchId,
        transactionDate: "2026-04-02",
        description: "UPI GROCERY STORE",
        direction: "outgoing",
        amountMinorUnits: outgoingMinorUnits,
        runningBalanceMinorUnits: netMovementMinorUnits,
        balanceEstimated: false,
        category: "food",
        categorySource: "manual",
        rowHash: `sha256:${importBatchId}-row-2`,
        rawSourcePayload: { "S No.": "2" },
        createdAt: new Date()
      }
    ]
  };
}
