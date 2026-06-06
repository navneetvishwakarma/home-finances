import { expect, test } from "vitest";
import { buildSourceAccountMetadata } from "@/modules/source-profiles/account-metadata";

test("obfuscates raw account references while preserving last four digits for matching", () => {
  const metadata = buildSourceAccountMetadata({
    accountHolderName: "NAVNEET KUMAR VISHWAKARMA",
    accountRef: "046801511047",
    accountType: "savings",
    providerAbbreviation: "ICICI",
    providerName: "ICICI Bank",
    providerType: "bank"
  });

  expect(metadata.accountRefLast4).toBe("1047");
  expect(metadata.accountRefObfuscated).toBe("XXXXXXXX1047");
  expect(JSON.stringify(metadata)).not.toContain("046801511047");
});
