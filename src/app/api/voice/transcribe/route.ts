// 음성 입력 받아쓰기 — 녹음된 오디오 한 덩어리를 OpenAI STT로 텍스트화하고, 그 칸에
// 맞게 GPT로 한 번 더 정리해서 돌려준다.
//
// 브라우저 내장 Web Speech API(연속 인식 + 자동 재시작)는 같은 말을 중복으로 쏟아내고
// 침묵 타이머로 제멋대로 다음 칸에 넘어가 버려 다루기 어려웠다 — 그래서 "녹음 한 번 =
// 텍스트 한 번"으로 바꿨다. 사용자가 누르고 있는 동안(또는 토글) 한 칸 분량을 녹음하고,
// 멈추면 그 구간 전체를 한 번만 인식한다. 지금은 작성 화면의 글 입력칸마다 음성 버튼이 따로 붙는다
// (VoiceDictationButton.tsx — 예전의 여러 칸을 차례로 도는 VoiceSequenceFill 은 2026-11 에 없앴다).
//
// 모델은 두 단계로 나뉜다 — 받아쓰기(STT)와 그 결과를 칸에 맞게 다듬는 정리 단계.
// 받아쓰기는 오버홀 챗봇과 같은 OPENAI_API_KEY/GPT_CHAT_ENABLED 로 켜고 끄지만,
// 정리 단계의 모델은 챗봇(OPENAI_MODEL)과 별도로 OPENAI_VOICE_CLEANUP_MODEL 로 고른다
// — 음성 입력 쪽 모델을 바꿔도 챗봇 답변 품질에 영향이 없게 분리했다.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** STT 모델 — 기본은 gpt-transcribe(계정에서 확인됨). 계정에 따라 다른 모델을 쓰려면
 *  OPENAI_TRANSCRIBE_MODEL 로 바꿀 수 있다(코드 수정 없이). */
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe";
/** 받아쓴 원문을 칸에 맞게 정리하는 모델 — 오버홀 챗봇의 OPENAI_MODEL 과는 독립된
 *  별도 환경변수다(계정에서 확인됨, 기본 gpt-6-luna). */
const VOICE_CLEANUP_MODEL = process.env.OPENAI_VOICE_CLEANUP_MODEL || "gpt-6-luna";
/** 짧은 음성 한 칸 분량이면 충분히 넉넉한 상한 */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_FIELD_LABEL_LEN = 60;
const MAX_OPTIONS = 30;
/** 호출부가 보낸 maxChars 가 너무 크거나 이상해도 이 선을 넘지 않게 묶어 둔다 */
const MAX_CHARS_CAP = 300;

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

/** 녹음 Blob 의 실제 MIME 에 맞는 확장자를 고른다 — OpenAI 전사 API 는 파일명 확장자와
 *  content-type 이 서로 맞아야 한다고 안내한다("We recommend an extension-bearing
 *  filename and an appropriate content type"). 전에는 녹음 포맷과 무관하게 항상
 *  "recording.webm"으로 올렸는데, 브라우저가 webm 을 못 만들어 mp4/ogg 로 녹음된
 *  경우(voiceRecording.ts 의 폴백) 확장자가 실제 내용과 달라지는 문제가 있었다. */
function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "mp4";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("flac")) return "flac";
  return "webm"; // 알 수 없으면 가장 흔한 포맷으로 가정한다
}

