import { parseCsvRecords } from "./csv";
import { hdfcBankCsvProfile } from "./hdfc-bank-csv";
import { iciciBankCsvProfile } from "./icici-bank-csv";
import { iciciCreditCardCsvProfile } from "./icici-credit-card-csv";

const sourceProfiles = [iciciBankCsvProfile, hdfcBankCsvProfile, iciciCreditCardCsvProfile];

export function parseSourceCsv(rawCsv: string) {
  const records = parseCsvRecords(rawCsv);

  for (const [headerIndex, headers] of records.entries()) {
    const profile = sourceProfiles.find((sourceProfile) => sourceProfile.detect(headers));

    if (profile) {
      return {
        profileId: profile.id,
        metadata: sourceMetadata(profile, rawCsv),
        rows: profile.parse(rawCsv, headerIndex)
      };
    }
  }

  throw new Error("Unsupported CSV headers. Expected a supported bank or card statement CSV.");
}

function sourceMetadata(profile: (typeof sourceProfiles)[number], rawCsv: string) {
  if ("metadata" in profile && typeof profile.metadata === "function") {
    return profile.metadata(rawCsv);
  }

  return undefined;
}
