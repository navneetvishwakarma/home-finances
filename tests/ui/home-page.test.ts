import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { serializeImportResults } from "@/modules/imports/import-results";

vi.mock("@/db/client", () => ({
  getMigratedDatabase: vi.fn(async () => ({}))
}));

vi.mock("@/modules/auth/session", () => ({
  getCurrentUser: vi.fn(async () => null)
}));

vi.mock("@/modules/transfers/persistence", () => ({
  detectTransferCandidates: vi.fn(async () => [])
}));

vi.mock("@/modules/imports/persistence", () => ({
  getImportDashboard: vi.fn(),
  getLatestImportDashboards: vi.fn(async () => []),
  getAvailableLedgerMonths: vi.fn(async () => []),
  getConsolidatedMonthTally: vi.fn(async () => ({
    month: "",
    totalIncomingMinorUnits: 0,
    totalOutgoingMinorUnits: 0,
    netMovementMinorUnits: 0,
    instrumentCount: 0,
    manualTransactionCount: 0
  })),
  getMonthCloseStatus: vi.fn(async () => ({
    month: "",
    status: "open",
    note: null
  })),
  getCategoryBreakdown: vi.fn(async () => []),
  getAccountMetadataSummary: vi.fn(async () => ({
    accountCount: 2,
    sourceProfiles: ["icici-bank-csv", "hdfc-bank-csv"],
    activeAccountNames: ["Primary account"],
    accounts: [
      {
        id: "account-1",
        displayName: "Primary account",
        providerLabel: "ICICI Bank",
        accountType: "bank",
        currency: "INR",
        statementHolderName: "Admin User",
        sourceProfiles: ["icici-bank-csv"],
        transactionCount: 12,
        lastImportedAt: new Date("2026-04-30T10:00:00.000Z"),
        active: true
      },
      {
        id: "account-2",
        displayName: "Closed card",
        providerLabel: "ICICI Bank",
        accountType: "card",
        currency: "INR",
        statementHolderName: null,
        sourceProfiles: ["hdfc-bank-csv"],
        transactionCount: 4,
        lastImportedAt: null,
        active: false
      }
    ]
  })),
  getMonthDashboards: vi.fn(async () => []),
  isCompleteImportDashboard: vi.fn((dashboard) => Boolean(dashboard.importBatch && dashboard.tally))
}));

test("renders the login entry point when no user is authenticated", async () => {
  const { default: HomePage } = await import("@/app/page");
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Sign in to FinState");
  expect(html).toContain("Create account");
  expect(html).toContain('name="displayName"');
  expect(html).toContain('name="email"');
  expect(html).toContain('name="password"');
  expect(html).not.toContain("Month-close intake");
});

test("renders the MVP 1 upload entry point for authenticated users", async () => {
  const { getCurrentUser } = await import("@/modules/auth/session");
  vi.mocked(getCurrentUser).mockResolvedValueOnce({
    id: "user-1",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const { default: HomePage } = await import("@/app/page");
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Admin User");
  expect(html).toContain("User profile");
  expect(html).toContain("Transactions");
  expect(html).toContain("Metadata");
  expect(html).toContain("Logout");
  expect(html).toContain("FinState Command Centre");
  expect(html).toContain("Month-close intake");
  expect(html).toContain("Statement month");
  expect(html).toContain("Source profile");
  expect(html).toContain("Auto-detect supported profile");
  expect(html).toContain("Upload all statement files");
  expect(html).toContain('name="statements"');
  expect(html).toContain("multiple");
  expect(html).toContain("Complete month view");
  expect(html).toContain("Month view");
  expect(html).toContain("Credit card coverage");
  expect(html).toContain("Supported sources");
  expect(html).toContain("Account name");
  expect(html).toContain('list="account-name-suggestions"');
  expect(html).toContain('<datalist id="account-name-suggestions">');
  expect(html).toContain('<option value="Primary account"></option>');
  expect(html).toContain(".csv,text/csv,.txt,text/plain");
  expect(html).toContain("Import in progress");
  expect(html).toContain("Run import");
  expect(html).toContain("Month cockpit");
});

test("renders metadata view and success toast for authenticated users", async () => {
  const { getCurrentUser } = await import("@/modules/auth/session");
  vi.mocked(getCurrentUser).mockResolvedValueOnce({
    id: "user-1",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const { default: HomePage } = await import("@/app/page");
  const page = await HomePage({
    searchParams: Promise.resolve({
      view: "metadata",
      success: "Import complete"
    })
  });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Import complete");
  expect(html).toContain("Linked accounts");
  expect(html).toContain(">2<");
  expect(html).toContain("icici-bank-csv");
  expect(html).toContain("hdfc-bank-csv");
  expect(html).toContain("Account register");
  expect(html).toContain("Primary account");
  expect(html).toContain("ICICI Bank");
  expect(html).toContain("bank");
  expect(html).toContain("INR");
  expect(html).toContain("12 transactions");
  expect(html).toContain("Active");
  expect(html).toContain("Closed card");
  expect(html).toContain("Inactive");
  expect(html).toContain('name="displayName"');
  expect(html).toContain('maxLength="80"');
  expect(html).not.toContain("Month cockpit");
});

test("renders structured multi-file import results in the toast stack", async () => {
  const { getCurrentUser } = await import("@/modules/auth/session");
  vi.mocked(getCurrentUser).mockResolvedValueOnce({
    id: "user-1",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const { default: HomePage } = await import("@/app/page");
  const page = await HomePage({
    searchParams: Promise.resolve({
      success: "Import processed",
      importResults: serializeImportResults([
        { filename: "file1.csv", status: "success", month: "2026-04", rowCount: 42 },
        { filename: "file2.csv", status: "skipped", month: "2026-04", rowCount: 0 },
        { filename: "file3.csv", status: "error", error: "This file format is not supported." }
      ])
    })
  });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Import processed");
  expect(html).toContain("file1.csv");
  expect(html).toContain("Imported");
  expect(html).toContain("April 2026");
  expect(html).toContain("42 rows");
  expect(html).toContain("file2.csv");
  expect(html).toContain("Already imported");
  expect(html).toContain("file3.csv");
  expect(html).toContain("This file format is not supported.");
});

test("passes the category URL filter into month dashboard loading", async () => {
  const { getCurrentUser } = await import("@/modules/auth/session");
  const persistence = await import("@/modules/imports/persistence");
  vi.mocked(getCurrentUser).mockResolvedValueOnce({
    id: "user-1",
    email: "admin@example.com",
    displayName: "Admin User",
    role: "admin",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  vi.mocked(persistence.getAvailableLedgerMonths).mockResolvedValueOnce(["2026-04"]);
  const { default: HomePage } = await import("@/app/page");

  await HomePage({
    searchParams: Promise.resolve({
      month: "2026-04",
      category: "food"
    })
  });

  expect(persistence.getMonthDashboards).toHaveBeenCalledWith({}, "2026-04", "user-1", "food");
});
