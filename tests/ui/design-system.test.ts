import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("documents the cross-platform glass design system", async () => {
  const designSystem = await readFile("design-system/MASTER.md", "utf8");

  expect(designSystem).toContain("Home Finances Glass Design System");
  expect(designSystem).toContain("Web CSS Tokens");
  expect(designSystem).toContain("Apple Token Mapping");
  expect(designSystem).toContain("Android Token Mapping");
  expect(designSystem).toContain("Accessibility Rules");
});

test("applies shared glass tokens in the web stylesheet", async () => {
  const css = await readFile("src/app/globals.css", "utf8");

  expect(css).toContain("--surface-glass");
  expect(css).toContain("--shadow-glass");
  expect(css).toContain("--focus-ring");
  expect(css).toContain("backdrop-filter: blur(var(--blur-glass))");
  expect(css).toContain("font-family: var(--font-sans)");
});
