import React from "react";
import { getMigratedDatabase } from "@/db/client";
import { importIciciStatement } from "@/app/actions";
import { MonthDashboard } from "@/modules/dashboard/DashboardLedger";
import {
  getAvailableLedgerMonths,
  getImportDashboard,
  getLatestImportDashboards,
  getMonthDashboards,
  isCompleteImportDashboard
} from "@/modules/imports/persistence";

type SearchParams = Promise<{
  importBatchId?: string;
  importBatchIds?: string;
  month?: string;
  error?: string;
}>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const loadedView = await loadMonthView(params).catch((error) => {
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      return { availableMonths: [], selectedMonth: "", dashboards: [] };
    }

    throw error;
  });
  const { availableMonths, selectedMonth } = loadedView;
  const loadedDashboards = loadedView.dashboards;
  const dashboards = loadedDashboards.filter(isCompleteImportDashboard);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">FinState Command Centre</p>
          <h1>Complete month view across every instrument</h1>
        </div>
        <div className="status-strip" aria-label="Import readiness">
          <span>Multi-file month close</span>
          <span>All instruments</span>
          <span>INR consolidation</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="import-panel">
          <div className="panel-heading">
            <p className="section-kicker">Month-close intake</p>
            <h2>Upload all statement files</h2>
            <p>Build one complete monthly view by uploading every bank and card statement that covers the month.</p>
          </div>

          {params.error ? <p className="error-banner">{params.error}</p> : null}

          <form action={importIciciStatement}>
            <label className="field">
              <span>Statement month</span>
              <input name="month" type="month" defaultValue="2026-04" />
            </label>
            <label className="field">
              <span>Source profile</span>
              <select defaultValue="auto" aria-label="Source profile">
                <option value="auto">Auto-detect supported profile</option>
              </select>
            </label>
            <label className="field">
              <span>Account name</span>
              <input name="accountDisplayName" defaultValue="Primary account" required />
            </label>
            <label className="field">
              <span>Statement files</span>
              <input name="statements" type="file" accept=".csv,text/csv,.txt,text/plain" multiple required />
            </label>
            <button className="primary-action" type="submit">
              Run import
            </button>
          </form>

          <section className="coverage-card" aria-labelledby="coverage-heading">
            <h3 id="coverage-heading">Credit card coverage</h3>
            <p>Upload at least 2 billing files when a card cycle cuts through the middle of the month.</p>
          </section>

          <section className="support-card" aria-labelledby="supported-sources-heading">
            <h3 id="supported-sources-heading">Supported sources</h3>
            <ul>
              <li>ICICI bank CSV</li>
              <li>HDFC bank CSV</li>
              <li>ICICI credit card CSV</li>
            </ul>
          </section>
        </aside>

        <section className="dashboard-panel">
          <form className="month-view-selector" aria-label="Month view">
            <label>
              <span>Month view</span>
              <select name="month" defaultValue={selectedMonth} disabled={availableMonths.length === 0}>
                {availableMonths.length > 0 ? (
                  availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {formatMonthLabel(month)}
                    </option>
                  ))
                ) : (
                  <option value="">No months available</option>
                )}
              </select>
            </label>
            <button type="submit" disabled={availableMonths.length === 0}>
              View
            </button>
          </form>
          {dashboards.length > 0 ? (
            <MonthDashboard dashboards={dashboards} />
          ) : (
            <div className="empty-state">
              <p className="section-kicker">Month cockpit</p>
              <h2>Complete month view</h2>
              <p>After import, this workspace shows one consolidation summary plus instrument-level transactions for bank accounts and card billing files.</p>
              <div className="preview-grid" aria-label="Dashboard preview">
                <span>Consolidated incoming</span>
                <span>Consolidated outgoing</span>
                <span>Instrument tabs</span>
                <span>Credit card coverage</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

async function loadDashboards(params: Awaited<SearchParams>) {
  const importBatchIds = params.importBatchIds
    ? params.importBatchIds.split(",").filter(Boolean)
    : params.importBatchId
      ? [params.importBatchId]
      : [];

  if (importBatchIds.length === 0) {
    const db = await getMigratedDatabase();
    return getLatestImportDashboards(db);
  }

  const db = await getMigratedDatabase();
  const dashboards = await Promise.all(
    importBatchIds.map((importBatchId) => getImportDashboard(db, importBatchId))
  );

  return dashboards.filter(isCompleteImportDashboard);
}

async function loadMonthView(params: Awaited<SearchParams>) {
  const db = await getMigratedDatabase();
  const availableMonths = await getAvailableLedgerMonths(db);
  const selectedMonth =
    params.month && availableMonths.includes(params.month) ? params.month : availableMonths[0] ?? "";

  if (selectedMonth) {
    return {
      availableMonths,
      selectedMonth,
      dashboards: await getMonthDashboards(db, selectedMonth)
    };
  }

  return {
    availableMonths,
    selectedMonth,
    dashboards: await loadDashboards(params)
  };
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(`${month}-01T00:00:00`));
}
