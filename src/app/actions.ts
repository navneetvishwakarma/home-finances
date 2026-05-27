"use server";

import { redirect } from "next/navigation";
import { getMigratedDatabase } from "@/db/client";
import { runIciciCsvImport } from "@/modules/imports/import-flow";

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
