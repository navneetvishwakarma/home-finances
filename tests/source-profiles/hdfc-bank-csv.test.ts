import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

test("parses HDFC savings delimited text statements into canonical rows", async () => {
  const rawCsv = await readFile("assets/sample/hdfc-savings-sample-01.csv", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("hdfc-bank-csv");
  expect(result.rows).toHaveLength(30);
  expect(result.metadata).toEqual({
    accountHolderName: "MR. NAVNEET KUMAR VISHWAKARMA",
    accountName: "HDFC-UNK-0502",
    accountRefLast4: "0502",
    accountRefObfuscated: "XXXXXXXXXX0502",
    accountType: "unknown",
    currency: "INR",
    metadataConfidence: "extracted",
    metadataWarnings: ["Account type not captured in statement metadata."],
    providerAbbreviation: "HDFC",
    providerName: "HDFC Bank",
    providerType: "bank"
  });
  expect(result.rows[0]).toMatchObject({
    valueDate: "2026-05-02",
    transactionDate: "2026-05-02",
    description: "UPI-KANAPURAM RAJU-KANAPURAMRAJU7@OKHDFCBANK-UBIN0815675-122466173855-F1201",
    withdrawalAmount: "240",
    depositAmount: "0.00",
    balance: "11344.69"
  });
  expect(result.rows.at(-1)).toMatchObject({
    valueDate: "2026-05-31",
    transactionDate: "2026-05-31",
    withdrawalAmount: "55385",
    depositAmount: "0.00",
    balance: "6589.67"
  });
});
