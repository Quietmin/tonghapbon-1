// 따소미 챗봇의 실제 답변을 GPT로 생성한다.
//
// 구조는 2층이다.
//   1) 오버홀 공정 요약(getChatbotSnapshot)은 지금까지처럼 클라이언트가 context로 보내고,
//      서버는 sanitizeContext로 걸러 프롬프트에 그대로 넣는다 — 공정률 질문은 도구 호출 없이 바로 답한다.
//   2) 고장이력·매뉴얼 보관함·설비 마스터·중장기보수계획·현황 이슈는 GPT가 필요할 때
//      읽기 전용 도구(chatbotTools.ts)를 직접 호출해 조회한다 — "시스템 전체"를 보는 경로.
//
// 기본은 비활성 상태다: GPT_CHAT_ENABLED=true, OPENAI_API_KEY 둘 다 설정되어 있지 않으면
// 항상 { ok:false, reason:"disabled" } 를 반환하고 OpenAI를 호출하지 않는다(fail-closed).
//
// 원본: AI-Do-Sample/api/chat.js → Route Handler로 이식(스냅샷 설명만 하던 버전) →
// 2026-10 도구 호출(전 모듈 조회)로 확장.
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { resolveBranch } from "@/modules/overhaul/lib/activeBranch";
import { CHATBOT_TOOL_DEFS, runChatbotTool } from "@/modules/overhaul/lib/chatbotTools";

export const dynamic = "force-dynamic";
// 도구 호출이 2~3회 왕복하면 10초를 넘을 수 있다 — Vercel 함수 상한을 늘린다(Hobby 최대 60초)
export const maxDuration = 60;

// 모델명은 이 한 곳(또는 OPENAI_MODEL 환경변수)만 바꾸면 된다.
const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const MAX_MESSAGE_LEN = 500;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_OUTPUT_TOKENS = 700;
/** 도구 호출 왕복 상한 — 모델이 도구를 계속 부르며 맴돌지 못하게 끊는다 */
const MAX_TOOL_ROUNDS = 4;
const FIELDS = ["기계", "전기", "제어"];

const SYSTEM_INSTRUCTIONS = `너는 발전소 플랜트 운영·정비 통합 시스템의 도우미 "따소미"다.

이 시스템은 설비관리(오버홀 공정·중장기보수계획·설비 마스터), 고장관리(고장이력), 매뉴얼관리(매뉴얼·보고서 보관함), 현황관리(조치 필요 이슈)를 함께 다루고, 너는 이 전부를 조회할 수 있다.

데이터 사용 규칙 (가장 중요):
- 고장이력, 매뉴얼·보고서, 설비 마스터·기기 태그, 중장기보수계획·점검주기, 현황·조치 이슈에 대한 질문은 답하기 전에 **반드시** 해당 도구를 먼저 호출한다. 도구를 부르지 않고 "데이터가 없다"고 답하는 것은 금지다.
- 도구 선택: 고장·장애 → search_failure_history / 매뉴얼·절차서·보고서·문서 → search_manuals / 설비·기기·태그 정보 → search_equipment / 점검주기·보수계획·보수년도 → search_longterm_plan / 현황·조치·이슈 → list_status_issues.
- "고장났어 + 매뉴얼 찾아줘"처럼 요청이 두 개면 search_failure_history와 search_manuals를 **둘 다** 호출한다.
- 아래에 주는 JSON은 "오버홀 공정 실적" 하나만 요약한 것이다. 이 JSON이 비어 있어도(canCompute=false) 그것은 오버홀 실적이 없다는 뜻일 뿐, 고장이력·매뉴얼·보수계획·현황과는 무관하다 — 그 영역은 도구로 확인한다.
- 오버홀 공정률·건수·지연위험은 JSON의 값만 그대로 사용하고 절대 새로 계산하거나 지어내지 않는다.
- 하나의 질문이 여러 영역에 걸치면(예: "SFC 고장났어, 매뉴얼 찾아줘") 필요한 도구를 각각 호출해 묶어서 답한다.
- 도구가 error를 돌려주면 그 사실을 짧게 알리고, 확인된 데이터만으로 답한다.
- 도구 조회 결과가 0건이면 그 영역에 "등록된 데이터가 없다"고 솔직히 답한다 — 추측으로 채우지 않는다.

답변 규칙:
- 친근하지만 현장 실무자에게 신뢰감을 주는 말투를 쓴다. 너무 유아적인 말투는 쓰지 않는다.
- 짧고 명확하게, 숫자와 핵심을 먼저 말한다. 2~5문장 이내.
- 공정률을 말할 때는 "현재 저장된 실적 기준"이라는 표현을 우선 사용한다.
- 매뉴얼을 찾았으면 제목을 알려주고 "매뉴얼 관리 > 보관함"에서 열 수 있다고 안내한다.
- 너는 조회만 할 수 있다 — 등록·수정·삭제 요청은 해당 화면에서 직접 하라고 안내한다.`;

