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
 * 받아쓴 원문을 그 칸에 바로 넣을 수 있게 정리하는 프롬프트.
 *
 * 핵심 규칙 셋:
 *   1) 칸 이름을 같이 말했으면("작성자는 홍길동이에요") 이름 부분은 떼고 내용만 남긴다.
 *   2) 선택형(options가 있는) 칸이면 보기 중 하나만 그대로 고르게 한다 — 전에는
 *      클라이언트에서 문자열 포함 비교로 거칠게 맞췄는데, 그 방식이 "기계"처럼 전혀
 *      다른 칸의 값을 다른 칸에 잘못 채우는 등 엉뚱하게 작동했다. 이제는 모델이 뜻으로
 *      판단해 더 정확하다.
 *   3) 원문에 없는 내용은 지어내지 않는다 — 추측으로 채우면 사용자가 믿고 쓸 수 없다.
 */
function buildCleanupPrompt(
  fieldLabel: string,
  kind: "short" | "long",
  options: string[] | null,
  raw: string,
): string {
  const optionLine =
    options && options.length
      ? `이 칸은 보기 중 하나를 고르는 칸이다 — 아래 보기 중 뜻이 가장 가까운 것 딱 하나만 그대로(토씨 하나 안 틀리고) 출력해라. 뜻이 통하는 보기가 없으면 빈 문자열만 출력해라.\n보기: ${options.join(", ")}`
      : kind === "long"
        ? "이 칸은 여러 문장이 들어갈 수 있는 자유 서술 칸이다. 문장을 자연스럽게 다듬어서 출력해라."
        : "이 칸은 한 줄짜리 짧은 값이 들어가는 칸이다. 핵심 값만 출력해라.";

  return `너는 한국어 음성 받아쓰기 결과를 양식 입력칸에 바로 넣을 수 있게 정리하는 도우미다.

지금 채우려는 칸: "${fieldLabel}"
${optionLine}

사용자가 음성으로 말한 원문(받아쓰기 결과 — 인식 오류나 더듬거림이 섞여 있을 수 있다):
"${raw}"

규칙:
1. 사용자가 "${fieldLabel}는/은/이/가 ~~"처럼 칸 이름을 같이 말했으면, 그 이름을 말한 부분은 빼고 실제 내용만 남긴다.
2. "음", "어", "그러니까" 같은 군더더기 말과 더듬거나 반복한 말은 지운다.
3. 원문에 없는 내용을 새로 지어내거나 추측해서 채우지 않는다.
4. 출력은 그 칸에 바로 들어갈 내용만 적는다 — 설명, 따옴표, 접두사 없이 결과 텍스트만. 원문에 쓸 만한 내용이 전혀 없으면 빈 문자열만 출력한다.`;
}

async function transcribeWithOpenAI(audio: Blob, apiKey: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("language", "ko");
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
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text.trim() : null;
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
    const raw = await transcribeWithOpenAI(audio, apiKey);
    if (!raw) return NextResponse.json({ ok: true, raw: "", text: "" });
    if (!fieldLabel) return NextResponse.json({ ok: true, raw, text: raw });

    const prompt = buildCleanupPrompt(fieldLabel, fieldKind, options, raw);
    // 정리 단계가 실패해도(네트워크 오류 등) 받아쓴 원문은 살려서 돌려준다 — 빈 손으로
    // 돌아가는 것보다 원문이라도 칸에 들어가는 편이 사용자에게 낫다. 이 단계는
    // 전사 자체와 달리 throw 하지 않는다(cleanWithOpenAI 가 실패하면 null).
    const cleaned = await cleanWithOpenAI(prompt, apiKey).catch(() => null);
    return NextResponse.json({ ok: true, raw, text: cleaned ?? raw });
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : undefined;
    console.error("[api/voice/transcribe] 실패:", { status, message: err instanceof Error ? err.message : String(err) });
    return fail(200, upstreamReason(err));
  }
}
