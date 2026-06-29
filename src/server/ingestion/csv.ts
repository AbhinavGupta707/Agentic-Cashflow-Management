export type CsvParseResult = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export function parseCsv(csvText: string): CsvParseResult {
  const records = parseCsvRecords(csvText.replace(/^\uFEFF/, ""));

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0]?.map((header) => header.trim()) ?? [];
  const rows = records.slice(1).map((record) => {
    const row: Record<string, string> = {};

    for (const [index, header] of headers.entries()) {
      if (header.length > 0) {
        row[header] = (record[index] ?? "").trim();
      }
    }

    return row;
  });

  return { headers, rows };
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      record.push(field);
      if (record.some((value) => value.trim().length > 0)) {
        records.push(record);
      }
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (record.some((value) => value.trim().length > 0)) {
      records.push(record);
    }
  }

  if (inQuotes) {
    throw new Error("CSV parse failed: unterminated quoted field.");
  }

  return records;
}
