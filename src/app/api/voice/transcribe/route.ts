// 음성 입력 받아쓰기 — 녹음된 오디오 한 덩어리를 OpenAI STT로 텍스트화하고, 그 칸에
// 맞게 GPT로 한 번 더 정리해서 돌려준다.
//
// 브라우저 내장 Web Speech API(연속 인식 + 자동 재시작)는 같은 말을 중복으로 쏟아내고
// 침묵 타이머로 제멋대로 다음 칸에 넘어가 버려 다루기 어려웠다 — 그래서 "녹음 한 번 =
// 텍스트 한 번"으로 바꿨다. 사용자가 누르고 있는 동안(또는 토글) 한 칸 분량을 녹음하고,
// 멈추면 그 구간 전체를 한 번만 인식한다. 다음 칸으로 넘어가는 것도 더 이상 자동이 아니라
// 사용자가 직접 "다음"을 눌러야 한다(VoiceSequenceFill.tsx 쪽 변경).
//
// 같은 OPENAI_API_KEY/GPT_CHAT_ENABLED 로 켜고 끈다(오버홀 챗봇 api/overhaul/chatbot과 공유).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** STT 모델 — "GPT 음성 인식"을 쓰기로 했다(요청사항). 계정에 따라 쓸 수 없으면
 *  OPENAI_TRANSCRIBE_MODEL 환경변수로 whisper-1 등으로 바꿀 수 있다(코드 수정 없이). */
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
/** 받아쓴 원문을 칸에 맞게 정리하는 모델 — 오버홀 챗봇과 같은 환경변수를 공유한다 */
const CLEAN_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
/** 짧은 음성 한 칸 분량이면 충분히 넉넉한 상한 */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_FIELD_LABEL_LEN = 60;
const MAX_OPTIONS = 30;

function fail(status: number, reason: string) {
  return NextResponse.json({ ok: false, reason }, { status });
}

/** 오버홀 챗봇(api/overhaul/chatbot)과 같은 분류 — 키 문제인지 한도 초과인지 모델
 *  이름 문제인지 구분해야 원인을 바로 알 수 있다. 민감한 값은 담지 않는다. */
class UpstreamError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function upstreamReason(err: unknown): string {
  const status = err instanceof UpstreamError ? err.status : 0;
  if (status === 401 || status === 403) return "upstream_auth";
  if (status === 429) return "upstream_rate";
  if (status === 404) return "upstream_model";
  return "upstream_error";
}

/**
 * 받아쓴 원문을 그 칸에 바로 넣을 수 있게 정리하는 프롬프트 — 보기가 없는(자유
 * 서술·짧은 값) 칸에만 쓴다. 보기가 있는(select) 칸은 matchOptionWithOpenAI 를
 * 쓴다(아래 설명 참고 — 같은 프롬프트에 두 가지를 다 넣었더니 작은 모델이
 * 헷갈려 했다). 추상적인 규칙 설명만으로는("군더더기 말을 지워라") 모델이
 * "바꾸는 것 자체가 위험하다"고 판단해 입력을 그대로 돌려주는 경우가 많아서,
 * 구체적인 예시(few-shot)를 넣었다 — 작은 모델일수록 설명보다 예시를 더 잘 따른다.
 *
 * 처음엔 "원문에 없는 내용은 지어내지 마라"만 강하게 시켰더니, STT가 발음이 비슷한
 * 단어를 엉뚱하게 잘못 받아적여도(예: "순환수"를 "순한수"로) 모델이 "틀렸을 수도
 * 있지만 고치는 건 지어내는 거니까"라며 그 오타를 그대로 베껴 왔다 — 실제로 겪은
 * 문제. 그래서 "지어내지 마라"와 "말이 안 되면 맥락으로 바로잡아라"를 규칙에서
 * 분명히 나눴다: 아예 없던 내용을 보태는 건 금지하지만, 있던 말을 더 말이 되는
 * 쪽으로 고치는 교정은 허용·권장한다.
 */
