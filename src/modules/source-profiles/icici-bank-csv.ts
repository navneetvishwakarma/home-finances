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
  parse(rawCsv: string, headerIndex: number): CanonicalParsedRow[] {
    const records = parseCsvRecords(rawCsv);
    const headers = records[headerIndex];
    const dataRecords = records.slice(headerIndex + 1);

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
