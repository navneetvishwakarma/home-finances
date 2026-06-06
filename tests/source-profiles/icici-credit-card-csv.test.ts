import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parseCreditCardStatementMonth } from "@/modules/source-profiles/icici-credit-card-csv";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

test("parses ICICI credit card statements into canonical rows", async () => {
  const rawCsv = await readFile("assets/sample/icici-creditcard-sample-02.CSV", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("icici-credit-card-csv");
  expect(result.rows).toHaveLength(40);
  expect(result.metadata).toEqual({
    accountHolderName: "Mr NAVNEET KUMAR VISHWAKARMA",
    accountName: "ICICI-CC-7000",
    accountRefLast4: "7000",
    accountRefObfuscated: "4611XXXXXXXX7000",
    accountType: "credit_card",
    currency: "INR",
    metadataConfidence: "extracted",
    metadataWarnings: [],
    providerAbbreviation: "ICICI",
    providerName: "ICICI Bank",
    providerType: "card_issuer"
  });
  expect(result.rows[0]).toMatchObject({
    valueDate: "2026-04-19",
    transactionDate: "2026-04-19",
    description: "DISTRICT DINING CYBS GURGAON IN",
    withdrawalAmount: "100.00",
    depositAmount: "0.00",
    balance: "0.00"
  });
  expect(result.rows[1]).toMatchObject({
    transactionDate: "2026-04-19",
    description: "DISTRICT DINING CYBS GURGAON IN",
    withdrawalAmount: "0.00",
    depositAmount: "100.00",
    balance: "0.00"
  });
});

test("parses ICICI current credit card statements with Dr and Cr amount suffixes", async () => {
  const rawCsv = await readFile("assets/sample/icici-creditcard-sample-01.csv", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("icici-credit-card-csv");
  expect(result.rows).toHaveLength(20);
  expect(result.rows[0]).toMatchObject({
    valueDate: "2026-05-29",
    transactionDate: "2026-05-29",
    description: "BLINKIT, GURGAON, IN",
    withdrawalAmount: "1575",
    depositAmount: "0.00",
    balance: "0.00"
  });
  expect(result.rows[4]).toMatchObject({
    transactionDate: "2026-05-27",
    description: "67782",
    withdrawalAmount: "0.00",
    depositAmount: "10",
    balance: "0.00"
  });
});

test("extracts a complete calendar month from adjacent ICICI credit card samples", async () => {
  const rawStatements = await Promise.all([
    readFile("assets/sample/icici-creditcard-sample-02.CSV", "utf8"),
    readFile("assets/sample/icici-creditcard-sample-01.csv", "utf8")
  ]);

  const rows = parseCreditCardStatementMonth(rawStatements, "2026-05");

  expect(rows).toHaveLength(49);
  expect(rows.every((row) => row.transactionDate.startsWith("2026-05-"))).toBe(true);
  expect(new Set(rows.map((row) => row.rawRow["Transaction Reference"])).size).toBe(49);
  expect(rows[0]).toMatchObject({
    transactionDate: "2026-05-01",
    description: "HIGRADE SERVICE CENTER RANGA REDDY IN",
    withdrawalAmount: "2020.00",
    depositAmount: "0.00"
  });
  expect(rows).toContainEqual(
    expect.objectContaining({
      transactionDate: "2026-05-29",
      description: "BLINKIT, GURGAON, IN",
      withdrawalAmount: "1575",
      depositAmount: "0.00"
    })
  );
});
