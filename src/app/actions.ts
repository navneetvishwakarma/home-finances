"use server";

import { redirect } from "next/navigation";
import { getMigratedDatabase } from "@/db/client";
import { runIciciCsvImport } from "@/modules/imports/import-flow";
import { updateTransactionCategory } from "@/modules/imports/persistence";

export async function importIciciStatement(formData: FormData) {
  const accountDisplayName = String(formData.get("accountDisplayName") || "ICICI Savings").trim();
  const statement = formData.get("statement");

  if (!(statement instanceof File) || statement.size === 0) {
    redirect("/?error=Choose%20an%20ICICI%20CSV%20statement%20before%20running%20the%20import");
  }

  let importBatchId = "";

  try {
    const db = await getMigratedDatabase();
    const dashboard = await runIciciCsvImport(db, {
      accountDisplayName,
      filename: statement.name,
      rawCsv: await statement.text()
    });
    importBatchId = dashboard.importBatch.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  redirect(`/?importBatchId=${importBatchId}`);
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