/**
 * 받아쓴 원문을 그 칸에 바로 넣을 수 있게 정리하는 프롬프트 — 보기가 없는(자유
 * 서술·짧은 값) 칸에만 쓴다. 보기가 있는(select) 칸은 buildOptionMatchPrompt 를
 * 쓴다(같은 프롬프트에 두 가지를 다 넣었더니 작은 모델이 헷갈려 했다). 추상적인
 * 규칙 설명만으로는("군더더기 말을 지워라") 모델이 "바꾸는 것 자체가 위험하다"고
 * 판단해 입력을 그대로 돌려주는 경우가 많아서, 구체적인 예시(few-shot)를 넣었다 —
 * 작은 모델일수록 설명보다 예시를 더 잘 따른다.
 *
 * 처음엔 "원문에 없는 내용은 지어내지 마라"만 강하게 시켰더니, STT가 발음이 비슷한
 * 단어를 엉뚱하게 잘못 받아적여도(예: "순환수"를 "순한수"로) 모델이 "틀렸을 수도
 * 있지만 고치는 건 지어내는 거니까"라며 그 오타를 그대로 베껴 왔다 — 실제로 겪은
 * 문제. 그래서 "지어내지 마라"와 "말이 안 되면 맥락으로 바로잡아라"를 규칙에서
 * 분명히 나눴다: 아예 없던 내용을 보태는 건 금지하지만, 있던 말을 더 말이 되는
 * 쪽으로 고치는 교정은 허용·권장한다.
 *
 * 여러 문장이 들어가는 자유 서술 칸(kind: "long")은 "-습니다"체 완성 문장 대신
 * 개조식(현장 보고서·점검표에서 쓰는, 핵심만 "-함/-됨/-확인/-완료" 식으로 끝맺는
 * 간결한 표기)으로 출력한다 — 자연스러운 문장으로 다듬으라고만 했더니 오히려
 * 더 길고 수식어 많은 문장이 나와, 사진 설명처럼 자리가 좁은 칸에서 잘려 보이는
 * 문제가 있었다(실제로 겪음). maxChars 가 주어지면(사진 설명처럼 격자 칸에
 * 들어가는 경우) 그 글자 수 안으로 더 추리라고 덧붙인다.
 *
 * 결과는 자유 텍스트가 아니라 { text: string } 구조화 JSON 으로 받는다(Responses API,
 * reasoning.effort:"none") — 모델이 설명·따옴표를 덧붙이는 사고를 원천적으로 막는다.
 */
/**
 * 모든 음성 입력(양식 칸·사진 편집·따소미 질문)의 정리 단계에 공통으로 붙는 "플랜트 용어 우선" 규칙.
 * STT 는 일상어 쪽으로 받아적는 경향이 있다 — "단자번호"라고 말했는데 "환자번호"로 받아적힌 일이 실제로 있었다.
 * 이 화면들은 모두 발전소·지역난방 설비 정비 현장의 말이므로, 발음이 비슷한 플랜트 용어가 맥락에 맞으면
 * 그쪽을 먼저 택하게 한다. 자주 틀리는 짝을 예로 들어 둔다(작은 모델은 설명보다 예시를 잘 따른다).
 */
const PLANT_TERM_RULE = `플랜트 용어 우선 — 이 받아쓰기는 발전소·지역난방 설비 정비 현장에서 한 말이다. 받아쓴 낱말이 일상어나 다른 분야의 말(환자·병원·한자 등)이어도, 발음이 비슷한 설비·전기·계측·기계 용어가 앞뒤 맥락에 맞으면 먼저 그 플랜트 용어로 추론해 바로잡는다.
   자주 잘못 들리는 예: 환자번호/한자번호→단자번호, 환자대→단자대, 환자→단자(배선·결선·체결 이야기일 때), 순한수→순환수, 메가→메거, 게전기→계전기, 접전→접점, 질락→지락, 트림→트립, 누우→누유, 베어린→베어링, 휴즈→퓨즈, 리엑터→리액터, 마샬링→마셜링, 임펠라→임펠러, 트랜스미타→트랜스미터, 차단 기→차단기, 절연 저항→절연저항.
   영문 약어는 대문자로 쓴다(에스에프씨→SFC, 지티→GT, 에스티→ST, 비에프피→BFP, 디씨에스→DCS, 피엘씨→PLC, 엠씨씨→MCC, 엘씨피→LCP). 숫자는 아라비아 숫자로 쓴다(일호기→1호기, 삼번→3번).
   단, 사람 이름처럼 일상어가 분명히 맞는 자리는 바꾸지 않는다.`;

