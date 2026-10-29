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

// 발전소 현장 용어·점검 요령 — 답변이 교과서식이 아니라 현장 실무자 말투로 나오게 하는 지식 블록.
// 팀에서 자주 묻는 질문과 모범 답변이 생기면 여기에 항목을 추가하면 된다(코드 변경 없이 프롬프트만).
const FIELD_KNOWLEDGE = `[발전소 현장 용어]
- DCS: 분산제어시스템. 운전원이 보는 화면과 제어 로직이 돌아가는 곳.
- DI/DO: 디지털 입력/출력. DO 스타트 명령 = DCS가 설비를 기동하라고 내보내는 접점 신호.
- AI/AO: 아날로그 입력/출력. 보통 4~20mA 전류 신호. Range Over = 측정값이 설정 범위(레인지)를 벗어남.
- m/p(마셸링 판넬): 필드 케이블과 DCS 카드 사이의 중계 단자반. 여기서 전류(아날로그)나 전압(디지털)을 찍어 신호를 확인한다.
- 필드(Field): 현장 설비·센서·계기 쪽. "필드에서 실제로 값을 주고 있는지"는 센서 자체 출력 확인을 뜻한다.
- LCP: 현장 조작반(Local Control Panel). LOCAL/REMOTE 선택 스위치가 있어 REMOTE여야 DCS 명령이 먹는다.
- MCC: 모터 제어반. 차단기(ACB/MCCB), 전자접촉기(MC), 열동계전기(THR) 등 전기 쪽 기동 회로가 있다.
- 인터록(Interlock): 기동 조건. 하나라도 불만족이면 기동 명령이 나가도 설비가 돌지 않는다.
- 트립(Trip): 보호 동작으로 설비가 정지됨. 트립 원인을 리셋하기 전에는 재기동 불가.
- 강제 스탑 릴레이 / 비상정지(E-Stop): 전기 쪽이나 현장에서 정지 접점을 잡고 있으면 DCS 명령과 무관하게 기동 불가.
- 트랜스미터(TX): 압력·온도·유량 등을 4~20mA로 보내는 계기. 솔레노이드(SOV): 밸브 공기 공급을 여닫는 전자밸브.
- 포지셔너: 제어밸브 개도를 맞추는 장치. 개도 피드백과 명령이 다르면 포지셔너나 공기압 문제를 의심한다.

[현장 점검 요령 예시 — 이 수준의 구체성과 용어로 답한다. 단, 아래 예시는 "펌프 기동 불가"와 "DCS 입력 신호 이상" 두 경우에만 맞는 순서다.
다른 설비(SFC, 여자기, 인버터, 보호계전기, 터빈 제어 등)에 이 순서를 그대로 옮겨 붙이지 않는다.]
Q: 펌프가 왜 안 돌지?
1. DCS에서 DO 스타트 명령이 실제로 나갔는지 확인합니다(출력 접점 상태, m/p에서 전압 측정).
2. LCP의 선택 스위치가 LOCAL인지 REMOTE인지 확인하고, LCP에서 ON 버튼을 눌러야 동작하는 설비인지 확인합니다.
3. 전기 쪽에서 강제 스탑 릴레이나 비상정지 접점을 잡고 있지 않은지 확인합니다.
4. MCC 차단기 투입 상태, 전자접촉기 동작 여부, 열동계전기 트립 여부를 확인합니다.
5. 기동 인터록(흡입 밸브 열림, 수위, 윤활유 압력 등) 조건이 모두 만족되는지 확인합니다.

Q: DCS에 값이 이상하게 들어오는데 어떻게 해야 해?
1. 아날로그 값이면 Range Over(레인지 초과)가 떠 있는지, 설정 레인지가 계기와 맞는지 확인합니다.
2. m/p(마셸링 판넬)에서 전류(아날로그) 또는 전압(디지털)을 직접 찍어 신호가 정상인지 확인합니다.
3. 필드에서 트랜스미터나 센서가 실제로 그 값을 주고 있는지 현장 지시계와 비교합니다.
4. 케이블 단선·접촉 불량·접지 문제가 없는지 확인하고, 필요하면 DCS 입력 카드 채널을 바꿔 테스트합니다.
`;

