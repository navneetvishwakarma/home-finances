import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { AccountNameInput } from "@/modules/imports/AccountNameInput";

test("shows a case-insensitive duplicate account hint", () => {
  const html = renderToStaticMarkup(
    createElement(AccountNameInput, {
      activeAccountNames: ["Primary Account"],
      defaultValue: "primary account"
    })
  );

  expect(html).toContain('name="accountDisplayName"');
  expect(html).toContain('list="account-name-suggestions"');
  expect(html).toContain("An account named");
  expect(html).toContain("Primary Account");
  expect(html).toContain("already exists. Using it.");
});