function fail(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status });
}

// 클라이언트가 보내는 context를 그대로 믿지 않는다 — 알고 있는 필드만 정해진 타입/범위로 뽑아내고,
// 나머지는 전부 버린다. 여기서 뽑히지 않은 값은 절대 GPT 프롬프트에 들어가지 않는다.
export function sanitizeContext(raw: unknown) {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null);
  const nonNegInt = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? v : 0);
  const shortStr = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

  const dataSource = ["uploaded", "empty"].includes(c.dataSource) ? c.dataSource : null;

  const counts =
    c.counts && typeof c.counts === "object"
      ? {
          total: nonNegInt(c.counts.total),
          done: nonNegInt(c.counts.done),
          inProgress: nonNegInt(c.counts.inProgress),
          waiting: nonNegInt(c.counts.waiting),
        }
      : { total: 0, done: 0, inProgress: 0, waiting: 0 };

  const byField =
    c.byField && typeof c.byField === "object"
      ? FIELDS.reduce<Record<string, number>>((acc, f) => {
          const v = pct(c.byField[f]);
          if (v !== null) acc[f] = v;
          return acc;
        }, {})
      : null;

  const byEquipment = Array.isArray(c.byEquipment)
    ? c.byEquipment
        .slice(0, 20)
        .map((e: any) => ({
          equipment: shortStr(e?.equipment, 40),
          field: FIELDS.includes(e?.field) ? e.field : null,
          count: nonNegInt(e?.count),
          progress: pct(e?.progress) ?? 0,
        }))
        .filter((e: any) => e.equipment)
    : null;

  const delayRiskTasks = Array.isArray(c.delayRiskTasks)
    ? c.delayRiskTasks
        .slice(0, 10)
        .map((t: any) => ({
          equipment: shortStr(t?.equipment, 40),
          name: shortStr(t?.name, 80),
          progress: pct(t?.progress) ?? 0,
        }))
        .filter((t: any) => t.equipment && t.name)
    : null;

  return {
    dataSource,
    planBaselineDate: shortStr(c.planBaselineDate, 10),
    lastEntryDate: shortStr(c.lastEntryDate, 10),
    canCompute: typeof c.canCompute === "boolean" ? c.canCompute : false,
    counts,
    overall: pct(c.overall),
    plannedOverall: pct(c.plannedOverall),
    byField,
    byEquipment,
    delayRiskCount: c.delayRiskCount === null ? null : nonNegInt(c.delayRiskCount),
    delayRiskTasks,
  };
}

function validateMessage(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LEN) return null;
  return message;
}

