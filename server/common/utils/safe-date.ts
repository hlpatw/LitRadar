// Safe date serialization. Raw SQL (pg) may return date/timestamptz columns as JS Date OR as
// ISO strings depending on column type and casts; drizzle always returns Date. Never call
// .toISOString() directly on an untrusted value — accept Date | string | number | null and
// collapse anything invalid to null so a malformed column can never 500 a response.

export function toIsoDate(value: unknown): string | null {
  // date-only -> YYYY-MM-DD
  return toIso(value, true);
}

export function toIsoDateTime(value: unknown): string | null {
  return toIso(value, false);
}

function toIso(value: unknown, dateOnly: boolean): string | null {
  if (value === null || value === undefined || value === '') return null;
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'number') {
    d = new Date(value);
  } else if (typeof value === 'string') {
    // pg returns dates as 'YYYY-MM-DD' and timestamps as 'YYYY-MM-DDTHH:mm:ss.sssZ' — both parse.
    d = new Date(value);
  } else {
    return null;
  }
  if (Number.isNaN(d.getTime())) return null;
  return dateOnly ? d.toISOString().slice(0, 10) : d.toISOString();
}
