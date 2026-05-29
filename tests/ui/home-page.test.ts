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
  getMonthDashboards: vi.fn(async () => []),
  isCompleteImportDashboard: vi.fn((dashboard) => Boolean(dashboard.importBatch && dashboard.tally))
}));

test("renders the login entry point when no user is authenticated", async () => {
  const { default: HomePage } = await import("@/app/page");
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Sign in to FinState");
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
    passwordHash: "hash",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const { default: HomePage } = await import("@/app/page");
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Admin User");
  expect(html).toContain("Sign out");
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
  expect(html).toContain("Run import");
  expect(html).toContain("Month cockpit");
});
