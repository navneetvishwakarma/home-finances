export type AccountType = "savings" | "current" | "credit_card" | "wallet" | "unknown";
export type ProviderType = "bank" | "card_issuer" | "wallet" | "unknown";
export type MetadataConfidence = "extracted" | "defaulted" | "user_provided";

export type SourceAccountMetadata = {
  accountHolderName?: string;
  accountName: string;
  accountRefLast4?: string;
  accountRefObfuscated?: string;
  accountType: AccountType;
  currency: string;
  metadataConfidence: MetadataConfidence;
  metadataWarnings: string[];
  providerAbbreviation: string;
  providerName: string;
  providerType: ProviderType;
};

const accountTypeAbbreviations: Record<AccountType, string> = {
  savings: "SAV",
  current: "CUR",
  credit_card: "CC",
  wallet: "WAL",
  unknown: "UNK"
};

export function buildSourceAccountMetadata(input: {
  accountHolderName?: string;
  accountRef?: string;
  accountType?: AccountType;
  currency?: string;
  providerAbbreviation: string;
  providerName: string;
  providerType: ProviderType;
}) {
  const accountRefDigits = input.accountRef?.replace(/\D/g, "") ?? "";
  const accountRefLast4 = accountRefDigits ? accountRefDigits.slice(-4) : undefined;
  const accountRefObfuscated = obfuscatedAccountRef(input.accountRef, accountRefLast4);
  const accountType = input.accountType ?? "unknown";
  const metadataWarnings = [];

  if (!input.accountHolderName) {
    metadataWarnings.push("Account holder not captured in statement metadata.");
  }

  if (!accountRefLast4) {
    metadataWarnings.push("Account number not captured in statement metadata.");
  }

  if (accountType === "unknown") {
    metadataWarnings.push("Account type not captured in statement metadata.");
  }

  return {
    accountHolderName: input.accountHolderName,
    accountName: generatedAccountName(input.providerAbbreviation, accountType, accountRefLast4),
    accountRefLast4,
    accountRefObfuscated,
    accountType,
    currency: input.currency ?? "INR",
    metadataConfidence: accountRefLast4 ? "extracted" : "defaulted",
    metadataWarnings,
    providerAbbreviation: input.providerAbbreviation,
    providerName: input.providerName,
    providerType: input.providerType
  } satisfies SourceAccountMetadata;
}

export function generatedAccountName(
  providerAbbreviation: string,
  accountType: AccountType,
  accountRefLast4?: string
) {
  return [
    providerAbbreviation.toUpperCase(),
    accountTypeAbbreviations[accountType],
    accountRefLast4 ?? "XXXX"
  ].join("-");
}

function obfuscatedAccountRef(accountRef?: string, accountRefLast4?: string) {
  if (!accountRef || !accountRefLast4) {
    return undefined;
  }

  if (/^\d+$/.test(accountRef)) {
    return `${"X".repeat(Math.max(accountRef.length - accountRefLast4.length, 0))}${accountRefLast4}`;
  }

  return accountRef;
}
