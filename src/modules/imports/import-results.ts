export type ImportFileResult =
  | {
      filename: string;
      status: "success";
      month: string;
      rowCount: number;
    }
  | {
      filename: string;
      status: "skipped";
      month?: string;
      rowCount: number;
    }
  | {
      filename: string;
      status: "error";
      error: string;
    };

export function mapImportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Unsupported CSV headers")) {
    return "This file format is not supported. Supported: ICICI bank CSV, HDFC bank CSV, ICICI credit card CSV.";
  }

  if (message.includes("File contains no transactions")) {
    return "File contains no transactions.";
  }

  return "Import failed due to a system error. Try again.";
}

export function serializeImportResults(results: ImportFileResult[]) {
  return encodeURIComponent(JSON.stringify(results));
}

export function parseImportResults(value?: string) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isImportFileResult);
  } catch {
    return [];
  }
}

function isImportFileResult(value: unknown): value is ImportFileResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;
  if (typeof result.filename !== "string") {
    return false;
  }

  if (result.status === "success") {
    return typeof result.month === "string" && typeof result.rowCount === "number";
  }

  if (result.status === "skipped") {
    return typeof result.rowCount === "number";
  }

  return result.status === "error" && typeof result.error === "string";
}
