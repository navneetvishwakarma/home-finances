"use server";

import { redirect } from "next/navigation";
import { getMigratedDatabase } from "@/db/client";
import {
  clearCurrentSession,
  requireCurrentUser,
  setSessionCookie
} from "@/modules/auth/session";
import {
  createSession,
  ensureBootstrapAdmin,
  findUserByEmail,
  verifyPassword
} from "@/modules/auth/persistence";
import { runIciciCsvImport } from "@/modules/imports/import-flow";
import {
  createManualTransaction,
  deleteImportBatch,
  deleteTransaction,
  updateTransactionCategory,
  updateTransactionDetails
} from "@/modules/imports/persistence";

export async function importIciciStatement(formData: FormData) {
  await requireCurrentUser();
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
  redirect(latestImportedMonth ? `/?month=${latestImportedMonth}` : "/");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  try {
    const db = await getMigratedDatabase();
    await ensureBootstrapAdmin(db);
    const user = await findUserByEmail(db, email);

    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      throw new Error("Invalid email or password");
    }

    const session = await createSession(db, { userId: user.id });
    await setSessionCookie(session.token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  redirect("/");
}

export async function logoutAction() {
  await clearCurrentSession();
  redirect("/");
}

export async function updateTransactionCategoryAction(formData: FormData) {
  await requireCurrentUser();
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  const category = String(formData.get("category") || "");
  let redirectTarget = importBatchId ? `/?importBatchId=${importBatchId}` : "/";

  try {
    const db = await getMigratedDatabase();
    const transaction = await updateTransactionCategory(db, { transactionId, category });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Category update failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function updateTransactionDetailsAction(formData: FormData) {
  await requireCurrentUser();
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
    const transaction = await updateTransactionDetails(db, { transactionId, description, category, tags });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction update failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function deleteTransactionAction(formData: FormData) {
  await requireCurrentUser();
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  let redirectTarget = importBatchId ? `/?importBatchId=${importBatchId}` : "/";

  try {
    const db = await getMigratedDatabase();
    const transaction = await deleteTransaction(db, { transactionId });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction delete failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function createManualTransactionAction(formData: FormData) {
  await requireCurrentUser();
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
      tags
    });
    redirectTarget = `/?month=${transaction.transactionDate.slice(0, 7)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual transaction create failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(redirectTarget);
}

export async function deleteImportBatchAction(formData: FormData) {
  await requireCurrentUser();
  const importBatchId = String(formData.get("importBatchId") || "");

  try {
    const db = await getMigratedDatabase();
    await deleteImportBatch(db, { importBatchId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import delete failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect("/");
}

function moneyToMinorUnits(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return Number.NaN;
  }

  const [whole = "0", fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}
