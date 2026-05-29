"use server";

import { redirect } from "next/navigation";
import { getMigratedDatabase } from "@/db/client";
import { runIciciCsvImport } from "@/modules/imports/import-flow";
import {
  createManualTransaction,
  deleteImportBatch,
  deleteTransaction,
  updateTransactionCategory,
  updateTransactionDetails
} from "@/modules/imports/persistence";

export async function importIciciStatement(formData: FormData) {
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

  const importBatchIds: string[] = [];

  try {
    const db = await getMigratedDatabase();
    for (const statement of statements) {
      const dashboard = await runIciciCsvImport(db, {
        accountDisplayName,
        filename: statement.name,
        rawCsv: await statement.text()
      });
      importBatchIds.push(dashboard.importBatch.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  redirect(`/?importBatchIds=${importBatchIds.join(",")}`);
}

export async function updateTransactionCategoryAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  const category = String(formData.get("category") || "");

  try {
    const db = await getMigratedDatabase();
    await updateTransactionCategory(db, { transactionId, category });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Category update failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/?importBatchId=${importBatchId}`);
}

export async function updateTransactionDetailsAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "");
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim());

  try {
    if (!description) {
      throw new Error("Description is required");
    }

    const db = await getMigratedDatabase();
    await updateTransactionDetails(db, { transactionId, description, category, tags });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction update failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(`/?importBatchId=${importBatchId}`);
}

export async function deleteTransactionAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") || "");
  const importBatchId = String(formData.get("importBatchId") || "");

  try {
    const db = await getMigratedDatabase();
    await deleteTransaction(db, { transactionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction delete failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(importBatchId ? `/?importBatchId=${importBatchId}` : "/");
}

export async function createManualTransactionAction(formData: FormData) {
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
    await createManualTransaction(db, {
      accountId,
      transactionDate,
      description,
      direction: direction === "incoming" ? "incoming" : "outgoing",
      amountMinorUnits,
      category,
      tags
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual transaction create failed";
    redirect(`/?importBatchId=${importBatchId}&error=${encodeURIComponent(message)}`);
  }

  redirect(importBatchId ? `/?importBatchId=${importBatchId}` : "/");
}

export async function deleteImportBatchAction(formData: FormData) {
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
