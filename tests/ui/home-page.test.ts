import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("@/db/client", () => ({
  getMigratedDatabase: vi.fn(async () => ({}))
}));

vi.mock("@/modules/auth/session", () => ({
  getCurrentUser: vi.fn(async () => null)
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
  getAccountMetadataSummary: vi.fn(async () => ({
    accountCount: 2,
    sourceProfiles: ["icici-bank-csv", "hdfc-bank-csv"]
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
  expect(html).not.toContain("Month cockpit");
});
