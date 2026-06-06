"use server";

import { redirect } from "next/navigation";
import { getMigratedDatabase } from "@/db/client";
import { requireCurrentUser } from "@/modules/auth/session";
import { createServerSupabaseClient } from "@/modules/auth/supabase";
import {
  confirmPendingStatementImport,
  prepareStatementImport
} from "@/modules/imports/import-flow";
import { buildSourceAccountMetadata } from "@/modules/source-profiles/account-metadata";
import type { AccountType, ProviderType } from "@/modules/source-profiles/account-metadata";
import {
  type ImportFileResult,
  mapImportErrorMessage,
  serializeImportResults
} from "@/modules/imports/import-results";
import {
  closeMonth,
  createManualTransaction,
  deactivateAccount,
  deleteImportBatch,
  deleteTransaction,
  reactivateAccount,
  renameAccount,
  reopenMonth,
  updateAccountMetadata,
  updateTransactionCategory,
  updateTransactionDetails
} from "@/modules/imports/persistence";
import { confirmTransfer, dismissTransfer } from "@/modules/transfers/persistence";
import { createServerLogger } from "@/lib/server-logger";

const logger = createServerLogger("app-actions");

export async function importIciciStatement(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const statements = formData
    .getAll("statements")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const legacyStatement = formData.get("statement");

  if (legacyStatement instanceof File && legacyStatement.size > 0) {
    statements.push(legacyStatement);
  }

  if (statements.length === 0) {
    redirect("/?error=Choose%20at%20least%20one%20supported%20statement%20before%20running%20the%20import");
  }

  const results: ImportFileResult[] = [];
  let aiClassificationFallback = false;
  let pendingConfirmationRedirect = "";

  const db = await getMigratedDatabase();
  for (const [statementIndex, statement] of statements.entries()) {
    try {
      const prepared = await prepareStatementImport(db, {
        ownerUserId: currentUser.id,
        filename: statement.name,
        rawCsv: await statement.text()
      });
      if (prepared.status === "requires_confirmation") {
        for (const remainingStatement of statements.slice(statementIndex + 1)) {
          results.push({
            filename: remainingStatement.name,
            status: "error",
            error: "Not processed because another file requires account confirmation."
          });
        }
        const resultQuery = results.length > 0 ? `&importResults=${serializeImportResults(results)}` : "";
        pendingConfirmationRedirect = `/?pendingImportId=${encodeURIComponent(prepared.pendingImportId)}&success=Confirm%20account%20metadata%20to%20finish%20import${resultQuery}`;
        break;
      }

      const dashboard = prepared.dashboard;
      aiClassificationFallback = aiClassificationFallback || Boolean(dashboard.aiClassificationFallback);
      const latestMonth = latestTransactionMonth(dashboard.transactions);
      if (dashboard.alreadyImported) {
        results.push({
          filename: statement.name,
          status: "skipped",
          month: latestMonth,
          rowCount: 0
        });
        continue;
      }

      if (!latestMonth) {
        throw new Error("File contains no transactions.");
      }

      results.push({
        filename: statement.name,
        status: "success",
        month: latestMonth,
        rowCount: dashboard.transactions.length
      });
    } catch (error) {
      const mappedMessage = mapImportErrorMessage(error);
      logger.error("import.file.failed", {
        filename: statement.name,
        contentType: statement.type || "unknown",
        fileSizeBytes: statement.size,
        mappedMessage,
        error
      });
      results.push({
        filename: statement.name,
        status: "error",
        error: mappedMessage
      });
    }
  }

  if (pendingConfirmationRedirect) {
    redirect(pendingConfirmationRedirect);
  }

  const resultQuery = `importResults=${serializeImportResults(results)}`;
  const classificationNoticeQuery = aiClassificationFallback ? "&classificationNotice=ai-fallback" : "";
  const processedMonths = results
    .filter((result): result is Extract<ImportFileResult, { status: "success" }> => result.status === "success")
    .map((result) => result.month);
  const skippedMonths = results
    .filter((result): result is Extract<ImportFileResult, { status: "skipped" }> => result.status === "skipped")
    .map((result) => result.month)
    .filter((month): month is string => Boolean(month));
  const latestImportedMonth = [...processedMonths, ...skippedMonths].sort((left, right) => right.localeCompare(left))[0];

  if (latestImportedMonth) {
    redirect(
      `/?month=${latestImportedMonth}&success=Import%20processed&${resultQuery}${classificationNoticeQuery}`
    );
  }

  redirect(`/?error=All%20files%20failed.%20See%20details.&${resultQuery}`);
}

