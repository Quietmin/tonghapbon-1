/**
 * Dates are persisted as `datetime-local` compatible strings ("YYYY-MM-DDTHH:mm")
 * so every date/time field in the app can use a native calendar+time picker.
 * These helpers convert into/out of that canonical format.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Best-effort conversion of a loosely-formatted date string into "YYYY-MM-DDTHH:mm". */
export function toDatetimeLocalValue(raw?: string): string {
  if (!raw) return "";

  const korean = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(\d{1,2}):(\d{2})/);
  if (korean) {
    const [, y, mo, d, h, mi] = korean;
    return `${y}-${pad(Number(mo))}-${pad(Number(d))}T${pad(Number(h))}:${mi}`;
  }

  const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (iso) {
    const [, y, mo, d, h, mi] = iso;
    return `${y}-${pad(Number(mo))}-${pad(Number(d))}T${h ? pad(Number(h)) : "00"}:${mi ?? "00"}`;
  }

  // Already in datetime-local shape, or unrecognized — pass through as-is.
  return raw;
}

/** Renders a "YYYY-MM-DDTHH:mm" value as a friendlier Korean date/time for display. */
export function formatDatetimeDisplay(value?: string | null): string {
  if (!value) return "-";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return value;
  const [, y, mo, d, h, mi] = m;
  return `${y}년 ${mo}월 ${d}일 ${h}:${mi}`;
}

/** Current local time as a "YYYY-MM-DDTHH:mm" value, for defaulting date pickers. */
export function nowAsDatetimeLocalValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
