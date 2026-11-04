// A small RFC 4180 CSV reader: quoted fields, doubled quotes inside them, and newlines inside quotes.
// Enough for nflverse's play-by-play files, without adding a dependency.

/** One CSV row, read by column name. Missing columns read as "". */
export interface CsvRow {
  get(column: string): string;
}

export function parseCsv(text: string): CsvRow[] {
  const records = parseRecords(text);
  const [header, ...rest] = records;
  if (header === undefined) return [];
  const index = new Map(header.map((name, i) => [name, i]));
  return rest
    .filter((r) => !(r.length === 1 && r[0] === ""))
    .map((fields) => ({
      get(column: string): string {
        const i = index.get(column);
        return i === undefined ? "" : (fields[i] ?? "");
      },
    }));
}

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