export async function confirmPendingStatementImportAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const pendingImportId = String(formData.get("pendingImportId") || "");
  const accountName = String(formData.get("accountName") || "").trim();
  const accountRef = String(formData.get("accountRef") || "").trim();
  const accountType = normalizedAccountType(String(formData.get("accountType") || "unknown"));
  const providerType = normalizedProviderType(String(formData.get("providerType") || "unknown"));
  const providerName = String(formData.get("providerName") || "").trim();
  const providerAbbreviation = String(formData.get("providerAbbreviation") || "").trim();
  const accountHolderName = String(formData.get("accountHolderName") || "").trim();
  const currency = String(formData.get("currency") || "INR").trim() || "INR";
  let redirectTarget = "/?success=Import%20processed";

  try {
    if (!pendingImportId) {
      throw new Error("Pending import is required");
    }

    if (!accountName) {
      throw new Error("Account name is required");
    }

    if (!accountRef) {
      throw new Error("Account number is required");
    }

    if (!providerName) {
      throw new Error("Provider name is required");
    }

    const db = await getMigratedDatabase();
    const metadata = {
      ...buildSourceAccountMetadata({
        accountHolderName: accountHolderName || undefined,
        accountRef,
        accountType,
        currency,
        providerAbbreviation: providerAbbreviation || providerName,
        providerName,
        providerType
      }),
      accountName
    };
    const dashboard = await confirmPendingStatementImport(db, {
      ownerUserId: currentUser.id,
      pendingImportId,
      metadata
    });
    const latestMonth = latestTransactionMonth(dashboard.transactions);

    if (latestMonth) {
      redirectTarget = `/?month=${latestMonth}&success=Import%20processed`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account metadata confirmation failed";
    redirect(`/?pendingImportId=${encodeURIComponent(pendingImportId)}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw new Error(error.message || "Invalid email or password");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  redirect("/?success=Signed%20in");
}

export async function signupAction(formData: FormData) {
  const displayName = String(formData.get("displayName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  try {
    if (!displayName) {
      throw new Error("Display name is required");
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName
        }
      }
    });

    if (error) {
      throw new Error(error.message || "Account creation failed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account creation failed";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  redirect("/?success=Account%20created.%20Check%20your%20email%20if%20confirmation%20is%20enabled.");
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/?success=Signed%20out");
}

export async function closeMonthAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const month = String(formData.get("month") || "");
  const note = String(formData.get("note") || "").trim();

  try {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Month is required");
    }

    if (note.length > 280) {
      throw new Error("Close note must be 280 characters or fewer");
    }

    const db = await getMigratedDatabase();
    await closeMonth(db, {
      month,
      note: note || undefined,
      ownerUserId: currentUser.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Month close failed";
    redirect(`/?month=${month}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/?month=${month}&success=Month%20closed`);
}

export async function reopenMonthAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const month = String(formData.get("month") || "");

  try {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Month is required");
    }

    const db = await getMigratedDatabase();
    await reopenMonth(db, {
      month,
      ownerUserId: currentUser.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Month reopen failed";
    redirect(`/?month=${month}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/?month=${month}&success=Month%20reopened`);
}

export async function renameAccountAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const accountId = String(formData.get("accountId") || "");
  const displayName = String(formData.get("displayName") || "").trim();

  try {
    if (!displayName) {
      throw new Error("Account name is required");
    }

    if (displayName.length > 80) {
      throw new Error("Account name must be 80 characters or fewer");
    }

    const db = await getMigratedDatabase();
    await renameAccount(db, {
      accountId,
      displayName,
      ownerUserId: currentUser.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account rename failed";
    redirect(`/?view=metadata&error=${encodeURIComponent(message)}`);
  }

  redirect("/?view=metadata&success=Account%20renamed");
}

export async function updateAccountMetadataAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const accountId = String(formData.get("accountId") || "");
  const accountName = String(formData.get("accountName") || "").trim();
  const accountType = normalizedAccountType(String(formData.get("accountType") || "unknown"));
  const providerType = normalizedProviderType(String(formData.get("providerType") || "unknown"));
  const providerName = String(formData.get("providerName") || "").trim();
  const accountHolderName = String(formData.get("accountHolderName") || "").trim();

  try {
    const db = await getMigratedDatabase();
    await updateAccountMetadata(db, {
      accountId,
      ownerUserId: currentUser.id,
      accountName,
      accountType,
      providerType,
      providerName,
      accountHolderName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account metadata update failed";
    redirect(`/?view=metadata&error=${encodeURIComponent(message)}`);
  }

  redirect("/?view=metadata&success=Account%20metadata%20updated");
}

export async function deactivateAccountAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const accountId = String(formData.get("accountId") || "");

  try {
    const db = await getMigratedDatabase();
    await deactivateAccount(db, {
      accountId,
      ownerUserId: currentUser.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account deactivate failed";
    redirect(`/?view=metadata&error=${encodeURIComponent(message)}`);
  }

  redirect("/?view=metadata&success=Account%20deactivated");
}

export async function reactivateAccountAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const accountId = String(formData.get("accountId") || "");

  try {
    const db = await getMigratedDatabase();
    await reactivateAccount(db, {
      accountId,
      ownerUserId: currentUser.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account reactivate failed";
    redirect(`/?view=metadata&error=${encodeURIComponent(message)}`);
  }

  redirect("/?view=metadata&success=Account%20reactivated");
}

export async function confirmTransferAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const month = String(formData.get("month") || "");
  const outgoingTransactionId = String(formData.get("outgoingTransactionId") || "");
  const incomingTransactionId = String(formData.get("incomingTransactionId") || "");

  try {
    const db = await getMigratedDatabase();
    await confirmTransfer(db, {
      outgoingTransactionId,
      incomingTransactionId,
      ownerUserId: currentUser.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transfer confirmation failed";
    redirect(`/?month=${month}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/?month=${month}&success=Transfer%20confirmed`);
}

export async function dismissTransferAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const month = String(formData.get("month") || "");
  const outgoingTransactionId = String(formData.get("outgoingTransactionId") || "");
  const incomingTransactionId = String(formData.get("incomingTransactionId") || "");

  try {
    const db = await getMigratedDatabase();
    await dismissTransfer(db, {
      outgoingTransactionId,
      incomingTransactionId,
      ownerUserId: currentUser.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transfer dismissal failed";
    redirect(`/?month=${month}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/?month=${month}&success=Transfer%20dismissed`);
}

export async function updateTransactionCategoryAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  const category = String(formData.get("category") || "");
  let redirectTarget = importBatchId ? `/?importBatchId=${importBatchId}` : "/";

  try {
    const db = await getMigratedDatabase();
    const transaction = await updateTransactionCategory(db, { transactionId, category, ownerUserId: currentUser.id });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}&success=Category%20updated`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Category update failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function updateTransactionDetailsAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "");
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim());
  let redirectTarget = importBatchId ? `/?importBatchId=${importBatchId}` : "/";

  try {
    if (!description) {
      throw new Error("Description is required");
    }

    const db = await getMigratedDatabase();
    const transaction = await updateTransactionDetails(db, {
      transactionId,
      description,
      category,
      tags,
      ownerUserId: currentUser.id
    });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}&success=Transaction%20updated`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction update failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function deleteTransactionAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  let redirectTarget = importBatchId ? `/?importBatchId=${importBatchId}` : "/";

  try {
    const db = await getMigratedDatabase();
    const transaction = await deleteTransaction(db, { transactionId, ownerUserId: currentUser.id });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}&success=Transaction%20deleted`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction delete failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function createManualTransactionAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const accountId = String(formData.get("accountId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  const transactionDate = String(formData.get("transactionDate") || "");
  const description = String(formData.get("description") || "").trim();
  const direction = String(formData.get("direction") || "");
  const amount = String(formData.get("amount") || "0");
  const runningBalance = String(formData.get("runningBalance") || "").trim();
  const category = String(formData.get("category") || "");
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim());
  let redirectTarget = importBatchId ? `/?importBatchId=${importBatchId}` : "/";

  try {
    if (!accountId) {
      throw new Error("Account is required");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      throw new Error("Transaction date is required");
    }

    if (!description) {
      throw new Error("Description is required");
    }

    const amountMinorUnits = moneyToMinorUnits(amount);
    const runningBalanceMinorUnits = runningBalance ? moneyToMinorUnits(runningBalance) : undefined;

    if (!Number.isFinite(amountMinorUnits) || amountMinorUnits <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    if (runningBalance && !Number.isFinite(runningBalanceMinorUnits)) {
      throw new Error("Running balance must be a valid amount");
    }

    const db = await getMigratedDatabase();
    const transaction = await createManualTransaction(db, {
      accountId,
      transactionDate,
      description,
      direction: direction === "incoming" ? "incoming" : "outgoing",
      amountMinorUnits,
      runningBalanceMinorUnits,
      category,
      tags,
      ownerUserId: currentUser.id
    });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}&success=Transaction%20added`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual transaction create failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function deleteImportBatchAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const importBatchId = String(formData.get("importBatchId") || "");

  try {
    const db = await getMigratedDatabase();
    await deleteImportBatch(db, { importBatchId, ownerUserId: currentUser.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import delete failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect("/?success=Import%20deleted");
}

function moneyToMinorUnits(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return Number.NaN;
  }

  const [whole = "0", fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

function latestTransactionMonth(transactions: Array<{ transactionDate: string }>) {
  return transactions
    .map((transaction) => transaction.transactionDate.slice(0, 7))
    .sort((left, right) => right.localeCompare(left))[0];
}

function normalizedAccountType(value: string): AccountType {
  if (["savings", "current", "credit_card", "wallet", "unknown"].includes(value)) {
    return value as AccountType;
  }

  return "unknown";
}

function normalizedProviderType(value: string): ProviderType {
  if (["bank", "card_issuer", "wallet", "unknown"].includes(value)) {
    return value as ProviderType;
  }

  return "unknown";
}
