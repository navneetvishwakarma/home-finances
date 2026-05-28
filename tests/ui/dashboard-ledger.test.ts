import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DashboardLedger } from "@/modules/dashboard/DashboardLedger";

test("renders category totals and category controls for ledger rows", () => {
  const html = renderToStaticMarkup(
    createElement(DashboardLedger, {
      data: {
        importBatch: {
          id: "import-1",
          accountId: "account-1",
          sourceProfileId: "icici-bank-csv",
          filename: "statement.csv",
          fileFingerprint: "sha256:test",
          rawSource: "csv",
          status: "imported",
          importedAt: new Date()
        },
        tally: {
          id: "tally-1",
          accountId: "account-1",
          importBatchId: "import-1",
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
            id: "txn-1",
            accountId: "account-1",
            importBatchId: "import-1",
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
          },
          {
            id: "txn-2",
            accountId: "account-1",
            importBatchId: "import-1",
            transactionDate: "2026-04-02",
            description: "UPI GROCERY STORE",
            direction: "outgoing",
            amountMinorUnits: 35000,
            runningBalanceMinorUnits: 65000,
            category: "food",
            categorySource: "manual",
            rowHash: "sha256:row-2",
            rawSourcePayload: { "S No.": "2" },
            createdAt: new Date()
          }
        ]
      }
    })
  );

  expect(html).toContain("Category totals");
  expect(html).toContain("Income");
  expect(html).toContain("Food");
  expect(html).toContain("INR 1,000.00");
  expect(html).toContain("INR 350.00");
  expect(html).toContain('name="transactionId"');
  expect(html).toContain('name="category"');
  expect(html).toContain("Manual");
  expect(html).toContain("EMIs");
  expect(html).toContain("Education");
});
