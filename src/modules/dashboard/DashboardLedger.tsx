import React from "react";
import type { getImportDashboard } from "@/modules/imports/persistence";

type DashboardData = Awaited<ReturnType<typeof getImportDashboard>>;

export function DashboardLedger({ data }: { data: DashboardData }) {
  const differenceLabel = data.tally.differenceMinorUnits === 0 ? "Balanced" : "Difference";

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

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Direction</th>
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

function formatMoney(minorUnits: number) {
  return `INR ${(minorUnits / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
