import React from "react";
import { Database, LogOut, ReceiptText, UserCircle } from "lucide-react";
import { getMigratedDatabase } from "@/db/client";
import { importIciciStatement, loginAction, logoutAction, signupAction } from "@/app/actions";
import { getCurrentUser } from "@/modules/auth/session";
import { MonthDashboard } from "@/modules/dashboard/DashboardLedger";
import {
  type CompleteImportDashboard,
  getAccountMetadataSummary,
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
  success?: string;
  view?: string;
}>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <LoginPage error={params.error} success={params.success} />;
  }

  const selectedView = selectedAppView(params.view);
  const loadedView =
    selectedView === "transactions"
      ? await loadMonthView(params).catch((error) => {
          if (error instanceof Error && error.message.includes("DATABASE_URL")) {
            return emptyMonthView();
          }

          throw error;
        })
      : emptyMonthView();
  const { availableMonths, selectedMonth } = loadedView;
  const loadedDashboards = loadedView.dashboards;
  const dashboards = loadedDashboards.filter(isCompleteImportDashboard);
  const metadataSummary = selectedView === "metadata" ? await loadMetadataSummary().catch(emptyMetadataSummary) : null;

  return (
    <main className="app-shell">
      <div className="app-frame">
        <SideNav currentUser={currentUser} selectedView={selectedView} />
        <div className="app-main">
          <Toasts error={params.error} success={params.success} />
          <header className="app-header">
            <div>
              <p className="eyebrow">FinState Command Centre</p>
              <h1>{pageTitle(selectedView)}</h1>
            </div>
            <div className="status-strip" aria-label="Import readiness">
              <span>Multi-file month close</span>
              <span>All instruments</span>
              <span>INR consolidation</span>
            </div>
          </header>

          {selectedView === "profile" ? (
            <ProfileView currentUser={currentUser} />
          ) : selectedView === "metadata" ? (
            <MetadataView summary={metadataSummary ?? { accountCount: 0, sourceProfiles: [] }} />
          ) : (
            <TransactionsView
              availableMonths={availableMonths}
              dashboards={dashboards}
              selectedMonth={selectedMonth}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function SideNav({
  currentUser,
  selectedView
}: {
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
  selectedView: "profile" | "transactions" | "metadata";
}) {
  return (
    <aside className="side-nav" aria-label="Primary navigation">
      <div className="side-nav-user">
        <span>{currentUser?.displayName}</span>
        <small>{currentUser?.email}</small>
      </div>
      <nav>
        <a className={selectedView === "profile" ? "is-active" : ""} href="/?view=profile">
          <UserCircle size={18} aria-hidden="true" />
          User profile
        </a>
        <a className={selectedView === "transactions" ? "is-active" : ""} href="/">
          <ReceiptText size={18} aria-hidden="true" />
          Transactions
        </a>
        <a className={selectedView === "metadata" ? "is-active" : ""} href="/?view=metadata">
          <Database size={18} aria-hidden="true" />
          Metadata
        </a>
      </nav>
      <form action={logoutAction}>
        <button type="submit">
          <LogOut size={18} aria-hidden="true" />
          Logout
        </button>
      </form>
    </aside>
  );
}

function Toasts({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {success ? <p className="toast is-success">{success}</p> : null}
      {error ? <p className="toast is-error">{error}</p> : null}
    </div>
  );
}

function TransactionsView({
  availableMonths,
  dashboards,
  selectedMonth
}: {
  availableMonths: string[];
  dashboards: CompleteImportDashboard[];
  selectedMonth: string;
}) {
  return (
    <div className="workspace">
      <aside className="import-panel">
        <div className="panel-heading">
          <p className="section-kicker">Month-close intake</p>
          <h2>Upload all statement files</h2>
          <p>Build one complete monthly view by uploading every bank and card statement that covers the month.</p>
        </div>

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
  );
}

function ProfileView({ currentUser }: { currentUser: Awaited<ReturnType<typeof getCurrentUser>> }) {
  return (
    <section className="dashboard-panel utility-panel">
      <p className="section-kicker">User profile</p>
      <h2>{currentUser?.displayName}</h2>
      <dl className="metadata-grid">
        <div>
          <dt>Email</dt>
          <dd>{currentUser?.email}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{currentUser?.role}</dd>
        </div>
      </dl>
    </section>
  );
}

function MetadataView({ summary }: { summary: { accountCount: number; sourceProfiles: string[] } }) {
  return (
    <section className="dashboard-panel utility-panel">
      <p className="section-kicker">Workspace metadata</p>
      <h2>Linked accounts</h2>
      <dl className="metadata-grid">
        <div>
          <dt>Linked accounts</dt>
          <dd>{summary.accountCount}</dd>
        </div>
        <div>
          <dt>Source profiles used</dt>
          <dd>{summary.sourceProfiles.length}</dd>
        </div>
      </dl>
      <div className="metadata-list">
        {summary.sourceProfiles.length > 0 ? (
          summary.sourceProfiles.map((profile) => <span key={profile}>{profile}</span>)
        ) : (
          <span>No statement sources imported yet</span>
        )}
      </div>
    </section>
  );
}

function LoginPage({ error, success }: { error?: string; success?: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="login-heading">
        <div>
          <p className="eyebrow">FinState Command Centre</p>
          <h1 id="login-heading">Sign in to FinState</h1>
          <p>Access your private finance reconciliation workspace.</p>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
        {success ? <p className="success-banner">{success}</p> : null}

        <form action={loginAction}>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary-action" type="submit">
            Sign in
          </button>
        </form>

        <div className="auth-divider" aria-hidden="true" />

        <form action={signupAction}>
          <h2>Create account</h2>
          <label className="field">
            <span>Name</span>
            <input name="displayName" type="text" autoComplete="name" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="new-password" required />
          </label>
          <button className="secondary-action" type="submit">
            Create account
          </button>
        </form>
      </section>
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

async function loadMetadataSummary() {
  const db = await getMigratedDatabase();
  return getAccountMetadataSummary(db);
}

function emptyMonthView() {
  return { availableMonths: [], selectedMonth: "", dashboards: [] };
}

function emptyMetadataSummary() {
  return { accountCount: 0, sourceProfiles: [] };
}

function pageTitle(view: "profile" | "transactions" | "metadata") {
  if (view === "metadata") {
    return "Workspace metadata";
  }

  if (view === "profile") {
    return "User profile";
  }

  return "Complete month view across every instrument";
}

function selectedAppView(view?: string) {
  if (view === "profile" || view === "metadata") {
    return view;
  }

  return "transactions";
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(`${month}-01T00:00:00`));
}