/** STT keywords — 자주 잘못 들리는 플랜트 용어. 보기(options)가 있으면 보기를 먼저 넣고 남는 자리를 채운다(합계 20개) */
const PLANT_KEYWORDS = [
  "단자", "단자번호", "단자대", "차단기", "계전기", "절연저항", "메거", "접점", "지락", "트립",
  "누유", "인터락", "SFC", "GT", "ST", "BFP", "DCS", "PLC", "MCC", "LCP",
];
const MAX_KEYWORDS = 20;

function buildCleanupPrompt(fieldLabel: string, kind: "short" | "long", raw: string, maxChars?: number): string {
  const kindLine =
    kind === "long"
      ? `이 칸은 완성된 문장이 아니라 개조식으로 적는 칸이다. "-습니다/-했습니다" 같은 문장체 종결어미는 쓰지 말고, 명사형이나 "-함/-됨/-확인/-완료"처럼 핵심만 간결하게 끝맺어라. 여러 사실은 쉼표로 나열한다.`
      : "이 칸은 한 줄짜리 짧은 값이 들어가는 칸이다. 핵심 값만 출력해라.";
  const lengthLine = maxChars
    ? `\n이 칸은 자리가 좁다 — 공백 포함 ${maxChars}자를 넘지 않게, 꼭 필요한 말만 남겨서 더 짧게 줄여라.`
    : "";

  return `너는 한국어 음성 받아쓰기 결과를 양식 입력칸에 바로 넣을 수 있게 정리하는 도우미다. 입력을 그대로 돌려주는 것은 "정리"가 아니다 — 아래 규칙대로 반드시 다듬어서 JSON으로 출력해라.

지금 채우려는 칸: "${fieldLabel}"
${kindLine}${lengthLine}

예시(다른 칸 기준 — 방식만 참고):
칸: "작성자" / 원문: "어 작성자는 음 홍길동입니다" → text: "홍길동"
칸: "내용" / 원문: "그러니까 방음벽 음 철거 범위를 사진으로 확인합니다" → text: "방음벽 철거 범위 사진으로 확인" (개조식 — "-합니다" 종결어미를 빼고 핵심만 남김)
칸: "설비명" / 원문: "설비명은 1호기 순환수 펌프 순환수 펌프요" → text: "1호기 순환수 펌프"
칸: "설비명" / 원문: "일호기 순한수 펌프" → text: "1호기 순환수 펌프" (발음이 비슷해 잘못 받아적힌 "순한수"를 현장 설비 용어로 말이 되는 "순환수"로 바로잡음)
칸: "조치사항" / 원문: "음 환자 번호 삼번 풀려 있어서 재체결했습니다" → text: "단자번호 3번 풀림 확인, 재체결" (결선 이야기라 "환자"가 아니라 "단자" — 플랜트 용어로 바로잡음)
칸: "내용" / 원문: "배관에서 어 누수 같은 소음이 들려서 정기 점검 대상입니다" → text: "배관 누수 추정 소음 발생, 정기 점검 대상" (개조식 — 새 사실을 보탠 건 아님)
칸: "사진 설명"(자리 좁음, 30자 제한) / 원문: "음 이 사진은 1호기 순환수 펌프 베어링 부위에서 기름이 새는 걸 확인한 사진이에요" → text: "1호기 순환수 펌프 베어링 유출 확인" (개조식 + 글자 수 제한에 맞춰 짧게)

사용자가 음성으로 말한 원문(받아쓰기 결과 — 인식 오류나 더듬거림이 섞여 있을 수 있다):
"${raw}"

규칙:
1. 사용자가 "${fieldLabel}는/은/이/가 ~~"처럼 칸 이름을 같이 말했으면, 그 이름을 말한 부분은 반드시 빼고 실제 내용만 남긴다.
2. "음", "어", "그러니까" 같은 군더더기 말과 더듬거나 같은 말 반복은 반드시 지운다.
3. 단어나 구절이 뜻이 안 통하거나 이 칸(${fieldLabel})의 맥락과 안 맞으면, 발음이 비슷해 잘못 받아적혔을 가능성을 추론해서 가장 말이 되는 표현으로 바로잡는다 — 이건 지어내는 게 아니라 교정이다.
   ${PLANT_TERM_RULE}
4. 다만 원문에 아예 등장하지 않은 새로운 사실·수치·이름·단위·날짜·부정(아니다/없다 등) 표현을 보태거나 뒤집지는 않는다(교정은 "있던 말을 더 말이 되게" 고치는 것까지만, 없던 정보를 만들어 내거나 뜻을 바꾸는 게 아니다).
5. 결과는 JSON의 text 필드에 넣는다.${maxChars ? ` 글자 수 제한(${maxChars}자)을 꼭 지켜라.` : ""} 원문에 쓸 만한 내용이 전혀 없으면 text를 빈 문자열로 한다.`;
}

