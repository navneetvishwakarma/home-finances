import React from "react";
import { getMigratedDatabase } from "@/db/client";
import { importIciciStatement } from "@/app/actions";
import { DashboardLedger } from "@/modules/dashboard/DashboardLedger";
import { getImportDashboard } from "@/modules/imports/persistence";

type SearchParams = Promise<{
  importBatchId?: string;
  error?: string;
}>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const dashboard = params.importBatchId ? await loadDashboard(params.importBatchId) : undefined;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">FinState Command Centre</p>
          <h1>Statement reconciliation without spreadsheet drift</h1>
        </div>
        <div className="status-strip" aria-label="Import readiness">
          <span>Local database</span>
          <span>CSV first</span>
          <span>INR ledger</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="import-panel">
          <div className="panel-heading">
            <p className="section-kicker">Statement intake</p>
            <h2>Import bank statement</h2>
            <p>Upload a supported statement to create a verified ledger, balance tally, and editable category model.</p>
          </div>

          {params.error ? <p className="error-banner">{params.error}</p> : null}

          <form action={importIciciStatement}>
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
              <span>Statement file</span>
              <input name="statement" type="file" accept=".csv,text/csv,.txt,text/plain" required />
            </label>
            <button className="primary-action" type="submit">
              Run import
            </button>
          </form>

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
          {dashboard ? (
            <DashboardLedger data={dashboard} />
          ) : (
            <div className="empty-state">
              <p className="section-kicker">Reconciliation cockpit</p>
              <h2>Ready for a statement</h2>
              <p>After import, this workspace shows cash movement, balance confidence, category intelligence, and the transaction stream with running balances.</p>
              <div className="preview-grid" aria-label="Dashboard preview">
                <span>Incoming</span>
                <span>Outgoing</span>
                <span>Net movement</span>
                <span>Balance check</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

async function loadDashboard(importBatchId: string) {
  const db = await getMigratedDatabase();
  return getImportDashboard(db, importBatchId);
}
