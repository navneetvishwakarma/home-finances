import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import HomePage from "@/app/page";

test("renders the MVP 1 upload entry point", async () => {
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("FinState Command Centre");
  expect(html).toContain("Statement intake");
  expect(html).toContain("Source profile");
  expect(html).toContain("Auto-detect supported profile");
  expect(html).toContain("Supported sources");
  expect(html).toContain("Account name");
  expect(html).toContain("Statement file");
  expect(html).toContain(".csv,text/csv,.txt,text/plain");
  expect(html).toContain("Run import");
  expect(html).toContain("Reconciliation cockpit");
});
