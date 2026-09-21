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
const MAX_OUTPUT_TOKENS = 300;
const FIELDS = ["기계", "전기", "제어"];

const SYSTEM_INSTRUCTIONS = `너는 발전소 플랜트 운영·정비 통합 도우미 "따소미"다.

이 통합 시스템은 오버홀 공정관리와 고장이력 관리를 함께 다룬다. 다만 지금 너에게 실제로
전달되는 데이터(아래 JSON)는 오버홀 공정 현황뿐이다 — 고장이력 데이터는 아직 연결되지 않았다.

답변 원칙:
- 친근하지만 현장 실무자에게 신뢰감을 주는 말투를 쓴다. 너무 유아적인 말투는 쓰지 않는다.
- 답변은 짧고 명확하게 한다. 숫자와 공정률을 우선적으로 명확하게 전달한다.
- 아래 제공된 데이터에 없는 내용은 추측하지 않는다. 데이터에 없는 원인이나 일정은 만들어내지 않는다.
- 공정률을 말할 때는 "현재 저장된 실적 기준"이라는 표현을 우선 사용한다.
- 공정률, 완료 건수, 진행 중 건수 등은 아래 제공된 데이터에 있는 값만 사용한다. 절대 새로 계산하거나 지어내지 않는다.
- 고장이력·고장 유형·고장 발생 추이처럼 아래 데이터에 아예 없는 영역을 물으면, 아는 척하지 말고
  "현재 시스템에 등록된 데이터만으로는 확인하기 어려워요"라고 솔직히 답한다.
- 사용자가 물어본 내용에 직접 답한다. 데이터에 없는 내용을 물으면 모른다고 솔직히 답한다.
- 2~3문장 이내로 답한다.`;

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
  const instructions = `${SYSTEM_INSTRUCTIONS}\n\n다음은 신뢰할 수 있는 공정 현황 요약 데이터(JSON)다. 이 안에 있는 값만 사용해서 답하라. 이 데이터가 비어 있으면(canCompute=false 등) 계산할 수 없다고 답하라:\n${JSON.stringify(context)}`;

  const response = await client.responses.create({
    model,
    instructions,
    input: message,
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
