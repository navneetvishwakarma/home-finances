import { describe, expect, test } from "vitest";
import { classifyTransaction, transactionCategories } from "@/modules/classification/categories";

describe("transaction classification", () => {
  test("keeps specific savings and card payment rules ahead of generic transfer rules", () => {
    expect(classifyTransaction("MMT/INF/IWISH CONTRIBUTION")).toEqual({
      category: "savings_investments",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("NEFT CRED CREDIT CARD PAYMENT")).toEqual({
      category: "debt_cards",
      categorySource: "system_rule"
    });
  });

  test("classifies conservative deterministic defaults and fallbacks", () => {
    expect(classifyTransaction("APRIL SALARY CREDIT")).toEqual({
      category: "income",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("ATM CASH WITHDRAWAL CHARGE GST")).toEqual({
      category: "fees_taxes",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("IMPS TRANSFER TO SELF")).toEqual({
      category: "transfers",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("UPI/RAZORPAY/FOOD ORDER")).toEqual({
      category: "other",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("ACCT CLOSURE TRANSACTION 0354")).toEqual({
      category: "uncategorized",
      categorySource: "uncategorized"
    });
  });

  test("classifies ICICI broker, clearing, dividend, and EMI descriptions", () => {
    expect(classifyTransaction("ACH/ZERODHA BROKING LTD/ICIC7022405230017493/MV634N8WJASIKB")).toEqual({
      category: "savings_investments",
      categorySource: "system_rule"
    });
    expect(
      classifyTransaction(
        "ACH/INDIAN CLEARING CORP/ICIC7022405230017493/0000QZ68AIE5CCX55G260970486561"
      )
    ).toEqual({
      category: "savings_investments",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("NEFT/INDIAN CLEARING CORPORATION LIMITED/SETTLEMENT")).toEqual({
      category: "savings_investments",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("BIL/Home Loan XX82258 EMI Akanksha")).toEqual({
      category: "emis",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("ACH/IREDA INTDIV 202526/2055425")).toEqual({
      category: "income",
      categorySource: "system_rule"
    });
    expect(classifyTransaction("CMS/001926713864/ADTPSLSIPG__00000016003")).toEqual({
      category: "savings_investments",
      categorySource: "system_rule"
    });
  });

  test("exposes fixed built-in category definitions", () => {
    expect(transactionCategories.map((category) => category.slug)).toEqual([
      "income",
      "rent_home",
      "food",
      "transport",
      "utilities",
      "healthcare",
      "savings_investments",
      "emis",
      "debt_cards",
      "transfers",
      "fees_taxes",
      "shopping",
      "travel",
      "entertainment",
      "education",
      "other",
      "uncategorized"
    ]);
  });
});
