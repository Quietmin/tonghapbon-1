// 연도별 보수 대상 판정
//
// 핵심 원칙: 엑셀에 사람이 적어둔 등급을 그대로 읽는 게 아니라,
//   다음 보수 예정연도 = 마지막 보수연도 + 정밀점검주기
// 로 시스템이 계산한다. 그래서 오버홀이 끝나고 보수 실적(maintenance_record)만
// 남기면 다음 회차 판정이 자동으로 갱신되고, 매년 엑셀을 손볼 필요가 없다.
//
// 마지막 보수연도는 이 순서로 정한다:
//   1) maintenance_record에 실제 실적이 있으면 그것 (가장 신뢰)
//   2) 없으면 최초 업로드 시 엑셀의 A등급 이력에서 역산한 값
import type { ParsedCycle } from "./maintenancePlanParser";

/** 필수 = 반드시 보수 / 선택 = 사용자 판단 필요 / 불필요 = 이번 해 대상 아님 */
export type Classification = "필수" | "선택" | "불필요";

export type JudgeReasonCode =
  | "due"          // 주기가 정확히 도래
  | "overdue"      // 기한이 이미 지남
  | "not_due"      // 아직 주기가 안 됨
  | "cycle_ambiguous" // 주기가 조건부(실내 3년 / 실외 2년 등) — 사용자 판단
  | "no_history"   // 마지막 보수연도를 알 수 없음 — 사용자 판단
  | "as_needed"    // "필요시" 주기 — 사용자 판단
  | "no_cycle";    // 주기 정보 자체가 없음

export interface JudgeInput {
  cycle: ParsedCycle;
  /** 실적 또는 엑셀 역산으로 얻은 마지막 보수연도 */
  lastDoneYear: number | null;
}

export interface JudgeResult {
  classification: Classification;
  reason: JudgeReasonCode;
  /** 사람이 읽는 판정 근거 — 화면에 그대로 보여준다 */
  reasonText: string;
  /** 계산된 다음 보수 예정연도 (알 수 없으면 null) */
  nextDueYear: number | null;
  /** 기한 초과 연수 (overdue일 때만, 그 외 0) */
  overdueYears: number;
  /** 사용자가 반드시 판단해야 하는 항목인지 — 화면에서 눈에 띄게 표시한다 */
  needsDecision: boolean;
}

/**
 * 특정 연도(targetYear)에 이 설비를 보수해야 하는지 판정한다.
 */
export function judge(input: JudgeInput, targetYear: number): JudgeResult {
  const { cycle, lastDoneYear } = input;

  // 주기가 조건부로 적혀 있으면 시스템이 정할 수 없다 (실내 3년 / 실외 2년 등)
  if (cycle.kind === "ambiguous") {
    const opts = (cycle.options ?? []).join("년 / ") + "년";
    return {
      classification: "선택",
      reason: "cycle_ambiguous",
      reasonText: `점검주기가 조건에 따라 다릅니다(${opts}). 해당 설비가 어느 조건인지 확인해 판단하세요.`,
      nextDueYear: null,
      overdueYears: 0,
      needsDecision: true,
    };
  }

  if (cycle.kind === "asneeded") {
    return {
      classification: "선택",
      reason: "as_needed",
      reasonText: "정해진 주기 없이 '필요시' 시행하는 항목입니다. 상태를 보고 판단하세요.",
      nextDueYear: null,
      overdueYears: 0,
      needsDecision: true,
    };
  }

  if (cycle.kind === "none" || cycle.years == null) {
    return {
      classification: "불필요",
      reason: "no_cycle",
      reasonText: "정밀점검주기 정보가 없어 판정할 수 없습니다.",
      nextDueYear: null,
      overdueYears: 0,
      needsDecision: false,
    };
  }

  // 주기는 확실한데 마지막 보수연도를 모르면 계산의 출발점이 없다
  if (lastDoneYear == null) {
    return {
      classification: "선택",
      reason: "no_history",
      reasonText: `${cycle.years}년 주기이지만 직전 보수 이력이 없어 도래 여부를 계산할 수 없습니다. 확인해 판단하세요.`,
      nextDueYear: null,
      overdueYears: 0,
      needsDecision: true,
    };
  }

  const nextDueYear = lastDoneYear + cycle.years;

  if (nextDueYear === targetYear) {
    return {
      classification: "필수",
      reason: "due",
      reasonText: `${lastDoneYear}년 보수 + ${cycle.years}년 주기 → ${targetYear}년 도래`,
      nextDueYear,
      overdueYears: 0,
      needsDecision: false,
    };
  }

  if (nextDueYear < targetYear) {
    const overdueYears = targetYear - nextDueYear;
    return {
      classification: "필수",
      reason: "overdue",
      reasonText: `${lastDoneYear}년 보수 + ${cycle.years}년 주기 → ${nextDueYear}년이 기한이었으나 ${overdueYears}년 경과`,
      nextDueYear,
      overdueYears,
      needsDecision: false,
    };
  }

  return {
    classification: "불필요",
    reason: "not_due",
    reasonText: `${lastDoneYear}년 보수 + ${cycle.years}년 주기 → 다음은 ${nextDueYear}년`,
    nextDueYear,
    overdueYears: 0,
    needsDecision: false,
  };
}

/** 오버홀 공사 범위인지 — O/H만 수량산출서에 들어간다 */
export function isOverhaulScope(method: string | null): boolean {
  const t = (method ?? "").replace(/\s+/g, "").toUpperCase();
  return t === "O/H" || t === "OH";
}
