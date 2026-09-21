// 따소미(플로팅 챗봇) 말투 — chatbotRules.ts가 이미 계산한 숫자(answer.data)를 문장으로만 다시 쓴다.
// 새 계산은 하지 않는다. data가 없는 응답(안내/거부/모호함/미지원)은 원래 text를 그대로 사용한다.
//
// 원본: AI-Do-Sample/src/lib/ddasomiVoice.js (그대로)
import type { Answer } from "./chatbotRules";

function pct(n: number): string {
  return `${n}%`;
}

export function toDdasomiText(answer: Answer | null | undefined): string {
  if (!answer || answer.kind !== "answer" || !answer.data) return answer?.text ?? "";
  const d = answer.data as Record<string, any>;

  switch (d.type) {
    case "overall": {
      const c = d.counts;
      return `현재 저장된 실적 기준 전체 오버홀 공정률은 ${pct(d.overall)}예요!\n전체 ${c.total}개 작업 중 ${c.done}개가 완료되었고, ${c.inProgress}개 작업이 현재 진행 중이에요.`;
    }
    case "field":
      return `${d.field} 분야 공정률은 ${pct(d.value)}예요.`;
    case "equipment":
      return `${d.equipment}(${d.field}) 공정률은 ${pct(d.progress)}예요. 관련 작업은 ${d.count}건이에요.`;
    case "plannedGap": {
      const gap = Math.abs(d.gap);
      const dir = d.gap >= 0 ? "앞서" : "뒤처져";
      return `현재 ${pct(d.overall)}, 계획은 ${pct(d.planned)}예요. 계획보다 ${gap}%p ${dir} 있어요.`;
    }
    case "delayRisk": {
      if (d.count === 0) return "지금은 지연 위험 작업이 없어요. 순조롭게 진행되고 있어요!";
      const line = d.items.map((t: any) => `${t.equipment} ${t.name}(${pct(t.progress)})`).join(", ");
      const more = d.rest > 0 ? ` 외 ${d.rest}건` : "";
      return `지연 위험 작업이 ${d.count}건 있어요: ${line}${more}`;
    }
    case "counts":
      return `전체 ${d.counts.total}건 중 완료 ${d.counts.done}건, 진행 중 ${d.counts.inProgress}건, 대기 ${d.counts.waiting}건이에요.`;
    case "equipmentList": {
      const line = d.items.map((e: any) => `${e.equipment} ${pct(e.progress)}`).join(" · ");
      const more = d.rest > 0 ? ` (외 ${d.rest}건)` : "";
      return `설비별 공정률이에요: ${line}${more}`;
    }
    default:
      return answer.text;
  }
}
