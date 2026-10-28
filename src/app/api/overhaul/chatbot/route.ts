// 따소미 챗봇의 실제 답변을 GPT로 생성한다.
// 공정률·건수 등 숫자는 여기서 계산하지 않는다: 클라이언트가 기존 progress.ts/schedule.ts 계산 결과인
// getChatbotSnapshot() 요약을 "context"로 보내주고, GPT는 그 숫자를 자연어로 설명하는 역할만 한다.
//
// 기본은 비활성 상태다: GPT_CHAT_ENABLED=true, OPENAI_API_KEY 둘 다 설정되어 있지 않으면
// 항상 { ok:false } 를 반환하고 OpenAI를 호출하지 않는다. 활성화는 배포 환경변수 설정으로만 가능하다.
//
// 원본: AI-Do-Sample/api/chat.js — Vercel Pages 스타일 서버리스 함수(req,res)를
// Next App Router의 Route Handler(NextRequest/NextResponse)로 다시 작성했다. 로직은 그대로다.
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

// 모델명은 이 한 곳(또는 OPENAI_MODEL 환경변수)만 바꾸면 된다.
const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const MAX_MESSAGE_LEN = 500;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_OUTPUT_TOKENS = 700;
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

[현장 점검 요령 예시 — 이 수준의 구체성과 용어로 답한다]
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

const SYSTEM_INSTRUCTIONS = `너는 발전소 플랜트 운영·정비 통합 도우미 "따소미"다. 현장 실무자의 질문에 한국어로 답한다.

가장 중요한 규칙:
"등록된 공정 데이터가 없다"는 안내는 사용자가 현재 수치(공정률, 완료/진행/대기 건수, 지연 위험 작업, 특정 설비의 진행 상황, 일정)를 물을 때에만 한다.
그 외의 질문(인사, 네 소개, 오버홀·정비·설비 일반 지식, 용어 설명, 고장 원인에 관한 일반 지식, 시스템 사용법)에는 데이터 유무를 절대 언급하지 말고 네가 아는 지식으로 바로 답한다.

수치 질문에 답할 때:
- 반드시 제공된 공정 현황 JSON에 있는 값만 쓴다. 새로 계산하거나 지어내지 않는다.
- 공정률은 "현재 저장된 실적 기준"이라는 표현을 우선 쓴다.
- 데이터가 없으면 "업로드 분석"에서 엑셀을 올리거나 "실적 입력"에서 실적을 넣으면 바로 안내할 수 있다고 덧붙인다. 예시 수치를 만들지 않는다.
- 특정 설비의 실제 고장 기록·고장 이력은 아직 연결되지 않았으므로 조회가 어렵다고 솔직히 답한다.

말투: 친근하지만 현장 실무자에게 신뢰감을 주는 말투. 유아적인 말투 금지.
현장 지식: 아래 [발전소 현장 용어]와 [현장 점검 요령 예시]를 적극 활용한다. 설비 고장·점검·조치 질문에는 교과서식 일반론이 아니라
DCS, DO/DI, m/p, LCP, MCC, 인터록, 릴레이 같은 현장 용어를 써서 실제 점검 순서로 답한다.
점검 순서는 증상에 맞춘다: 기동 불가·명령 불응·신호 이상이면 제어 신호 → 현장 조작반 → 전기 회로 → 기계적 원인 순으로,
진동·소음·누설·온도 상승·압력 이상 같은 기계적 증상이면 기계적 원인(베어링·윤활·정렬·캐비테이션·배관)부터 보고 계측·제어는 뒤에 둔다.

답변 형식:
- 사용자의 이번 질문 하나에만 직접 답한다. 자기소개는 사용자가 물었을 때만 한다.
- 조치 방법, 점검 순서, 원인 진단, 절차처럼 "어떻게 해야 하나"를 묻는 질문은 반드시 번호 목록으로 단계별로 답한다.
  첫 줄에 한 문장으로 요지를 말하고, 그 아래에 "1. ", "2. ", "3. " 형식으로 한 줄에 한 단계씩 쓴다.
  각 단계는 현장에서 바로 실행할 수 있는 구체적인 점검·조치 한 가지로 쓰고, 보통 3~6단계로 정리한다.
  단계마다 줄바꿈을 넣는다. 마지막에 필요하면 주의사항이나 다음 조치를 한 줄 덧붙인다.
- 원인이 여러 가지인 질문도 같은 방식으로 번호 목록으로 나눠 쓴다.
- 인사, 용어 설명, 단순 수치 안내처럼 한두 문장으로 충분한 질문은 짧게 답하고 목록을 억지로 만들지 않는다.
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

async function callOpenAI({
  message,
  context,
  apiKey,
  model,
}: {
  message: string;
  context: ReturnType<typeof sanitizeContext>;
  apiKey: string;
  model: string;
}) {
  const client = getClient(apiKey);
  // 데이터가 없으면 빈 JSON을 보내지 않는다 — 빈 JSON을 보면 모델이 모든 질문을 "데이터 없음"으로 회피하는 경향이 있어서,
  // 수치 질문에만 적용되는 한 줄 안내로 대체한다. 데이터가 있을 때만 실제 요약 JSON을 넘긴다.
  const hasData = context.dataSource === "uploaded" && Number(context.counts.total) > 0;
  const dataBlock = hasData
    ? `현재 공정 현황 요약 데이터(JSON). 수치 질문에는 이 값만 사용한다:
${JSON.stringify(context)}`
    : "현재 상태: 등록된 오버홀 공정 데이터 없음. (수치 질문에만 이 사실을 안내한다. 다른 질문에는 언급하지 않는다.)";
  const instructions = `${SYSTEM_INSTRUCTIONS}

${FIELD_KNOWLEDGE}

${dataBlock}`;

  const response = await client.responses.create({
    model,
    instructions,
    input: message,
    temperature: 0.3,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });

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

  try {
    const answer = await callOpenAI({ message, context, apiKey, model: MODEL_NAME });
    if (!answer) return fail(200, "upstream_error");
    return NextResponse.json({ ok: true, answer });
  } catch (err: any) {
    // API 키·요청 헤더 등 민감정보가 섞여 나올 수 있는 전체 에러 객체는 절대 로그하지 않는다.
    console.error("[api/overhaul/chatbot] OpenAI 호출 실패:", { status: err?.status, message: err?.message });
    return fail(200, "upstream_error");
  }
}
