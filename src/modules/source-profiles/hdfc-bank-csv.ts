import { parseCsvRecords } from "./csv";
import type { CanonicalParsedRow } from "./icici-bank-csv";

const HDFC_HEADER_ALIASES = {
  transactionDate: ["Date"],
  description: ["Narration"],
  referenceNumber: ["Chq/Ref Number", "Chq./Ref.No."],
  valueDate: ["Value Dat", "Value Dt"],
  withdrawalAmount: ["Debit Amount", "Withdrawal Amt."],
  depositAmount: ["Credit Amount", "Deposit Amt."],
  balance: ["Closing Balance"]
};

export const hdfcBankCsvProfile = {
  id: "hdfc-bank-csv",
  detect(headers: string[]) {
    return Object.values(HDFC_HEADER_ALIASES).every((aliases) =>
      aliases.some((header) => headers.includes(header))
    );
  },
  parse(rawCsv: string, headerIndex: number): CanonicalParsedRow[] {
    const records = parseCsvRecords(rawCsv);
    const headers = records[headerIndex];
    const dataRecords = records.slice(headerIndex + 1);

    return dataRecords
      .filter((record) => isTransactionRecord(record, headers))
      .map((record, index) => {
        const rawRow = Object.fromEntries(headers.map((header, column) => [header, record[column] ?? ""]));
        rawRow["Source Row Number"] = String(index + 1);

        return {
          valueDate: parseHdfcDate(cell(record, headers, HDFC_HEADER_ALIASES.valueDate)),
          transactionDate: parseHdfcDate(cell(record, headers, HDFC_HEADER_ALIASES.transactionDate)),
          description: cell(record, headers, HDFC_HEADER_ALIASES.description),
          withdrawalAmount: amountOrZero(cell(record, headers, HDFC_HEADER_ALIASES.withdrawalAmount)),
          depositAmount: amountOrZero(cell(record, headers, HDFC_HEADER_ALIASES.depositAmount)),
          balance: cell(record, headers, HDFC_HEADER_ALIASES.balance),
          rawRow
        };
      });
  }
};

function cell(record: string[], headers: string[], aliases: string[]) {
  const header = aliases.find((candidate) => headers.includes(candidate));

  if (!header) {
    return "";
  }

  return record[headers.indexOf(header)] ?? "";
}

function isTransactionRecord(record: string[], headers: string[]) {
  return /^\d{2}\/\d{2}\/\d{2}$/.test(cell(record, headers, HDFC_HEADER_ALIASES.transactionDate));
}

function parseHdfcDate(value: string) {
  const [day, month, shortYear] = value.split("/");
  return `20${shortYear}-${month}-${day}`;
}

function amountOrZero(value: string) {
  return value === "" ? "0.00" : value;
}
