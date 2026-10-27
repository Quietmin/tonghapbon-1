import { STATUS_STYLE, type IssueStatus } from "../lib/constants";

/** 조치 상태 칩 — 현황 조회 목록·갱신 창에서 같은 모양으로 쓴다 */
export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
        STATUS_STYLE[status] ?? "bg-surface-container-highest text-on-surface-variant"
      }`}
    >
      {status}
    </span>
  );
}

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
