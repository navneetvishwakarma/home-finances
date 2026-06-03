import { parseCsvRecords } from "./csv";

const ICICI_HEADERS = [
  "S No.",
  "Value Date",
  "Transaction Date",
  "Cheque Number",
  "Transaction Remarks",
  "Withdrawal Amount(INR)",
  "Deposit Amount(INR)",
  "Balance(INR)"
];

export type CanonicalParsedRow = {
  valueDate: string;
  transactionDate: string;
  description: string;
  withdrawalAmount: string;
  depositAmount: string;
  balance: string;
  rawRow: Record<string, string>;
};

export const iciciBankCsvProfile = {
  id: "icici-bank-csv",
  detect(headers: string[]) {
    return ICICI_HEADERS.every((header) => headers.includes(header));
  },
  metadata(rawCsv: string) {
    const records = parseCsvRecords(rawCsv);
    const accountLine = records.find((record) => record.some((value) => value.trim() === "Account Number"));
    const accountCell = accountLine?.find((value) => /\d+\s*\(\s*INR\s*\)/.test(value)) ?? "";
    const match = accountCell.match(/(\d+)\s*\(\s*INR\s*\)\s*-\s*(.+)$/);

    if (!match) {
      return {
        institutionName: "ICICI Bank"
      };
    }

    return {
      accountHolderName: match[2].trim(),
      institutionName: "ICICI Bank",
      linkedAccountRef: obfuscateAccountRef(match[1])
    };
  },
  parse(rawCsv: string, headerIndex: number): CanonicalParsedRow[] {
    const records = parseCsvRecords(rawCsv);
    const headers = records[headerIndex];
    const dataRecords = mergeContinuationRows(records.slice(headerIndex + 1), headers);

    return dataRecords
      .filter((record) => isTransactionRecord(record, headers))
      .map((record) => {
        const rawRow = Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""]));

        return {
          valueDate: parseIciciDate(cell(record, headers, "Value Date")),
          transactionDate: parseIciciDate(cell(record, headers, "Transaction Date")),
          description: cell(record, headers, "Transaction Remarks"),
          withdrawalAmount: cell(record, headers, "Withdrawal Amount(INR)"),
          depositAmount: cell(record, headers, "Deposit Amount(INR)"),
          balance: cell(record, headers, "Balance(INR)"),
          rawRow
        };
      });
  }
};

function mergeContinuationRows(records: string[][], headers: string[]) {
  const mergedRecords: string[][] = [];

  for (const record of records) {
    if (isTransactionRecord(record, headers)) {
      mergedRecords.push([...record]);
      continue;
    }

    const currentRecord = mergedRecords.at(-1);
    const continuedDescription = cell(record, headers, "Transaction Remarks");

    if (currentRecord && continuedDescription !== "") {
      const descriptionIndex = headers.indexOf("Transaction Remarks");
      currentRecord[descriptionIndex] = [currentRecord[descriptionIndex], continuedDescription]
        .filter((value) => value && value.trim() !== "")
        .join(" ");
    }
  }

  return mergedRecords;
}

function cell(record: string[], headers: string[], header: string) {
  return record[headers.indexOf(header)] ?? "";
}

function isTransactionRecord(record: string[], headers: string[]) {
  return /^\d+$/.test(cell(record, headers, "S No.")) &&
    /^\d{2}\/\d{2}\/\d{4}$/.test(cell(record, headers, "Transaction Date"));
}

function parseIciciDate(value: string) {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function obfuscateAccountRef(value: string) {
  const visibleDigits = value.slice(-5);
  return `${"X".repeat(Math.max(value.length - visibleDigits.length, 0))}${visibleDigits}`;
}