function buildCleanupPrompt(fieldLabel: string, kind: "short" | "long", raw: string): string {
  const kindLine =
    kind === "long"
      ? "이 칸은 여러 문장이 들어갈 수 있는 자유 서술 칸이다. 문장을 자연스럽게 다듬어서 출력해라."
      : "이 칸은 한 줄짜리 짧은 값이 들어가는 칸이다. 핵심 값만 출력해라.";

  return `너는 한국어 음성 받아쓰기 결과를 양식 입력칸에 바로 넣을 수 있게 정리하는 도우미다. 입력을 그대로 돌려주는 것은 "정리"가 아니다 — 아래 규칙대로 반드시 다듬어서 출력해라.

지금 채우려는 칸: "${fieldLabel}"
${kindLine}

예시(다른 칸 기준 — 방식만 참고):
칸: "작성자" / 원문: "어 작성자는 음 홍길동입니다" → 출력: 홍길동
칸: "내용" / 원문: "그러니까 방음벽 음 철거 범위를 사진으로 확인합니다" → 출력: 방음벽 철거 범위를 사진으로 확인합니다.
칸: "설비명" / 원문: "설비명은 1호기 순환수 펌프 순환수 펌프요" → 출력: 1호기 순환수 펌프
칸: "설비명" / 원문: "일호기 순한수 펌프" → 출력: 1호기 순환수 펌프 (발음이 비슷해 잘못 받아적힌 "순한수"를 현장 설비 용어로 말이 되는 "순환수"로 바로잡음)
칸: "내용" / 원문: "배관에서 어 누수 같은 소음이 들려서 정기 점검 대상입니다" → 출력: 배관에서 누수로 추정되는 소음이 들려 정기 점검 대상입니다. (음성 인식 상 어색한 "누수 같은 소음"을 맥락상 더 말이 되는 표현으로 다듬음 — 새 사실을 보탠 건 아님)

사용자가 음성으로 말한 원문(받아쓰기 결과 — 인식 오류나 더듬거림이 섞여 있을 수 있다):
"${raw}"

규칙:
1. 사용자가 "${fieldLabel}는/은/이/가 ~~"처럼 칸 이름을 같이 말했으면, 그 이름을 말한 부분은 반드시 빼고 실제 내용만 남긴다.
2. "음", "어", "그러니까" 같은 군더더기 말과 더듬거나 같은 말 반복은 반드시 지운다.
3. 단어나 구절이 뜻이 안 통하거나 이 칸(${fieldLabel})의 맥락과 안 맞으면, 발음이 비슷해 잘못 받아적혔을 가능성을 추론해서 가장 말이 되는 표현으로 바로잡는다 — 이건 지어내는 게 아니라 교정이다.
4. 다만 원문에 아예 등장하지 않은 새로운 사실·수치·이름을 보태지는 않는다(교정은 "있던 말을 더 말이 되게" 고치는 것까지만, 없던 정보를 만들어 내는 게 아니다).
5. 출력은 그 칸에 바로 들어갈 내용만 적는다 — 설명, 따옴표, 접두사 없이 결과 텍스트만. 원문에 쓸 만한 내용이 전혀 없으면 빈 문자열만 출력한다.`;
}

/**
 * 받아쓰기(STT) 모델에 "이런 맥락의 말이 나올 것이다"를 prompt 로 살짝 건네준다
 * (OpenAI 전사 API 가 지원하는 입력 — 받아쓴 글자를 대신 채워 주는 게 아니라,
 * 발음이 비슷한 후보들 중 이 맥락에 맞는 쪽을 더 잘 고르도록 돕는 "힌트"다).
 * 정리 단계(cleanWithOpenAI)는 오디오 없이 글자만 보고 고치므로 한계가 있는데,
 * 여기서 미리 맥락을 주면 애초에 엉뚱하게 받아적힐 확률 자체가 줄어든다 — 설비명
 * 같은 전문 용어가 "순한수 펌프"처럼 비슷한 음으로 잘못 받아적히는 문제가 실제로 있었다.
 */
function buildTranscribeHint(fieldLabel: string, options: string[] | null): string {
  const base = `설비 점검·정비 현장에서 "${fieldLabel}" 칸에 들어갈 말을 받아쓰는 중이다. 설비명·지사명·전문 용어가 섞인 구어체 한국어 문장일 수 있다.`;
  if (options && options.length) {
    return `${base} 다음 중 하나를 고르는 말일 때가 많다: ${options.slice(0, 20).join(", ")}.`;
  }
  return base;
}

async function transcribeWithOpenAI(
  audio: Blob,
  apiKey: string,
  fieldLabel: string,
  options: string[] | null,
): Promise<string | null> {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("language", "ko");
  if (fieldLabel) form.append("prompt", buildTranscribeHint(fieldLabel, options));
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new UpstreamError(res.status, body.slice(0, 300));
  }
  const data = await res.json();
  return typeof data?.text === "string" ? data.text.trim() : null;
}

async function cleanWithOpenAI(prompt: string, apiKey: string): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CLEAN_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[api/voice/transcribe] 정리 단계 실패:", res.status, body.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text.trim() : null;
}

