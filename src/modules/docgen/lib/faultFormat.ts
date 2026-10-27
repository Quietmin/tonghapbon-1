/**
 * 고장 보고서 요약 표에 찍히는 값 다듬기.
 * 원본(legacy Photo-Report)의 formatFaultDateTime / spanMinutes / minutesText 를 옮긴 것.
 * 원본은 날짜 input 과 시/분 select 를 따로 두었지만 여기서는 datetime-local 하나를 쓰므로
 * 입력 형식만 다르고 출력 문구는 같다.
 */

/** "2025-07-14T20:27" -> "2025.7.14. 20:27" (시각이 없으면 날짜까지만) */
export function formatDateTime(local: string): string {
  const v = String(local || "").trim();
  if (!v) return "-";
  const [datePart, timePart] = v.split("T");
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return v;
  const text = `${Number(y)}.${Number(m)}.${Number(d)}.`;
  // datetime-local 은 초를 붙여 오기도 한다 — 분까지만 쓴다
  return timePart ? `${text} ${timePart.slice(0, 5)}` : text;
}

/**
 * 지금 시각을 datetime-local 이 받는 "YYYY-MM-DDTHH:mm" 으로.
 *
 * toISOString() 을 쓰면 안 된다 — 그건 UTC 라 한국에서 9시간 어긋난 값이 찍힌다.
 * datetime-local 은 지역시각을 그대로 받으므로 지역 기준 각 자리를 직접 맞춘다.
 */
export function nowForDateTimeLocal(at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}` +
    `T${p(at.getHours())}:${p(at.getMinutes())}`
  );
}

/**
 * "YYYY-MM-DDTHH:mm" 을 날짜·시각 두 조각으로. 둘 중 하나만 있어도 받는다
 * (날짜만 고르고 시각은 나중에 고르는 경우가 있다).
 */
export function splitLocal(v: string): { date: string; time: string } {
  const [date = "", time = ""] = String(v || "").split("T");
  return { date, time: time.slice(0, 5) };
}

/**
 * 날짜·시각을 다시 "YYYY-MM-DDTHH:mm" 으로.
 * 날짜가 없으면 시각만 있어도 의미가 없으므로 빈 문자열이다.
 */
export function joinLocal(date: string, time: string): string {
  if (!date) return "";
  return time ? `${date}T${time}` : date;
}

/**
 * 두 datetime-local 값의 차이를 분으로. 값이 모자라거나 순서가 거꾸로면 null. (원본과 동일)
 *
 * 시각 없이 날짜만 있으면 재지 않는다 — "2026-10-12" 는 브라우저가 UTC 자정으로
 * 읽어서 한국 기준으로 9시간 어긋난 기간이 조용히 찍힌다. 원본도 날짜와 시각이
 * 모두 있을 때만 계산한다.
 */
export function spanMinutes(from: string, to: string): number | null {
  if (!from || !to) return null;
  if (!from.includes("T") || !to.includes("T")) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  return mins < 0 ? null : mins;
}

/** 90 -> "1시간 30분" */
export function minutesText(mins: number | null): string {
  if (mins === null) return "";
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 값이 비면 "-" — 원본 faultText 와 동일하게 빈 칸을 남기지 않는다 */
export function orDash(v: string): string {
  return String(v || "").trim() || "-";
}

/** "12" + "세대" -> "12 (세대)" (원본 faultUnitText) */
export function unitText(v: string, unit: string): string {
  return `${orDash(v)} (${unit})`;
}