/**
 * 따소미 대화창(fieldKind: "question") 전용 정리 프롬프트 — 양식 칸이 아니라 챗봇에게 묻는 말이다.
 * 개조식으로 줄이면 "SFC 고장사례 찾아줘"가 "SFC 고장사례"처럼 요청이 사라져 챗봇이 의도를 잃으므로,
 * 묻는 말투·요청("찾아줘", "있어?", "어떻게 해?")은 그대로 살리고 군더더기만 지운다.
 * 가장 중요한 일은 잘못 들린 설비 용어를 앞뒤 맥락으로 바로잡는 것이다(에스에프씨→SFC, 비에프피→BFP 등) —
 * 챗봇 검색이 그 낱말로 보관함을 찾기 때문에 용어 하나가 틀리면 0건이 된다.
 */
function buildQuestionCleanupPrompt(raw: string): string {
  return `너는 발전소·지역난방 설비 정비 챗봇 "따소미"에게 사용자가 음성으로 한 질문을 받아쓴 결과를, 채팅 입력창에 바로 넣을 수 있는 질문 한두 문장으로 정리하는 도우미다. 결과는 JSON의 text 필드에 넣는다.

예시:
원문: "어 에스에프씨 그 고장 사례 좀 찾아줄래" → text: "SFC 고장사례 찾아줘"
원문: "비에프피 음 급수 펌프에서 누유 난 적 있어" → text: "BFP(급수펌프)에서 누유 난 적 있어?"
원문: "가스 터빈 발전기 메가 측정 어떻게 해" → text: "가스터빈 발전기 메거 측정 어떻게 해?"
원문: "청주 지사 현황 미완료 거 뭐 있어" → text: "청주지사 현황 미완료 건 뭐 있어?"
원문: "그 아까 그 보고서에서 조치 사항 다시 알려 줘" → text: "아까 그 보고서에서 조치사항 다시 알려줘"
원문: "환자 번호 풀림 고장 사례 있어" → text: "단자번호 풀림 고장사례 있어?" (결선 이야기라 "환자"가 아니라 "단자")

사용자가 말한 원문(받아쓰기 결과 — 인식 오류·더듬거림이 섞여 있을 수 있다):
"${raw}"

규칙:
1. 묻는 말투와 요청 표현("찾아줘", "알려줘", "있어?", "어떻게 해?")은 그대로 살린다. 개조식으로 줄이지 않는다. 묻는 문장이면 끝에 물음표를 붙인다.
2. "음", "어", "그", "좀", "그러니까" 같은 군더더기와 같은 말 반복은 지운다. 단, "아까 그 보고서"처럼 앞 대화를 가리키는 말은 남긴다.
3. 설비·정비 맥락에서 뜻이 안 통하는 낱말은 발음이 비슷해 잘못 받아적혔을 가능성을 추론해 현장 용어로 바로잡는다.
   ${PLANT_TERM_RULE}
   그 밖의 약어: 지아이에스→GIS, 에이브이알→AVR, 오엘티씨→OLTC, 에이치알에스지→HRSG. 지사명은 "○○지사"로 붙여 쓴다.
4. 원문에 없는 새 사실·설비·수치·조건을 보태거나 뜻(부정·긍정)을 뒤집지 않는다.
5. 쓸 만한 내용이 전혀 없으면 text를 빈 문자열로 한다.`;
}

