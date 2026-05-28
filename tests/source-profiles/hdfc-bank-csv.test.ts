import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

test("parses HDFC savings delimited text statements into canonical rows", async () => {
  const rawCsv = await readFile("assets/sample/hdfc-savings-statement-delimited.txt", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("hdfc-bank-csv");
  expect(result.rows).toHaveLength(28);
  expect(result.rows[0]).toMatchObject({
    valueDate: "2026-04-01",
    transactionDate: "2026-04-01",
    description: "UPI-CRED-CRED.CLUB@AXISB-UTIB0000114-609125829210-PAYMENT ON CRED",
    withdrawalAmount: "5185.00",
    depositAmount: "0.00",
    balance: "5434.19"
  });
  expect(result.rows.at(-1)).toMatchObject({
    valueDate: "2026-04-29",
    transactionDate: "2026-04-29",
    withdrawalAmount: "0.00",
    depositAmount: "5.00",
    balance: "11584.69"
  });
});

test("parses HDFC savings XLS-to-CSV statements and ignores footer summary rows", async () => {
  const rawCsv = await readFile("assets/sample/hdfc-savings-statement-xls2csv.csv", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("hdfc-bank-csv");
  expect(result.rows).toHaveLength(28);
  expect(result.rows[1]).toMatchObject({
    transactionDate: "2026-04-01",
    description: "UPI-RAJARAM ICE CREAM AN-Q723793560@YBL-YESB0YBLUPI-120886878049-BAKERY",
    withdrawalAmount: "115",
    depositAmount: "0.00",
    balance: "5319.19"
  });
  expect(result.rows.at(-1)?.description).toBe(
    "UPI-SYED KULSUM-8923512579@PTYES-NSPB0000002-301633637989-SENT USING PAYTM U"
  );
});
