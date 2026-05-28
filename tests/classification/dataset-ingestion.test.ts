import { describe, expect, test } from "vitest";
import {
  extractMerchantPattern,
  mapDatasetCategory,
  normalizeTransactionText,
  parseClassificationDatasetCsv
} from "@/modules/classification/dataset-ingestion";

describe("classification dataset ingestion", () => {
  test("maps dataset labels into built-in category slugs without merging EMIs into debt cards", () => {
    expect(mapDatasetCategory("EMI")).toBe("emis");
    expect(mapDatasetCategory("emi")).toBe("emis");
    expect(mapDatasetCategory("Investment")).toBe("savings_investments");
    expect(mapDatasetCategory("education")).toBe("education");
    expect(mapDatasetCategory("Shopping")).toBe("shopping");
  });

  test("normalizes synthetic transaction text before storing examples", () => {
    expect(normalizeTransactionText("Zomato dinner bill | Ref:18e6bb08 | Amount: INR 43789.75")).toBe(
      "zomato dinner bill"
    );
    expect(normalizeTransactionText("Netflix subscription INR 33127 TXN6001238b")).toBe(
      "netflix subscription"
    );
  });

  test("extracts conservative merchant patterns and rejects generic rows", () => {
    expect(extractMerchantPattern("HDFC home loan EMI | Ref:44608adc | Amount: INR 15811.51")).toBe(
      "hdfc home loan emi"
    );
    expect(extractMerchantPattern("Zerodha stock purchase | Ref:d11e7109 | Amount: INR 31175.93")).toBe(
      "zerodha"
    );
    expect(extractMerchantPattern("NEFT TRANSFER TO SELF")).toBeUndefined();
  });

  test("parses both local dataset CSV shapes", () => {
    const lowerCaseCsv = "transaction_text,category\nCredit card EMI INR 33532 TXNd9902ece,emi\n";
    const titleCaseCsv =
      "Transaction_Text,Label\nZerodha stock purchase | Ref:d11e7109 | Amount: INR 31175.93,Investment\n";

    expect(parseClassificationDatasetCsv(lowerCaseCsv)).toEqual([
      {
        originalText: "Credit card EMI INR 33532 TXNd9902ece",
        normalizedText: "credit card emi",
        category: "emis",
        sourceRowHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      }
    ]);
    expect(parseClassificationDatasetCsv(titleCaseCsv)).toEqual([
      {
        originalText: "Zerodha stock purchase | Ref:d11e7109 | Amount: INR 31175.93",
        normalizedText: "zerodha stock purchase",
        category: "savings_investments",
        sourceRowHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      }
    ]);
  });
});