/** 대화창 받아쓰기의 STT 힌트 낱말 — 자주 잘못 들리는 영문 약어·전문 용어를 미리 알려 준다 */
const QUESTION_KEYWORDS = ["따소미", ...PLANT_KEYWORDS].slice(0, MAX_KEYWORDS);

/**
 * 받아쓰기(STT) 모델에 "이런 맥락의 말이 나올 것이다"를 prompt 로 살짝 건네준다
 * (OpenAI 전사 API 가 지원하는 입력 — 받아쓴 글자를 대신 채워 주는 게 아니라,
 * 발음이 비슷한 후보들 중 이 맥락에 맞는 쪽을 더 잘 고르도록 돕는 "힌트"다).
 * 정리 단계(cleanWithOpenAI)는 오디오 없이 글자만 보고 고치므로 한계가 있는데,
 * 여기서 미리 맥락을 주면 애초에 엉뚱하게 받아적힐 확률 자체가 줄어든다 — 설비명
 * 같은 전문 용어가 "순한수 펌프"처럼 비슷한 음으로 잘못 받아적히는 문제가 실제로 있었다.
 */
/** STT 힌트 공통 문장 — 일상어보다 플랜트 용어로 받아적게 한다 */
const PLANT_HINT = "의료·일상 낱말보다 설비 용어로 받아적는다(예: 단자번호·단자대·절연저항·계전기·차단기·접점·지락·트립·누유).";

function buildTranscribeHint(fieldLabel: string, options: string[] | null, question = false): string {
  if (question) {
    return `발전소·지역난방 설비 정비 담당자가 챗봇에게 묻는 질문을 받아쓰는 중이다. 고장 사례·매뉴얼·현황을 찾는 말이 많고, SFC·GT·BFP·DCS 같은 영문 약어와 설비명·지사명이 섞인 구어체 한국어다. ${PLANT_HINT}`;
  }
  const base = `설비 점검·정비 현장에서 "${fieldLabel}" 칸에 들어갈 말을 받아쓰는 중이다. 설비명·지사명·전문 용어가 섞인 구어체 한국어 문장일 수 있다. ${PLANT_HINT}`;
  if (options && options.length) {
    return `${base} 다음 중 하나를 고르는 말일 때가 많다: ${options.slice(0, 20).join(", ")}.`;
  }
  return base;
}

/** gpt-transcribe 의 keywords 파라미터 — prompt(문장형 맥락)와 달리, 실제로 나올 수
 *  있는 낱말을 있는 그대로 나열해 인식 정확도를 높인다. 보기 목록(select 류 칸의 후보)이 있으면
 *  그것을 먼저 넣고, 남는 자리는 자주 잘못 들리는 플랜트 용어(PLANT_KEYWORDS)로 채운다 —
 *  자유 서술 칸도 "단자번호"가 "환자번호"로 들리지 않게 용어 후보를 받는다. */
function buildKeywords(options: string[] | null): string[] {
  const opts = (options ?? []).slice(0, MAX_KEYWORDS);
  return [...opts, ...PLANT_KEYWORDS.filter((k) => !opts.includes(k))].slice(0, MAX_KEYWORDS);
}