/**
 * 선택형(보기가 있는) 칸 전용.
 *
 * 처음엔 모델이 보기 문구를 그대로 출력하게(자유 텍스트 프롬프트로) 시켰더니,
 * 같은 요청인데도 어떨 때는 정확히 골라내고 어떨 때는 원문 문장을 그대로
 * 돌려주는 등 들쭉날쭉했다 — 작은 모델이 "이 중 하나만 그대로 베껴 써라"를
 * 안정적으로 못 지켰다.
 *
 * 대신 모델에게는 "보기 번호(숫자)"만 답하게 한다 — 보기 문구 자체는 모델이
 * 한 글자도 직접 생성하지 않고, 이 함수가 번호로 내가 이미 들고 있는 options
 * 배열에서 그대로 꺼내 쓴다. 숫자 하나만 고르는 쪽이 모델에게도 더 쉬운 작업이라
 * 훨씬 안정적으로 맞혔고, 한국어 문구를 직접 베끼게 하는 경로 자체를 없앴다.
 */
async function matchOptionWithOpenAI(
  fieldLabel: string,
  options: string[],
  raw: string,
  apiKey: string,
): Promise<string | null> {
  const prompt = `사용자가 "${fieldLabel}" 칸을 채우려고 음성으로 말했다. 받아쓴 원문을 듣고, 사용자가 고른 보기의 번호를 찾아라.

보기 목록:
${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}

받아쓴 원문: "${raw}"

정답 번호 하나만 숫자로 출력해라(예: 3). 뜻이 통하는 보기가 전혀 없으면 0을 출력해라. 번호 말고 다른 글자는 절대 출력하지 마라.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CLEAN_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 10,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[api/voice/transcribe] 선택형 매칭 실패:", res.status, body.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  const match = content.match(/\d+/);
  if (!match) return null;
  const idx = parseInt(match[0], 10);
  return idx >= 1 && idx <= options.length ? options[idx - 1] : null;
}

export async function POST(req: Request) {
  // 킬스위치 + 필수 설정 — 하나라도 비어 있으면 항상 비활성(fail-closed), OpenAI를 절대 호출하지 않는다.
  if (process.env.GPT_CHAT_ENABLED !== "true") return fail(200, "disabled");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(200, "disabled");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "invalid_request");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return fail(400, "invalid_request");
  if (audio.size > MAX_AUDIO_BYTES) return fail(413, "invalid_request");

  const fieldLabelRaw = form.get("fieldLabel");
  const fieldLabel = typeof fieldLabelRaw === "string" ? fieldLabelRaw.trim().slice(0, MAX_FIELD_LABEL_LEN) : "";
  const fieldKind = form.get("fieldKind") === "long" ? "long" : "short";

  let options: string[] | null = null;
  const optionsRaw = form.get("options");
  if (typeof optionsRaw === "string") {
    try {
      const parsed = JSON.parse(optionsRaw);
      if (Array.isArray(parsed)) {
        options = parsed.filter((o): o is string => typeof o === "string" && o.length > 0).slice(0, MAX_OPTIONS);
      }
    } catch {
      /* 옵션 파싱 실패해도 전사 자체는 계속한다 — 그냥 보기 없이 정리한다 */
    }
  }

  try {
    const raw = await transcribeWithOpenAI(audio, apiKey, fieldLabel, options);
    if (!raw) return NextResponse.json({ ok: true, raw: "", text: "" });
    if (!fieldLabel) return NextResponse.json({ ok: true, raw, text: raw });

    if (options && options.length) {
      // 선택형 칸 — 모델은 번호만 고르고, 실제 문구는 내가 options 배열에서 그대로
      // 꺼내 쓴다(한국어 글자를 모델이 직접 생성하지 않아 깨질 일이 없다). 매칭 안
      // 되면 원문으로 때우지 않고 빈 문자열을 돌려준다 — 클라이언트가 "못 알아들었다"는
      // 안내를 그 자리에서 보여주게 한다.
      const matched = await matchOptionWithOpenAI(fieldLabel, options, raw, apiKey).catch(() => null);
      return NextResponse.json({ ok: true, raw, text: matched ?? "" });
    }

    // 자유 서술·짧은 값 칸 — 정리 단계가 실패해도(네트워크 오류 등) 받아쓴 원문은
    // 살려서 돌려준다. 빈 손으로 돌아가는 것보다 원문이라도 칸에 들어가는 편이 낫다.
    const prompt = buildCleanupPrompt(fieldLabel, fieldKind, raw);
    let cleaned = await cleanWithOpenAI(prompt, apiKey).catch(() => null);
    // 드물게 망가진 응답(멀티바이트 글자가 중간에 끊겨 U+FFFD로 치환된 경우)이
    // 들어올 때가 있다(실제로 관찰됨 — 네트워크/레이트리밋 경계에서 발생하는 듯).
    // 이런 깨진 글자를 그대로 칸에 채우면 사용자가 못 알아보니, 원문으로 대체한다.
    if (cleaned?.includes("�")) cleaned = null;
    return NextResponse.json({ ok: true, raw, text: cleaned ?? raw });
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : undefined;
    console.error("[api/voice/transcribe] 실패:", { status, message: err instanceof Error ? err.message : String(err) });
    return fail(200, upstreamReason(err));
  }
}
