import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parseSourceCsv } from "@/modules/source-profiles/registry";

test("selects the ICICI CSV profile and returns canonical parsed rows", async () => {
  const rawCsv = await readFile("assets/sample/icici-savings-sample-01.csv", "utf8");

  const result = parseSourceCsv(rawCsv);

  expect(result.profileId).toBe("icici-bank-csv");
  expect(result.rows).toHaveLength(62);
  expect(result.metadata).toEqual({
    accountHolderName: "NAVNEET KUMAR VISHWAKARMA",
    institutionName: "ICICI Bank",
    linkedAccountRef: "XXXXXXX11047"
  });
  expect(result.rows[0]).toMatchObject({
    transactionDate: "2026-05-04",
    description: "UPI/NAVNEET KU/navneet.nifft-/RDs/HDFC BANK/122615852638/HDF58f4840ac39b4f1186c297b72148f332",
    withdrawalAmount: "0.00",
    depositAmount: "25000.00",
    balance: "33690.77"
  });
  expect(result.rows[20].description).toBe(
    "ACH/ZERODHA BROKING LTD/ICIC7022405230017493/XE6S82M6MF9YOX"
  );
  expect(result.rows[48].description).toBe(
    "ACH/INDIAN CLEARING CORP/ICIC7022405230017493/00002EAJSKFMQ2R1ON261410084002"
  );
});

test("rejects unsupported CSV headers with an actionable error", () => {
  const unsupportedCsv = "Date,Narration,Debit,Credit,Balance\n2026-04-01,Opening,0.00,10.00,10.00";

  expect(() => parseSourceCsv(unsupportedCsv)).toThrow(
    "Unsupported CSV headers. Expected a supported bank or card statement CSV."
  );
});
