import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parseCreditCardStatementMonth } from "@/modules/source-profiles/icici-credit-card-csv";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

test("parses ICICI credit card statements into canonical rows", async () => {
  const rawCsv = await readFile("assets/sample/icici-creditcard-statement-mar-apr.csv", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("icici-credit-card-csv");
  expect(result.rows).toHaveLength(17);
  expect(result.rows[0]).toMatchObject({
    valueDate: "2026-03-20",
    transactionDate: "2026-03-20",
    description: "BUBBLES HAIR BEAUTY HYDERABAD IN",
    withdrawalAmount: "525",
    depositAmount: "0.00",
    balance: "0.00"
  });
  expect(result.rows[5]).toMatchObject({
    transactionDate: "2026-03-27",
    description: "RAZ*IRCTC HTTPS://WWW.I IN",
    withdrawalAmount: "0.00",
    depositAmount: "2040.72",
    balance: "0.00"
  });
});

test("extracts a complete calendar month from adjacent ICICI credit card billing periods", async () => {
  const rawStatements = await Promise.all([
    readFile("assets/sample/icici-creditcard-statement-mar-apr.csv", "utf8"),
    readFile("assets/sample/icici-creditcard-statement-apr-may.csv", "utf8")
  ]);

  const rows = parseCreditCardStatementMonth(rawStatements, "2026-04");

  expect(rows).toHaveLength(21);
  expect(rows.every((row) => row.transactionDate.startsWith("2026-04-"))).toBe(true);
  expect(new Set(rows.map((row) => row.rawRow["Sr.No."])).size).toBe(21);
  expect(rows[0]).toMatchObject({
    transactionDate: "2026-04-01",
    description: "BBPS Payment received",
    withdrawalAmount: "0.00",
    depositAmount: "5185"
  });
  expect(rows).toContainEqual(
    expect.objectContaining({
      transactionDate: "2026-04-20",
      description: "CLAUDE.AI SUBSCRIPTION ANTHROPIC.COM US*",
      withdrawalAmount: "2246.18",
      depositAmount: "0.00"
    })
  );
});
