import { parseCsvRecords } from "./csv";
import { iciciBankCsvProfile } from "./icici-bank-csv";

const sourceProfiles = [iciciBankCsvProfile];

export function parseSourceCsv(rawCsv: string) {
  const records = parseCsvRecords(rawCsv);

  for (const [headerIndex, headers] of records.entries()) {
    const profile = sourceProfiles.find((sourceProfile) => sourceProfile.detect(headers));

    if (profile) {
      return {
        profileId: profile.id,
        rows: profile.parse(rawCsv, headerIndex)
      };
    }
  }

  throw new Error("Unsupported CSV headers. Expected ICICI bank CSV transaction headers.");
}
