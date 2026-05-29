import React from "react";
import { Check, Database, LogOut, Power, ReceiptText, RotateCcw, UserCircle } from "lucide-react";
import { getMigratedDatabase } from "@/db/client";
import {
  closeMonthAction,
  deactivateAccountAction,
  importIciciStatement,
  loginAction,
  logoutAction,
  reactivateAccountAction,
  renameAccountAction,
  reopenMonthAction,
  signupAction
} from "@/app/actions";
import { getCurrentUser } from "@/modules/auth/session";
import { MonthDashboard } from "@/modules/dashboard/DashboardLedger";
import { AccountNameInput } from "@/modules/imports/AccountNameInput";
import { ImportSubmitButton } from "@/modules/imports/ImportSubmitButton";
import {
  type ImportFileResult,
  parseImportResults
} from "@/modules/imports/import-results";
import {
  type CompleteImportDashboard,
  getAccountMetadataSummary,
  getAvailableLedgerMonths,
  getConsolidatedMonthTally,
  getImportDashboard,
  getLatestImportDashboards,
  getMonthDashboards,
  getMonthCloseStatus,
  isCompleteImportDashboard
} from "@/modules/imports/persistence";

type AccountMetadataSummary = Awaited<ReturnType<typeof getAccountMetadataSummary>>;

