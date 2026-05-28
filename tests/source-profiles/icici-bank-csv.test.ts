import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

test("selects the ICICI CSV profile and returns canonical parsed rows", async () => {
  const rawCsv = await readFile("assets/sample/2604-icici-savings-statement.csv", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("icici-bank-csv");
  expect(result.rows[0]).toMatchObject({
    transactionDate: "2026-04-02",
    description: "ACCT CLOSURE TRANSACTION 0354",
    withdrawalAmount: "0.00",
    depositAmount: "149200.00",
    balance: "152268.46"
  });
});

test("rejects unsupported CSV headers with an actionable error", () => {
  const unsupportedCsv = "Date,Narration,Debit,Credit,Balance\n2026-04-01,Opening,0.00,10.00,10.00";

  expect(() => parseSourceCsv(unsupportedCsv)).toThrow(
    "Unsupported CSV headers. Expected a supported bank or card statement CSV."
  );
});
