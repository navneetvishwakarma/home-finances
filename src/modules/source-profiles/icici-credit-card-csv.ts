import { parseCsvRecords } from "./csv";
import type { CanonicalParsedRow } from "./icici-bank-csv";

const ICICI_CREDIT_CARD_HEADERS = [
  "Date",
  "Sr.No.",
  "Transaction Details",
  "Reward Point Header",
  "Intl.Amount",
  "Amount(in Rs)",
  "BillingAmountSign"
];

const ICICI_CURRENT_CREDIT_CARD_HEADERS = [
  "Transaction Date",
  "Details",
  "Amount (INR)",
  "Reference Number"
];

export const iciciCreditCardCsvProfile = {
  id: "icici-credit-card-csv",
  detect(headers: string[]) {
    return isDetailedStatementHeaders(headers) || isCurrentStatementHeaders(headers);
  },
  parse(rawCsv: string, headerIndex: number): CanonicalParsedRow[] {
    const records = parseCsvRecords(rawCsv);
    const headers = records[headerIndex];
    const dataRecords = records.slice(headerIndex + 1);

    if (isCurrentStatementHeaders(headers)) {
      return parseCurrentStatementRows(dataRecords, headers);
    }

    return dataRecords
      .filter((record) => isDetailedTransactionRecord(record, headers))
      .map((record, index) => {
        const rawRow = Object.fromEntries(headers.map((header, column) => [header, record[column] ?? ""]));
        rawRow["Source Row Number"] = String(index + 1);
        rawRow["Transaction Reference"] = cell(record, headers, "Sr.No.");
        const amount = cell(record, headers, "Amount(in Rs)");
        const isCredit = cell(record, headers, "BillingAmountSign") === "CR";

        return {
          valueDate: parseIciciCreditCardDate(cell(record, headers, "Date")),
          transactionDate: parseIciciCreditCardDate(cell(record, headers, "Date")),
          description: cell(record, headers, "Transaction Details"),
          withdrawalAmount: isCredit ? "0.00" : amount,
          depositAmount: isCredit ? amount : "0.00",
          balance: "0.00",
          rawRow
        };
      });
  }
};

function parseCurrentStatementRows(dataRecords: string[][], headers: string[]) {
  return dataRecords
    .filter((record) => isCurrentTransactionRecord(record, headers))
    .map((record, index) => {
      const rawRow = Object.fromEntries(headers.map((header, column) => [header, record[column] ?? ""]));
      rawRow["Source Row Number"] = String(index + 1);
      rawRow["Transaction Reference"] = cell(record, headers, "Reference Number");
      const parsedAmount = parseSignedAmount(cell(record, headers, "Amount (INR)"));

      return {
        valueDate: parseIciciCreditCardDate(cell(record, headers, "Transaction Date")),
        transactionDate: parseIciciCreditCardDate(cell(record, headers, "Transaction Date")),
        description: cell(record, headers, "Details"),
        withdrawalAmount: parsedAmount.sign === "Dr" ? parsedAmount.amount : "0.00",
        depositAmount: parsedAmount.sign === "Cr" ? parsedAmount.amount : "0.00",
        balance: "0.00",
        rawRow
      };
    });
}

export function parseCreditCardStatementMonth(rawStatements: string[], month: string) {
  const rowsByTransactionId = new Map<string, CanonicalParsedRow>();

  for (const rawStatement of rawStatements) {
    const records = parseCsvRecords(rawStatement);
    const headerIndex = records.findIndex((headers) => iciciCreditCardCsvProfile.detect(headers));

    if (headerIndex === -1) {
      throw new Error("Unsupported ICICI credit card statement headers.");
    }

    for (const row of iciciCreditCardCsvProfile.parse(rawStatement, headerIndex)) {
      if (row.transactionDate.startsWith(`${month}-`)) {
        rowsByTransactionId.set(row.rawRow["Transaction Reference"], row);
      }
    }
  }

  return Array.from(rowsByTransactionId.values()).sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) ||
      String(left.rawRow["Transaction Reference"]).localeCompare(String(right.rawRow["Transaction Reference"]))
  );
}

function cell(record: string[], headers: string[], header: string) {
  return record[headers.indexOf(header)] ?? "";
}

function isDetailedStatementHeaders(headers: string[]) {
  return ICICI_CREDIT_CARD_HEADERS.every((header) => headers.includes(header));
}

function isCurrentStatementHeaders(headers: string[]) {
  return ICICI_CURRENT_CREDIT_CARD_HEADERS.every((header) => headers.includes(header));
}

function isDetailedTransactionRecord(record: string[], headers: string[]) {
  return /^\d{2}[/-]\d{2}[/-]\d{4}$/.test(cell(record, headers, "Date")) &&
    /^\d+$/.test(cell(record, headers, "Sr.No."));
}

function isCurrentTransactionRecord(record: string[], headers: string[]) {
  return /^\d{2}-\d{2}-\d{4}$/.test(cell(record, headers, "Transaction Date")) &&
    /^\d+(\.\d+)?\s+(Dr|Cr)\.$/.test(cell(record, headers, "Amount (INR)"));
}

function parseIciciCreditCardDate(value: string) {
  const [day, month, year] = value.split(/[/-]/);
  return `${year}-${month}-${day}`;
}

function parseSignedAmount(value: string) {
  const match = value.match(/^(\d+(?:\.\d+)?)\s+(Dr|Cr)\.$/);

  if (!match) {
    throw new Error(`Unsupported ICICI credit card amount value: ${value}`);
  }

  return {
    amount: match[1],
    sign: match[2] as "Dr" | "Cr"
  };
}
