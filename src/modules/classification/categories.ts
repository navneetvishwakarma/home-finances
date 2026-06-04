export const transactionCategories = [
  { slug: "income", label: "Income" },
  { slug: "rent_home", label: "Rent & Home" },
  { slug: "food", label: "Food" },
  { slug: "transport", label: "Transport" },
  { slug: "utilities", label: "Utilities" },
  { slug: "healthcare", label: "Healthcare" },
  { slug: "savings_investments", label: "Savings & Investments" },
  { slug: "emis", label: "EMIs" },
  { slug: "debt_cards", label: "Debt & Cards" },
  { slug: "transfers", label: "Transfers" },
  { slug: "fees_taxes", label: "Fees & Taxes" },
  { slug: "shopping", label: "Shopping" },
  { slug: "travel", label: "Travel" },
  { slug: "entertainment", label: "Entertainment" },
  { slug: "education", label: "Education" },
  { slug: "other", label: "Other" },
  { slug: "uncategorized", label: "Uncategorized" }
] as const;

export type TransactionCategory = (typeof transactionCategories)[number]["slug"];
export type TransactionCategorySource =
  | "manual"
  | "learned_rule"
  | "seed_rule"
  | "ai"
  | "system_rule"
  | "uncategorized";

export function classifyTransaction(description: string): {
  category: TransactionCategory;
  categorySource: TransactionCategorySource;
} {
  const normalized = description.toUpperCase();

  if (/\b(ZERODHA|INDIAN\s+CLEARING\s+CORP(?:ORATION)?|BROKING)\b|SIPG/.test(normalized)) {
    return { category: "savings_investments", categorySource: "system_rule" };
  }

  if (/\bEMI\b|HOME\s+LOAN|CAR\s+LOAN|BIKE\s+LOAN|PERSONAL\s+LOAN/.test(normalized)) {
    return { category: "emis", categorySource: "system_rule" };
  }

  if (/\b(INTDIV|DIVIDEND)\b/.test(normalized)) {
    return { category: "income", categorySource: "system_rule" };
  }

  if (/\b(IWISH|PPF)\b/.test(normalized)) {
    return { category: "savings_investments", categorySource: "system_rule" };
  }

  if (/\bCRED\b|CREDIT\s+CARD|CARD\s+PAYMENT|CC\s+PAYMENT/.test(normalized)) {
    return { category: "debt_cards", categorySource: "system_rule" };
  }

  if (/\b(SALARY|PAYROLL|INTEREST)\b/.test(normalized)) {
    return { category: "income", categorySource: "system_rule" };
  }

  if (/\b(FEE|FEES|CHARGE|CHARGES|TAX|COMMISSION|GST)\b/.test(normalized)) {
    return { category: "fees_taxes", categorySource: "system_rule" };
  }

  if (/\b(NEFT|IMPS|MMT)\b/.test(normalized)) {
    return { category: "transfers", categorySource: "system_rule" };
  }

  if (/\bUPI\b/.test(normalized)) {
    return { category: "other", categorySource: "system_rule" };
  }

  return { category: "uncategorized", categorySource: "uncategorized" };
}

export function isTransactionCategory(value: string): value is TransactionCategory {
  return transactionCategories.some((category) => category.slug === value);
}

export function categoryLabel(slug: TransactionCategory | string) {
  return transactionCategories.find((category) => category.slug === slug)?.label ?? slug;
}
