import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import HomePage from "@/app/page";

test("renders the MVP 1 upload entry point", async () => {
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(createElement(() => page));

  expect(html).toContain("Import ICICI statement");
  expect(html).toContain("Account name");
  expect(html).toContain("CSV statement");
  expect(html).toContain("Run import");
});
