"use server";

import { redirect } from "next/navigation";
import { getMigratedDatabase } from "@/db/client";
import { requireCurrentUser } from "@/modules/auth/session";
import { createServerSupabaseClient } from "@/modules/auth/supabase";
import { runIciciCsvImport } from "@/modules/imports/import-flow";
import {
  createManualTransaction,
  deleteImportBatch,
  deleteTransaction,
  updateTransactionCategory,
  updateTransactionDetails
} from "@/modules/imports/persistence";

export async function importIciciStatement(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const accountDisplayName = String(formData.get("accountDisplayName") || "Primary account").trim();
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

  const importedMonths = new Set<string>();

  try {
    const db = await getMigratedDatabase();
    for (const statement of statements) {
      const dashboard = await runIciciCsvImport(db, {
        ownerUserId: currentUser.id,
        accountDisplayName,
        filename: statement.name,
        rawCsv: await statement.text()
      });
      for (const transaction of dashboard.transactions) {
        importedMonths.add(transaction.transactionDate.slice(0, 7));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  const latestImportedMonth = [...importedMonths].sort((left, right) => right.localeCompare(left))[0];
  redirect(latestImportedMonth ? `/?month=${latestImportedMonth}&success=Import%20complete` : "/?success=Import%20complete");
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

    if (!Number.isFinite(amountMinorUnits) || amountMinorUnits <= 0) {
      throw new Error("Amount must be greater than zero");
    }

    const db = await getMigratedDatabase();
    const transaction = await createManualTransaction(db, {
      accountId,
      transactionDate,
      description,
      direction: direction === "incoming" ? "incoming" : "outgoing",
      amountMinorUnits,
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
