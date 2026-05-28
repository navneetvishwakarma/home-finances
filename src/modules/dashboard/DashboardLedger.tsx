import React from "react";
import { updateTransactionCategoryAction } from "@/app/actions";
import {
  categoryLabel,
  transactionCategories,
  type TransactionCategory
} from "@/modules/classification/categories";
import type { getImportDashboard } from "@/modules/imports/persistence";

type DashboardData = Awaited<ReturnType<typeof getImportDashboard>>;

export function DashboardLedger({ data }: { data: DashboardData }) {
  const differenceLabel = data.tally.differenceMinorUnits === 0 ? "Balanced" : "Difference";
  const categoryTotals = summarizeCategories(data.transactions);

  return (
    <section className="dashboard-ledger">
      <header>
        <p>Import batch</p>
        <h1>{data.importBatch.id}</h1>
        <p>{data.importBatch.filename}</p>
      </header>

      <dl className="tally-grid">
        <div>
          <dt>Total incoming</dt>
          <dd>{formatMoney(data.tally.totalIncomingMinorUnits)}</dd>
        </div>
        <div>
          <dt>Total outgoing</dt>
          <dd>{formatMoney(data.tally.totalOutgoingMinorUnits)}</dd>
        </div>
        <div>
          <dt>Net movement</dt>
          <dd>{formatMoney(data.tally.netMovementMinorUnits)}</dd>
        </div>
        <div>
          <dt>Opening balance</dt>
          <dd>{formatMoney(data.tally.openingBalanceMinorUnits)}</dd>
        </div>
        <div>
          <dt>Closing balance</dt>
          <dd>{formatMoney(data.tally.closingBalanceMinorUnits)}</dd>
        </div>
        <div>
          <dt>{differenceLabel}</dt>
          <dd>{formatMoney(data.tally.differenceMinorUnits)}</dd>
        </div>
      </dl>

      <section className="category-summary" aria-labelledby="category-summary-heading">
        <h2 id="category-summary-heading">Category totals</h2>
        <div className="category-summary-table-wrap">
          <table className="category-summary-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Incoming</th>
                <th>Outgoing</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {categoryTotals.map((total) => (
                <tr key={total.category}>
                  <td>{categoryLabel(total.category)}</td>
                  <td>{formatMoney(total.incomingMinorUnits)}</td>
                  <td>{formatMoney(total.outgoingMinorUnits)}</td>
                  <td>{formatMoney(total.netMinorUnits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Direction</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Running balance</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.transactionDate}</td>
                <td>{transaction.description}</td>
                <td>{toTitleCase(transaction.direction)}</td>
                <td>
                  <form action={updateTransactionCategoryAction} className="category-form">
                    <input type="hidden" name="transactionId" value={transaction.id} />
                    <input type="hidden" name="importBatchId" value={data.importBatch.id} />
                    <select
                      name="category"
                      defaultValue={transaction.category}
                      aria-label={`Category for ${transaction.description}`}
                    >
                      {transactionCategories.map((category) => (
                        <option key={category.slug} value={category.slug}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit">Save</button>
                    <span>{toTitleCase(transaction.categorySource)}</span>
                  </form>
                </td>
                <td>{formatMoney(transaction.amountMinorUnits)}</td>
                <td>{formatMoney(transaction.runningBalanceMinorUnits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function summarizeCategories(transactions: DashboardData["transactions"]) {
  const totals = new Map<
    string,
    {
      category: TransactionCategory | string;
      incomingMinorUnits: number;
      outgoingMinorUnits: number;
      netMinorUnits: number;
    }
  >();

  for (const transaction of transactions) {
    const current = totals.get(transaction.category) ?? {
      category: transaction.category,
      incomingMinorUnits: 0,
      outgoingMinorUnits: 0,
      netMinorUnits: 0
    };

    if (transaction.direction === "incoming") {
      current.incomingMinorUnits += transaction.amountMinorUnits;
      current.netMinorUnits += transaction.amountMinorUnits;
    } else {
      current.outgoingMinorUnits += transaction.amountMinorUnits;
      current.netMinorUnits -= transaction.amountMinorUnits;
    }

    totals.set(transaction.category, current);
  }

  return [...totals.values()].sort((left, right) =>
    categoryLabel(left.category).localeCompare(categoryLabel(right.category))
  );
}

function formatMoney(minorUnits: number) {
  return `INR ${(minorUnits / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