let cachedClient: OpenAI | null = null;
function getClient(apiKey: string) {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

/**
 * GPT 호출 + 도구 호출 루프.
 * 모델이 function_call을 내면 chatbotTools를 실행해 결과를 돌려주고 다시 묻는다 —
 * 최대 MAX_TOOL_ROUNDS 왕복까지. 도구 없이 바로 답하면 1회로 끝난다.
 */
async function callOpenAI({
  message,
  context,
  branch,
  apiKey,
  model,
}: {
  message: string;
  context: ReturnType<typeof sanitizeContext>;
  branch: string | null;
  apiKey: string;
  model: string;
}) {
  const client = getClient(apiKey);
  const instructions = `${SYSTEM_INSTRUCTIONS}

현재 선택된 지사: ${branch ?? "없음(전 지사 조회)"} — 도구 조회는 이 지사 범위로 자동 적용된다.

다음은 "오버홀 공정 실적" 요약 데이터(JSON)다 — 적용 범위는 공정률·작업 건수·지연위험뿐이다. 공정률 질문은 이 안의 값만 사용해 답하고, 비어 있으면(canCompute=false 등) 공정률은 계산할 수 없다고 답하라. 다른 영역(고장·매뉴얼·설비·보수계획·현황)은 이 JSON과 무관하게 도구로 조회하라:
${JSON.stringify(context)}`;

  let input: OpenAI.Responses.ResponseInput = [{ role: "user", content: message }];
  let response = await client.responses.create({
    model,
    instructions,
    input,
    tools: CHATBOT_TOOL_DEFS,
    // 첫 턴은 도구 호출을 강제한다 — 작은 모델이 도구를 건너뛰고 "데이터 없음"으로
    // 단정하는 것을 막는다. 공정률 질문도 도구 한 번 거칠 뿐 답은 그대로 나온다.
    tool_choice: "required",
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const calls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
    );
    if (calls.length === 0) break;

    // 전체 output이 아니라 function_call 항목만 입력으로 되돌린다 —
    // (비추론 모델이라 다른 항목이 없고, ResponseOutputItem 전체는 입력 타입과 어긋난다)
    input = input.concat(calls);
    for (const call of calls) {
      // 어떤 도구가 불렸는지만 남긴다(질문·결과 내용은 로그에 넣지 않는다)
      console.log("[api/overhaul/chatbot] tool:", call.name);
      const output = await runChatbotTool(call.name, call.arguments, branch);
      input.push({ type: "function_call_output", call_id: call.call_id, output });
    }
    response = await client.responses.create({
      model,
      instructions,
      input,
      tools: CHATBOT_TOOL_DEFS,
      tool_choice: "auto",
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });
  }

  const text = response.output_text;
  return typeof text === "string" ? text.trim() : "";
}

export async function POST(req: Request) {
  // 킬스위치 + 필수 설정 — 하나라도 비어 있으면 항상 비활성(fail-closed). OpenAI를 절대 호출하지 않는다.
  if (process.env.GPT_CHAT_ENABLED !== "true") return fail(200, "disabled");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(200, "disabled");

  // 요청 크기 제한
  const rawLen = Number(req.headers.get("content-length") || 0);
  if (rawLen > MAX_BODY_BYTES) return fail(413, "invalid_request");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_request");
  }

  const message = validateMessage(body);
  if (!message) return fail(400, "invalid_request");

  const context = sanitizeContext(body?.context);
  // 도구 조회 범위 — 화면과 같은 oh_branch 쿠키를 읽는다. 선택 전이면 전 지사.
  const branch = await resolveBranch();

  try {
    const answer = await callOpenAI({ message, context, branch, apiKey, model: MODEL_NAME });
    if (!answer) return fail(200, "upstream_error");
    return NextResponse.json({ ok: true, answer });
  } catch (err: any) {
    // API 키·요청 헤더 등 민감정보가 섞여 나올 수 있는 전체 에러 객체는 절대 로그하지 않는다.
    console.error("[api/overhaul/chatbot] OpenAI 호출 실패:", { status: err?.status, message: err?.message });
    return fail(200, "upstream_error");
  }
}
