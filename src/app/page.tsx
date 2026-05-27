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
      <div className="workspace">
        <aside className="import-panel">
          <p className="brand">FinState</p>
          <h1>Import ICICI statement</h1>
          <p>Upload one ICICI savings CSV to create the MVP 1 ledger and statement tally.</p>

          {params.error ? <p className="error-banner">{params.error}</p> : null}

          <form action={importIciciStatement}>
            <label className="field">
              <span>Account name</span>
              <input name="accountDisplayName" defaultValue="ICICI Savings" required />
            </label>
            <label className="field">
              <span>CSV statement</span>
              <input name="statement" type="file" accept=".csv,text/csv" required />
            </label>
            <button className="primary-action" type="submit">
              Run import
            </button>
          </form>
        </aside>

        <section className="dashboard-panel">
          {dashboard ? (
            <DashboardLedger data={dashboard} />
          ) : (
            <div className="empty-state">
              <h1>Statement dashboard</h1>
              <p>After import, this view shows incoming, outgoing, net movement, difference, and the transaction ledger with running balances.</p>
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