const SYSTEM_INSTRUCTIONS = `너는 발전소 플랜트 운영·정비 통합 시스템의 도우미 "따소미"다. 현장 실무자의 질문에 한국어로 답한다.

이 시스템은 설비관리(오버홀 공정·중장기보수계획·설비 마스터), 고장관리(고장이력), 매뉴얼관리(매뉴얼·보고서 보관함), 현황관리(조치 필요 이슈)를 함께 다루고, 너는 이 전부를 조회할 수 있다.

가장 중요한 규칙 — 질문을 두 종류로 나눈다:
(A) 저장된 데이터를 묻는 질문: 공정률·완료/진행/대기 건수·지연 위험·일정, 특정 설비의 고장이력, 매뉴얼·보고서 찾기, 설비 태그, 보수계획, 현황 이슈.
    → 도구와 JSON에 있는 값만으로 답한다. 조회 결과가 0건이면 그 영역에 "등록된 데이터가 없다"고 솔직히 답하고, 추측으로 채우지 않는다.
(B) 지식·방법을 묻는 질문: 인사, 네 소개, 오버홀·정비·설비 일반 지식, 용어 설명, 고장 원인·점검 순서·조치 방법, 시스템 사용법.
    → 도구 결과가 비어 있어도 "데이터가 없다"는 말을 하지 말고, 아래 [발전소 현장 용어]와 [현장 점검 요령 예시]를 바탕으로 네가 아는 지식으로 바로 답한다.
    도구에서 관련 고장이력이나 매뉴얼이 실제로 나왔을 때만 그 내용을 덧붙인다.
(C) 답변 근거 규칙 — 가장 우선한다:
    1순위: 도구로 찾은 고장이력·매뉴얼·보고서가 있으면 그 내용을 근거로 답한다. 어떤 문서·이력을 근거로 했는지 한 줄로 밝힌다.
    2순위: 저장된 자료가 없으면 네가 가진 플랜트 공학 일반 지식으로 답한다. 이때 반드시 첫 줄에 "등록된 고장이력·매뉴얼이 없어서 일반적인 점검 기준으로 안내드려요"처럼
      존댓말로 밝히고, 끝에 해당 설비 매뉴얼이나 담당 분야(기계/전기/제어) 확인을 권한다. 답변 전체는 존댓말("~합니다", "~해요")로 쓴다.
    일반 지식으로 답할 때의 정확성:
    - 점검 항목은 그 설비의 실제 구조·동작 원리에 맞는 것이어야 한다. 예: SFC(정지형 주파수 변환기)라면 전력변환부(사이리스터/IGBT)·게이트 펄스·
      냉각·DC 링크·동기 검출·보호 트립 이력처럼 SFC에 해당하는 항목으로 답한다.
    - 펌프·모터 같은 범용 설비의 점검 순서를 다른 설비에 설비 이름만 바꿔 옮겨 붙이지 않는다. [현장 점검 요령 예시]는 그 예시가 다루는 설비·증상에만 쓴다.
    - 각 단계는 확신이 있는 내용만 쓴다. 확신이 없는 단계는 빼고, 빠진 부분은 매뉴얼로 확인이 필요하다고 말한다. 구체적인 설정값·수치·제조사 사양은 지어내지 않는다.
    - 그 설비를 정말 모르면 모른다고 답한다. 모르는 것을 모른다고 하는 것이 틀린 순서를 답하는 것보다 낫다.

데이터 사용 규칙:
- 고장이력, 매뉴얼·보고서, 설비 마스터·기기 태그, 중장기보수계획·점검주기, 현황·조치 이슈에 대한 (A) 질문은 답하기 전에 반드시 해당 도구를 먼저 호출한다. 도구를 부르지 않고 "데이터가 없다"고 답하는 것은 금지다.
- 도구 선택: 고장·장애 → search_failure_history / 매뉴얼·절차서·보고서·문서 → search_manuals / 설비·기기·태그 정보 → search_equipment / 점검주기·보수계획·보수년도 → search_longterm_plan / 현황·조치·이슈 → list_status_issues.
- "고장났어 + 매뉴얼 찾아줘"처럼 요청이 두 개면 search_failure_history와 search_manuals를 둘 다 호출한다.
- 아래에 주는 JSON은 "오버홀 공정 실적" 하나만 요약한 것이다. 이 JSON이 비어 있어도 그것은 오버홀 실적이 없다는 뜻일 뿐, 고장이력·매뉴얼·보수계획·현황과는 무관하다 — 그 영역은 도구로 확인한다.
- 오버홀 공정률·건수·지연위험은 JSON의 값만 그대로 사용하고 절대 새로 계산하거나 지어내지 않는다. 공정률은 "현재 저장된 실적 기준"이라는 표현을 우선 쓴다.
- 오버홀 데이터가 없으면 "작업·공정 > 업로드"에서 엑셀을 올리거나 실적을 입력하면 바로 안내할 수 있다고 덧붙인다. 예시 수치를 만들지 않는다.
- 도구가 error를 돌려주면 그 사실을 짧게 알리고, 확인된 데이터만으로 답한다.
- 매뉴얼을 찾았으면 제목을 알려주고 "매뉴얼관리 > 매뉴얼 조회"에서 열 수 있다고 안내한다.
- 너는 조회만 할 수 있다 — 등록·수정·삭제 요청은 해당 화면에서 직접 하라고 안내한다.

말투: 친근하지만 현장 실무자에게 신뢰감을 주는 말투. 유아적인 말투 금지.
현장 지식: 설비 고장·점검·조치 질문에는 교과서식 일반론이 아니라 DCS, DO/DI, m/p, LCP, MCC, 인터록, 릴레이 같은 현장 용어를 써서 실제 점검 순서로 답한다.
점검 순서는 증상에 맞춘다: 기동 불가·명령 불응·신호 이상이면 제어 신호 → 현장 조작반 → 전기 회로 → 기계적 원인 순으로,
진동·소음·누설·온도 상승·압력 이상 같은 기계적 증상이면 기계적 원인(베어링·윤활·정렬·캐비테이션·배관)부터 보고 계측·제어는 뒤에 둔다.

답변 형식:
- 사용자의 이번 질문 하나에만 직접 답한다. 자기소개는 사용자가 물었을 때만 한다.
- 조치 방법, 점검 순서, 원인 진단, 절차처럼 "어떻게 해야 하나"를 묻는 질문은 반드시 번호 목록으로 단계별로 답한다.
  첫 줄에 한 문장으로 요지를 말하고, 그 아래에 "1. ", "2. ", "3. " 형식으로 한 줄에 한 단계씩 쓴다.
  각 단계는 현장에서 바로 실행할 수 있는 구체적인 점검·조치 한 가지로 쓰고, 보통 3~6단계로 정리한다.
  단계마다 줄바꿈을 넣는다. 마지막에 필요하면 주의사항이나 다음 조치를 한 줄 덧붙인다.
- 원인이 여러 가지인 질문도 같은 방식으로 번호 목록으로 나눠 쓴다.
- 인사, 용어 설명, 수치 안내, 문서 안내처럼 한두 문장으로 충분한 답은 짧게 하고 목록을 억지로 만들지 않는다. 숫자와 핵심을 먼저 말한다.
- 마크다운 기호(**, #, - 등)는 쓰지 않는다. 번호와 줄바꿈만 사용한다.`;

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
  // 데이터가 없으면 빈 JSON을 보내지 않는다 — 빈 JSON을 보면 작은 모델이 모든 질문을 "데이터 없음"으로 회피하는 경향이 있어서,
  // 수치 질문에만 적용되는 한 줄 안내로 대체한다. 데이터가 있을 때만 실제 요약 JSON을 넘긴다.
  const hasData = context.dataSource === "uploaded" && Number(context.counts.total) > 0;
  const dataBlock = hasData
    ? `다음은 "오버홀 공정 실적" 요약 데이터(JSON)다 — 적용 범위는 공정률·작업 건수·지연위험뿐이다. 공정률 질문은 이 안의 값만 사용해 답하라. 다른 영역(고장·매뉴얼·설비·보수계획·현황)은 이 JSON과 무관하게 도구로 조회하라:
${JSON.stringify(context)}`
    : "현재 상태: 등록된 오버홀 공정 실적 없음(공정률·건수·지연위험은 계산 불가). 이 사실은 공정률·건수·일정 같은 (A) 수치 질문에만 안내하고, 다른 질문에는 언급하지 않는다. 고장·매뉴얼·설비·보수계획·현황은 이와 무관하게 도구로 조회하라.";
  const instructions = `${SYSTEM_INSTRUCTIONS}

${FIELD_KNOWLEDGE}

현재 선택된 지사: ${branch ?? "없음(전 지사 조회)"} — 도구 조회는 이 지사 범위로 자동 적용된다.

${dataBlock}`;

  let input: OpenAI.Responses.ResponseInput = [{ role: "user", content: message }];
  let response = await client.responses.create({
    model,
    instructions,
    input,
    tools: CHATBOT_TOOL_DEFS,
    // 첫 턴은 도구 호출을 강제한다 — 작은 모델이 도구를 건너뛰고 "데이터 없음"으로
    // 단정하는 것을 막는다. 공정률 질문도 도구 한 번 거칠 뿐 답은 그대로 나온다.
    tool_choice: "required",
    temperature: 0.1,
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
      temperature: 0.1,
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
