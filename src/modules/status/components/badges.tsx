/** ISO 시각 → "10.27 15:30". 올해가 아니면 연도를 붙인다 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${d.getFullYear()}.${base}`;
}

/** YYYY-MM-DD → "10.27" */
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return "-";
  return ymd.length >= 10 ? `${ymd.slice(5, 7)}.${ymd.slice(8, 10)}` : ymd;
}
