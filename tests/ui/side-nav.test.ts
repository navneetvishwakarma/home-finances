import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SideNav } from "@/modules/navigation/SideNav";

const currentUser = {
  displayName: "Admin User",
  email: "admin@example.com"
};

test("renders expanded side navigation with identity and collapse control", () => {
  const html = renderToStaticMarkup(
    createElement(SideNav, {
      currentUser,
      selectedView: "transactions",
      logoutAction: async () => undefined
    })
  );

  expect(html).toContain('aria-label="Collapse side navigation"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("Admin User");
  expect(html).toContain("admin@example.com");
  expect(html).toContain("User profile");
  expect(html).toContain("Transactions");
  expect(html).toContain("Metadata");
  expect(html).toContain("Logout");
  expect(html).toContain('class="is-active"');
});

test("renders collapsed side navigation as icon-only accessible controls", () => {
  const html = renderToStaticMarkup(
    createElement(SideNav, {
      currentUser,
      selectedView: "metadata",
      logoutAction: async () => undefined,
      initialCollapsed: true
    })
  );

  expect(html).toContain("side-nav is-collapsed");
  expect(html).toContain('aria-label="Expand side navigation"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("admin@example.com");
  expect(html).toContain('aria-label="User profile"');
  expect(html).toContain('aria-label="Transactions"');
  expect(html).toContain('aria-label="Metadata"');
  expect(html).toContain('aria-label="Logout"');
  expect(html).toContain('title="Metadata"');
  expect(html).toContain('class="is-active"');
});
