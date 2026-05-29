import { expect, test } from "vitest";
import {
  mapImportErrorMessage,
  parseImportResults,
  serializeImportResults
} from "@/modules/imports/import-results";

test("maps known import errors to actionable copy", () => {
  expect(mapImportErrorMessage(new Error("Unsupported CSV headers"))).toBe(
    "This file format is not supported. Supported: ICICI bank CSV, HDFC bank CSV, ICICI credit card CSV."
  );
  expect(mapImportErrorMessage(new Error("File contains no transactions."))).toBe("File contains no transactions.");
  expect(mapImportErrorMessage(new Error("connection refused"))).toBe("Import failed due to a system error. Try again.");
});

test("serializes and parses import results for redirect URLs", () => {
  const results = [
    { filename: "file1.csv", status: "success" as const, month: "2026-04", rowCount: 42 },
    { filename: "file2.csv", status: "skipped" as const, month: "2026-04", rowCount: 0 },
    { filename: "file3.csv", status: "error" as const, error: "Unsupported CSV headers" }
  ];

  expect(parseImportResults(serializeImportResults(results))).toEqual(results);
});
