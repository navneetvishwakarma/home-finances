export function parseCsvRecords(rawCsv: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < rawCsv.length; index += 1) {
    const char = rawCsv[index];
    const nextChar = rawCsv[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      record.push(field.trim());
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field.trim());
    records.push(record);
  }

  return records;
}