type SearchParams = Promise<{
  importBatchId?: string;
  importBatchIds?: string;
  month?: string;
  error?: string;
  success?: string;
  importResults?: string;
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
      ? await loadMonthView(params, currentUser.id).catch((error) => {
          if (error instanceof Error && error.message.includes("DATABASE_URL")) {
            return emptyMonthView();
          }

          throw error;
        })
      : emptyMonthView();
  const { availableMonths, selectedMonth } = loadedView;
  const loadedDashboards = loadedView.dashboards;
  const consolidatedTally = loadedView.consolidatedTally;
  const monthCloseStatus = loadedView.monthCloseStatus;
  const dashboards = loadedDashboards.filter(isCompleteImportDashboard);
  const accountMetadata = await loadMetadataSummary(currentUser.id).catch(emptyMetadataSummary);

  return (
    <main className="app-shell">
      <div className="app-frame">
        <SideNav currentUser={currentUser} selectedView={selectedView} />
        <div className="app-main">
          <Toasts error={params.error} importResults={parseImportResults(params.importResults)} success={params.success} />
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
            <MetadataView summary={accountMetadata} />
          ) : (
            <TransactionsView
              activeAccountNames={accountMetadata.activeAccountNames}
              availableMonths={availableMonths}
              consolidatedTally={consolidatedTally}
              dashboards={dashboards}
              monthCloseStatus={monthCloseStatus}
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

function Toasts({
  error,
  importResults,
  success
}: {
  error?: string;
  importResults: ImportFileResult[];
  success?: string;
}) {
  if (!error && !success && importResults.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {success ? <p className="toast is-success">{success}</p> : null}
      {error ? <p className="toast is-error">{error}</p> : null}
      {importResults.length > 0 ? (
        <ul className="import-result-list" aria-label="Import file results">
          {importResults.map((result) => (
            <li className={`import-result-row is-${result.status}`} key={`${result.filename}-${result.status}`}>
              <strong>{result.filename}</strong>
              <span>{importResultLabel(result)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TransactionsView({
  activeAccountNames,
  availableMonths,
  consolidatedTally,
  dashboards,
  monthCloseStatus,
  selectedMonth
}: {
  activeAccountNames: string[];
  availableMonths: string[];
  consolidatedTally: Awaited<ReturnType<typeof getConsolidatedMonthTally>> | null;
  dashboards: CompleteImportDashboard[];
  monthCloseStatus: Awaited<ReturnType<typeof getMonthCloseStatus>> | null;
  selectedMonth: string;
}) {
  const isClosed = monthCloseStatus?.status === "closed";

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
            <AccountNameInput activeAccountNames={activeAccountNames} />
          </label>
          <label className="field">
            <span>Statement files</span>
            <input name="statements" type="file" accept=".csv,text/csv,.txt,text/plain" multiple required />
          </label>
          <ImportSubmitButton />
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
        {dashboards.length > 0 && selectedMonth ? (
          isClosed ? (
            <form action={reopenMonthAction} className="month-view-selector" aria-label="Reopen month">
              <input type="hidden" name="month" value={selectedMonth} />
              <button type="submit">Reopen</button>
            </form>
          ) : (
            <form action={closeMonthAction} className="month-view-selector" aria-label="Close month">
              <input type="hidden" name="month" value={selectedMonth} />
              <label>
                <span>Close note</span>
                <input name="note" maxLength={280} />
              </label>
              <button type="submit">Close month</button>
            </form>
          )
        ) : null}
        {dashboards.length > 0 ? (
          <MonthDashboard
            consolidatedTally={consolidatedTally}
            dashboards={dashboards}
            monthCloseStatus={monthCloseStatus}
          />
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

function MetadataView({ summary }: { summary: AccountMetadataSummary }) {
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
      <section className="account-register" aria-labelledby="account-register-heading">
        <div className="section-title-row">
          <div>
            <p className="section-kicker">Account register</p>
            <h3 id="account-register-heading">Account register</h3>
          </div>
        </div>
        {summary.accounts.length > 0 ? (
          <div className="account-row-stack">
            {summary.accounts.map((account) => (
              <article className="account-row" key={account.id}>
                <div className="account-row-main">
                  <form action={renameAccountAction} className="account-rename-form">
                    <input type="hidden" name="accountId" value={account.id} />
                    <label>
                      <span>Display name</span>
                      <input name="displayName" defaultValue={account.displayName} required maxLength={80} />
                    </label>
                    <button type="submit" aria-label={`Rename ${account.displayName}`} title="Save name">
                      <Check size={16} aria-hidden="true" />
                    </button>
                  </form>
                  <dl className="account-facts">
                    <div>
                      <dt>Provider</dt>
                      <dd>{account.providerLabel}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{account.accountType}</dd>
                    </div>
                    <div>
                      <dt>Currency</dt>
                      <dd>{account.currency}</dd>
                    </div>
                    <div>
                      <dt>Statement holder</dt>
                      <dd>{account.statementHolderName ?? "Not captured"}</dd>
                    </div>
                    <div>
                      <dt>Source profiles</dt>
                      <dd>{account.sourceProfiles.length > 0 ? account.sourceProfiles.join(", ") : "None yet"}</dd>
                    </div>
                    <div>
                      <dt>Transactions</dt>
                      <dd>{account.transactionCount} {account.transactionCount === 1 ? "transaction" : "transactions"}</dd>
                    </div>
                    <div>
                      <dt>Last imported</dt>
                      <dd>{account.lastImportedAt ? formatDateTime(account.lastImportedAt) : "Never"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="account-row-actions">
                  <span className={account.active ? "status-chip is-balanced" : "status-chip is-muted"}>
                    {account.active ? "Active" : "Inactive"}
                  </span>
                  <form action={account.active ? deactivateAccountAction : reactivateAccountAction}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <button type="submit" aria-label={`${account.active ? "Deactivate" : "Reactivate"} ${account.displayName}`}>
                      {account.active ? <Power size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
                      {account.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-inline">No accounts imported yet</p>
        )}
      </section>
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

async function loadDashboards(params: Awaited<SearchParams>, ownerUserId: string) {
  const importBatchIds = params.importBatchIds
    ? params.importBatchIds.split(",").filter(Boolean)
    : params.importBatchId
      ? [params.importBatchId]
      : [];

  if (importBatchIds.length === 0) {
    const db = await getMigratedDatabase();
    return getLatestImportDashboards(db, 12, ownerUserId);
  }

  const db = await getMigratedDatabase();
  const dashboards = await Promise.all(
    importBatchIds.map((importBatchId) => getImportDashboard(db, importBatchId, ownerUserId))
  );

  return dashboards.filter(isCompleteImportDashboard);
}

async function loadMonthView(params: Awaited<SearchParams>, ownerUserId: string) {
  const db = await getMigratedDatabase();
  const availableMonths = await getAvailableLedgerMonths(db, ownerUserId);
  const selectedMonth =
    params.month && availableMonths.includes(params.month) ? params.month : availableMonths[0] ?? "";

  if (selectedMonth) {
    return {
      availableMonths,
      selectedMonth,
      consolidatedTally: await getConsolidatedMonthTally(db, selectedMonth, ownerUserId),
      monthCloseStatus: await getMonthCloseStatus(db, selectedMonth, ownerUserId),
      dashboards: await getMonthDashboards(db, selectedMonth, ownerUserId)
    };
  }

  return {
    availableMonths,
    selectedMonth,
    consolidatedTally: null,
    monthCloseStatus: null,
    dashboards: await loadDashboards(params, ownerUserId)
  };
}

async function loadMetadataSummary(ownerUserId: string) {
  const db = await getMigratedDatabase();
  return getAccountMetadataSummary(db, ownerUserId);
}

function emptyMonthView() {
  return { availableMonths: [], selectedMonth: "", consolidatedTally: null, monthCloseStatus: null, dashboards: [] };
}

function emptyMetadataSummary() {
  return { accountCount: 0, sourceProfiles: [], activeAccountNames: [], accounts: [] };
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

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function importResultLabel(result: ImportFileResult) {
  if (result.status === "success") {
    const rowLabel = result.rowCount === 1 ? "row" : "rows";
    return `Imported (${formatMonthLabel(result.month)}, ${result.rowCount} ${rowLabel})`;
  }

  if (result.status === "skipped") {
    return "Already imported";
  }

  return `Failed: ${result.error}`;
}