async function transcribeWithOpenAI(
  audio: Blob,
  apiKey: string,
  fieldLabel: string,
  options: string[] | null,
  question = false,
): Promise<string | null> {
  const form = new FormData();
  form.append("file", audio, `recording.${extensionForMime(audio.type)}`);
  form.append("model", TRANSCRIBE_MODEL);
  // gpt-transcribe 는 복수형 languages 를 쓴다(language 단수 필드와는 별개 — 같이
  // 보내지 않는다. 공식 가이드: "these models use languages instead of language").
  form.append("languages[]", "ko");
  if (fieldLabel || question) form.append("prompt", buildTranscribeHint(fieldLabel, options, question));
  for (const kw of question ? QUESTION_KEYWORDS : buildKeywords(options)) form.append("keywords[]", kw);
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

/**
 * 정리 단계 공통 호출 — Responses API(챗봇이 쓰는 Chat Completions 와는 다른
 * 엔드포인트) + reasoning.effort:"none"(정리 작업은 깊은 추론이 필요 없어 속도를
 * 우선한다) + 구조화 출력(text.format: json_schema, strict)을 쓴다. 자유 텍스트
 * 프롬프트로만 "이 형식대로 출력해라"를 시켰을 때는 모델이 가끔 설명을 덧붙이거나
 * 원문을 그대로 베껴 오는 등 들쭉날쭉했는데, 스키마로 강제하면 그 칸에만 값이
 * 들어오는 게 구조적으로 보장된다.
 */
async function callStructuredCleanup(
  prompt: string,
  schemaName: string,
  schema: Record<string, unknown>,
  apiKey: string,
  maxOutputTokens: number,
): Promise<Record<string, unknown> | null> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VOICE_CLEANUP_MODEL,
      input: prompt,
      reasoning: { effort: "none" },
      max_output_tokens: maxOutputTokens,
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[api/voice/transcribe] ${schemaName} 실패:`, res.status, body.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const message = (Array.isArray(data?.output) ? data.output : []).find((item: any) => item?.type === "message");
  const outputText = (Array.isArray(message?.content) ? message.content : []).find(
    (c: any) => c?.type === "output_text",
  );
  const raw = outputText?.text;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function cleanWithOpenAI(prompt: string, apiKey: string): Promise<string | null> {
  const result = await callStructuredCleanup(
    prompt,
    "voice_cleanup",
    { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    apiKey,
    300,
  );
  return typeof result?.text === "string" ? (result.text as string).trim() : null;
}

/**
 * 선택형(보기가 있는) 칸 전용.
 *
 * 처음엔 모델이 보기 문구를 그대로 출력하게(자유 텍스트 프롬프트로) 시켰더니,
 * 같은 요청인데도 어떨 때는 정확히 골라내고 어떨 때는 원문 문장을 그대로
 * 돌려주는 등 들쭉날쭉했다 — 작은 모델이 "이 중 하나만 그대로 베껴 써라"를
 * 안정적으로 못 지켰다.
 *
 * 대신 모델에게는 "보기 번호(숫자)"만 optionIndex 필드로 답하게 한다 — 보기
 * 문구 자체는 모델이 한 글자도 직접 생성하지 않고, 이 함수가 번호로 내가 이미
 * 들고 있는 options 배열에서 그대로 꺼내 쓴다. 번호가 범위 밖(0 포함)이면 — 즉
 * 맞는 보기를 못 찾았으면 — null 을 돌려주고, 호출부는 그 칸을 빈 문자열로
 * 응답한다. 클라이언트(VoiceDictationButton)는 빈 문자열을 받으면 그 칸에 값을
 * 쓰지 않고 안내만 띄우므로, 결과적으로 "일치하는 보기가 없으면 기존 값을
 * 그대로 둔다"가 된다. (지금은 고르는 칸에 음성 버튼을 두지 않아 화면에서 쓰이지 않는다)
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

정답 보기의 번호(1부터 시작)를 optionIndex 필드에 넣어라. 뜻이 통하는 보기가 전혀 없으면 optionIndex 를 0으로 한다.`;

  const result = await callStructuredCleanup(
    prompt,
    "voice_option_match",
    {
      type: "object",
      properties: { optionIndex: { type: "integer" } },
      required: ["optionIndex"],
      additionalProperties: false,
    },
    apiKey,
    50,
  );
  const idx = typeof result?.optionIndex === "number" ? (result.optionIndex as number) : NaN;
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
  const kindRaw = form.get("fieldKind");
  const fieldKind = kindRaw === "long" ? "long" : kindRaw === "question" ? "question" : "short";

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

  const maxCharsRaw = form.get("maxChars");
  const maxCharsNum = typeof maxCharsRaw === "string" ? parseInt(maxCharsRaw, 10) : NaN;
  const maxChars = Number.isFinite(maxCharsNum) && maxCharsNum > 0 ? Math.min(maxCharsNum, MAX_CHARS_CAP) : undefined;

  try {
    const raw = await transcribeWithOpenAI(audio, apiKey, fieldLabel, options, fieldKind === "question");
    if (!raw) return NextResponse.json({ ok: true, raw: "", text: "" });

    if (fieldKind === "question") {
      // 따소미 대화창 — 묻는 말투를 살리고 잘못 들린 용어를 맥락으로 바로잡는다. 정리가 실패하면 원문을 쓴다
      let cleaned = await cleanWithOpenAI(buildQuestionCleanupPrompt(raw), apiKey).catch(() => null);
      if (cleaned?.includes("�")) cleaned = null;
      return NextResponse.json({ ok: true, raw, text: (cleaned ?? raw).slice(0, 500) });
    }
    if (!fieldLabel) return NextResponse.json({ ok: true, raw, text: raw });

    if (options && options.length) {
      // 선택형 칸 — 모델은 번호만 고르고, 실제 문구는 내가 options 배열에서 그대로
      // 꺼내 쓴다(한국어 글자를 모델이 직접 생성하지 않아 깨질 일이 없다). 매칭 안
      // 되면 원문으로 때우지 않고 빈 문자열을 돌려준다 — 클라이언트가 "못 알아들었다"는
      // 안내를 그 자리에서 보여주고, 그 칸의 기존 값은 그대로 둔다.
      const matched = await matchOptionWithOpenAI(fieldLabel, options, raw, apiKey).catch(() => null);
      return NextResponse.json({ ok: true, raw, text: matched ?? "" });
    }

    // 자유 서술·짧은 값 칸 — 정리 단계가 실패해도(네트워크 오류 등) 받아쓴 원문은
    // 살려서 돌려준다. 빈 손으로 돌아가는 것보다 원문이라도 칸에 들어가는 편이 낫다.
    const prompt = buildCleanupPrompt(fieldLabel, fieldKind, raw, maxChars);
    let cleaned = await cleanWithOpenAI(prompt, apiKey).catch(() => null);
    // 드물게 망가진 응답(멀티바이트 글자가 중간에 끊겨 U+FFFD로 치환된 경우)이
    // 들어올 때가 있다(실제로 관찰됨 — 네트워크/레이트리밋 경계에서 발생하는 듯).
    // 이런 깨진 글자를 그대로 칸에 채우면 사용자가 못 알아보니, 원문으로 대체한다.
    if (cleaned?.includes("�")) cleaned = null;
    let text = cleaned ?? raw;
    // 프롬프트로 글자 수를 부탁해도 모델이 가끔 넘길 수 있다 — 자리가 좁은 칸(사진
    // 설명 등)이 레이아웃을 깨지 않도록 마지막 안전망으로 한 번 더 자른다.
    if (maxChars && text.length > maxChars) text = text.slice(0, maxChars).trim();
    return NextResponse.json({ ok: true, raw, text });
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : undefined;
    console.error("[api/voice/transcribe] 실패:", { status, message: err instanceof Error ? err.message : String(err) });
    return fail(200, upstreamReason(err));
  }
}
