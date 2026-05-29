import React from "react";
import {
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import {
  createManualTransactionAction,
  deleteImportBatchAction,
  deleteTransactionAction,
  updateTransactionDetailsAction
} from "@/app/actions";
import { ConfirmSubmitButton } from "@/modules/dashboard/ConfirmSubmitButton";
import {
  categoryLabel,
  transactionCategories,
  type TransactionCategory
} from "@/modules/classification/categories";
import {
  isCompleteImportDashboard,
  type CompleteImportDashboard,
  type getImportDashboard
} from "@/modules/imports/persistence";

type DashboardData = Awaited<ReturnType<typeof getImportDashboard>>;

export function MonthDashboard({ dashboards }: { dashboards: DashboardData[] }) {
  const completeDashboards = dashboards.filter(isCompleteImportDashboard);
  const totals = summarizeMonth(completeDashboards);
  const creditCardFileCount = completeDashboards.filter((dashboard) =>
    dashboard.importBatch.sourceProfileId.includes("credit-card")
  ).length;

  return (
    <section className="month-dashboard">
      <header className="month-dashboard-header">
        <div>
          <p className="section-kicker">Complete month view</p>
          <h2>Consolidation summary</h2>
          <p>{completeDashboards.length} files uploaded across all detected instruments.</p>
        </div>
        <span className="status-chip is-balanced">
          {creditCardFileCount >= 2 ? `${creditCardFileCount} billing files` : "Card coverage pending"}
        </span>
      </header>

      <dl className="consolidation-grid">
        <div className="metric-card is-incoming">
          <dt>Total incoming</dt>
          <dd>{formatMoney(totals.totalIncomingMinorUnits)}</dd>
        </div>
        <div className="metric-card is-outgoing">
          <dt>Total outgoing</dt>
          <dd>{formatMoney(totals.totalOutgoingMinorUnits)}</dd>
        </div>
        <div className="metric-card">
          <dt>Net month movement</dt>
          <dd>{formatMoney(totals.netMovementMinorUnits)}</dd>
        </div>
        <div className="metric-card">
          <dt>Credit card coverage</dt>
          <dd>{creditCardFileCount} billing files</dd>
        </div>
      </dl>

      <nav className="instrument-tabs" aria-label="Instrument views">
        <a href="#all-instruments" className="is-active">
          All instruments
        </a>
        {completeDashboards.map((dashboard) => (
          <a key={dashboard.importBatch.id} href={`#instrument-${dashboard.importBatch.id}`}>
            {sourceProfileLabel(dashboard.importBatch.sourceProfileId)}
          </a>
        ))}
      </nav>

      <section id="all-instruments" className="instrument-overview" aria-labelledby="instrument-overview-heading">
        <div className="section-title-row">
          <h2 id="instrument-overview-heading">Instrument transactions</h2>
          <span>{totals.transactionCount} rows imported</span>
        </div>
      </section>

      <div className="instrument-stack">
        {completeDashboards.map((dashboard) => (
          <article id={`instrument-${dashboard.importBatch.id}`} className="instrument-panel" key={dashboard.importBatch.id}>
            <DashboardLedger data={dashboard} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function DashboardLedger({ data }: { data: DashboardData }) {
  const differenceLabel = data.tally.differenceMinorUnits === 0 ? "Balanced" : "Difference";
  const confidenceLabel =
    data.tally.differenceMinorUnits === 0 ? "Confidence: exact match" : "Confidence: review needed";
  const categoryTotals = summarizeCategories(data.transactions);

  return (
    <section className="dashboard-ledger">
      <header>
        <div>
          <p className="section-kicker">Reconciliation status</p>
          <h2>{data.importBatch.filename}</h2>
          <p className="batch-id">
            {sourceProfileLabel(data.importBatch.sourceProfileId)} · Import batch {data.importBatch.id}
          </p>
        </div>
        <div className="ledger-actions">
          <span className={data.tally.differenceMinorUnits === 0 ? "status-chip is-balanced" : "status-chip is-review"}>
            {confidenceLabel}
          </span>
          <details className="import-management">
            <summary aria-label="Manage import">
              <MoreHorizontal aria-hidden="true" size={18} />
              <span>Manage import</span>
            </summary>
            <form action={deleteImportBatchAction}>
              <input type="hidden" name="importBatchId" value={data.importBatch.id} />
              <ConfirmSubmitButton
                className="danger-action"
                ariaLabel={`Delete import ${data.importBatch.filename}`}
                confirmMessage={`Delete import ${data.importBatch.filename}? Its transactions will be removed from the active dashboard.`}
              >
                <Trash2 aria-hidden="true" size={16} />
                <span>Delete import</span>
              </ConfirmSubmitButton>
            </form>
          </details>
        </div>
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
        <div className="section-title-row">
          <h2 id="category-summary-heading">Category intelligence</h2>
          <span>{categoryTotals.length} categories detected</span>
        </div>
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

      <div className="section-title-row">
        <h2>Transaction stream</h2>
        <span>{data.transactions.length} rows imported</span>
      </div>
      <details className="add-transaction-panel">
        <summary className="add-transaction-trigger" aria-label="Add transaction">
          <Plus aria-hidden="true" size={18} />
          <span className="add-transaction-label">Add transaction</span>
        </summary>
        <form action={createManualTransactionAction} className="manual-transaction-form">
          <input type="hidden" name="accountId" value={data.importBatch.accountId} />
          <input type="hidden" name="importBatchId" value={data.importBatch.id} />
          <label>
            <span>Date</span>
            <input name="transactionDate" type="date" required />
          </label>
          <label>
            <span>Description</span>
            <input name="description" placeholder="Manual transaction" required />
          </label>
          <label>
            <span>Direction</span>
            <select name="direction" defaultValue="outgoing">
              <option value="outgoing">Outgoing</option>
              <option value="incoming">Incoming</option>
            </select>
          </label>
          <label>
            <span>Amount</span>
            <input name="amount" inputMode="decimal" placeholder="Amount" required />
          </label>
          <label>
            <span>Category</span>
            <select name="category" defaultValue="uncategorized">
              {transactionCategories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tags</span>
            <input name="tags" placeholder="Comma-separated tags" />
          </label>
          <button type="submit">Save transaction</button>
        </form>
      </details>
      <div className="ledger-record-list">
        {data.transactions.map((transaction) => (
          <details className="ledger-record" key={transaction.id}>
            <summary className="ledger-record-summary">
              <span className="record-date">{formatDate(transaction.transactionDate)}</span>
              <span className="record-description">{transaction.description}</span>
              <span className={`direction-pill is-${transaction.direction}`}>
                {toTitleCase(transaction.direction)}
              </span>
              <span className={transaction.direction === "incoming" ? "money-in record-amount" : "money-out record-amount"}>
                {formatMoney(transaction.amountMinorUnits)}
              </span>
              <span className="category-chip">{categoryLabel(transaction.category)}</span>
              <ChevronDown aria-hidden="true" className="record-chevron" size={18} />
            </summary>
            <div className="ledger-record-details">
              <dl className="record-detail-grid">
                <div>
                  <dt>Source</dt>
                  <dd>
                    <span className={`source-pill is-${transaction.sourceType ?? "imported"}`}>
                      {toTitleCase(transaction.sourceType ?? "imported")}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Original description</dt>
                  <dd>{transaction.originalDescription ?? transaction.description}</dd>
                </div>
                <div>
                  <dt>Tags</dt>
                  <dd>{formatTags(transaction.tags) || "None"}</dd>
                </div>
                <div>
                  <dt>Running balance</dt>
                  <dd>{formatMoney(transaction.runningBalanceMinorUnits)}</dd>
                </div>
                <div>
                  <dt>Category source</dt>
                  <dd>{formatCategorySource(transaction.categorySource)}</dd>
                </div>
                <div>
                  <dt>Source identity</dt>
                  <dd>{transaction.sourceRowId ?? transaction.rowHash}</dd>
                </div>
              </dl>
              <div className="record-management-actions">
                <details className="record-edit-panel">
                  <summary aria-label={`Edit transaction ${transaction.description}`}>
                    <Pencil aria-hidden="true" size={16} />
                    <span>Edit transaction</span>
                  </summary>
                  <form action={updateTransactionDetailsAction} className="transaction-edit-form">
                    <input type="hidden" name="transactionId" value={transaction.id} />
                    <input type="hidden" name="importBatchId" value={data.importBatch.id} />
                    <label>
                      <span>Description</span>
                      <input name="description" defaultValue={transaction.description} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select name="category" defaultValue={transaction.category}>
                        {transactionCategories.map((category) => (
                          <option key={category.slug} value={category.slug}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Tags</span>
                      <input name="tags" defaultValue={formatTags(transaction.tags)} />
                    </label>
                    <button type="submit">Save changes</button>
                  </form>
                </details>
                <form action={deleteTransactionAction}>
                  <input type="hidden" name="transactionId" value={transaction.id} />
                  <input type="hidden" name="importBatchId" value={data.importBatch.id} />
                  <ConfirmSubmitButton
                    className="danger-action"
                    ariaLabel={`Delete transaction ${transaction.description}`}
                    confirmMessage={`Delete transaction ${transaction.description}?`}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                    <span>Delete transaction</span>
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function summarizeMonth(dashboards: CompleteImportDashboard[]) {
  return dashboards.reduce(
    (summary, dashboard) => ({
      totalIncomingMinorUnits:
        summary.totalIncomingMinorUnits + dashboard.tally.totalIncomingMinorUnits,
      totalOutgoingMinorUnits:
        summary.totalOutgoingMinorUnits + dashboard.tally.totalOutgoingMinorUnits,
      netMovementMinorUnits: summary.netMovementMinorUnits + dashboard.tally.netMovementMinorUnits,
      transactionCount: summary.transactionCount + dashboard.transactions.length
    }),
    {
      totalIncomingMinorUnits: 0,
      totalOutgoingMinorUnits: 0,
      netMovementMinorUnits: 0,
      transactionCount: 0
    }
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCategorySource(value: string) {
  return value
    .split("_")
    .map((part) => toTitleCase(part))
    .join(" ");
}

function formatTags(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function sourceProfileLabel(sourceProfileId: string) {
  const labels: Record<string, string> = {
    "hdfc-bank-csv": "HDFC bank",
    "icici-bank-csv": "ICICI bank",
    "icici-credit-card-csv": "ICICI credit card"
  };

  return labels[sourceProfileId] ?? sourceProfileId;
}
