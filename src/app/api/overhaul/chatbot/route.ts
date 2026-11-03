// 따소미 챗봇의 실제 답변을 GPT로 생성한다.
//
// 구조는 2층이다.
//   1) 오버홀 공정 요약(getChatbotSnapshot)은 지금까지처럼 클라이언트가 context로 보내고,
//      서버는 sanitizeContext로 걸러 프롬프트에 그대로 넣는다 — 공정률 질문은 도구 호출 없이 바로 답한다.
//   2) 고장이력·매뉴얼 보관함·설비 마스터·중장기보수계획·현황 이슈는 GPT가 필요할 때
//      읽기 전용 도구(chatbotTools.ts)를 직접 호출해 조회한다 — "시스템 전체"를 보는 경로.
//
// 멀티턴: 대화는 서버에 저장하지 않고 화면(ChatbotDock)이 들고 있다가 history 로 함께 보낸다.
// 서버는 매 답변마다 "이번에 실제로 조회한 대상"(지사 범위·도구 호출·고장이력/문서 id)을 memory 로
// 돌려주고, 다음 질문 때 그 memory 를 "대화 맥락" 메모로 바꿔 넣는다 — "그 설비는?", "아까 보고서에서
// 조치사항은?"을 풀 수 있게 하되, 수치는 이전 답을 재사용하지 않고 매번 도구로 다시 조회하게 한다.
// history 가 없으면 예전과 똑같이 한 번 묻고 답한다(옛 호출과 호환).
//
// 기본은 비활성 상태다: GPT_CHAT_ENABLED=true, OPENAI_API_KEY 둘 다 설정되어 있지 않으면
// 항상 { ok:false, reason:"disabled" } 를 반환하고 OpenAI를 호출하지 않는다(fail-closed).
//
// 원본: AI-Do-Sample/api/chat.js → Route Handler로 이식(스냅샷 설명만 하던 버전) →
// 2026-10 도구 호출(전 모듈 조회)로 확장 → 2026-11 멀티턴.
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { resolveBranch } from "@/modules/overhaul/lib/activeBranch";
import { CHATBOT_TOOL_DEFS, runChatbotTool } from "@/modules/overhaul/lib/chatbotTools";
import { detectBranchInMessage } from "@/modules/overhaul/lib/chatbotBranch";
import { isCrossModuleQuestion, isStructuredDataQuestion } from "@/modules/overhaul/lib/chatbotRules";
import { glossaryPromptBlock } from "@/modules/overhaul/lib/chatbotGlossary";
import { chatModelConfig, parseReasoning, supportsReasoning, type ChatReasoning } from "@/modules/overhaul/lib/chatbotModel";
import type { HistoryTurn, TurnMemory } from "@/modules/overhaul/lib/chatbotHistory";
import { BRANCHES } from "@/shared/lib/branches";

export const dynamic = "force-dynamic";
// 도구 호출이 2~3회 왕복하면 10초를 넘을 수 있다 — Vercel 함수 상한을 늘린다(Hobby 최대 60초)
export const maxDuration = 60;

const MAX_MESSAGE_LEN = 500;
const MAX_BODY_BYTES = 64 * 1024; // context JSON + 검색 문서 요약 5건 + 대화 기록
/** 답변 토큰 상한 — 추론 모델은 생각하는 데 쓰는 토큰도 여기서 나가므로 넉넉히 잡는다 */
const MAX_OUTPUT_TOKENS = { reasoning: 6000, plain: 900 };
/** 도구 호출 왕복 상한 — 모델이 도구를 계속 부르며 맴돌지 못하게 끊는다 */
const MAX_TOOL_ROUNDS = 5;
/** 대화 기록 상한 — 오래된 것부터 버린다. 수치는 매번 다시 조회하므로 짧게 둬도 정확도는 떨어지지 않는다 */
const MAX_HISTORY_TURNS = 12;
const MAX_TURN_CHARS = 1500;
const MAX_HISTORY_CHARS = 10000;
const FIELDS = ["기계", "전기", "제어"];

/**
 * 인터넷 검색(OpenAI 내장 web_search) — [필수 검색 지침]의 3단계.
 * 보관함·고장이력을 먼저 보게 하려고, 이번 질문에서 보관함(search_manuals) 또는 고장이력(search_failure_history)
 * 조회를 한 번이라도 마친 뒤의 호출에만 이 도구를 붙인다. 순서를 프롬프트에만 맡기지 않고 코드로도 막는 것이다.
 * CHATBOT_WEB_SEARCH=false 면 끈다(인터넷 반출이 막힌 환경 등).
 */
const WEB_SEARCH_TOOL: OpenAI.Responses.WebSearchTool = { type: "web_search", search_context_size: "medium" };
const ARCHIVE_TOOLS = new Set(["search_manuals", "search_failure_history"]);
/** 답변 아래 출처 링크 상한 */
const MAX_WEB_SOURCES = 5;

type WebSource = { title: string; url: string };

/** 유사 용어집 요약(고장 찾기·매뉴얼 찾기 표현, 검색어 작성 요령) — 매 질문의 지시문에 함께 싣는다 */
const GLOSSARY_BLOCK = glossaryPromptBlock();

/** 본문의 마크다운 링크 출처 표시를 지운다 — "([a.com](https://…))"는 통째로, "[글자](https://…)"는 글자만 남긴다 */
function stripInlineCitations(text: string): string {
  return text
    .replace(/[ \t]*\(\[[^\]]*\]\(https?:\/\/[^)\s]*\)\)/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]*\)/g, "$1");
}

/** 모델이 인터넷 자료로 답했을 때 본문에 달린 출처(url_citation)를 모은다 — 같은 주소는 한 번만 */
function collectWebSources(r: OpenAI.Responses.Response, into: WebSource[]) {
  for (const item of r.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      for (const a of part.annotations ?? []) {
        if (a.type !== "url_citation" || !/^https?:\/\//i.test(a.url)) continue;
        // 같은 문서가 utm_source 꼬리표만 달리해 두 번 잡히므로 꼬리표를 떼고 비교한다
        let url = a.url;
        try {
          const u = new URL(a.url);
          for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
          url = u.toString();
        } catch {
          /* 주소 파싱 실패 — 원래 주소를 쓴다 */
        }
        if (into.some((s) => s.url === url) || into.length >= MAX_WEB_SOURCES) continue;
        into.push({ title: (a.title || url).slice(0, 120), url });
      }
    }
  }
}

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

이 시스템은 오버홀 공정관리(오버홀 공정·중장기보수계획·설비 마스터), 고장관리(고장이력), 매뉴얼관리(매뉴얼·보고서 보관함), 설비 현황 관리(조치 필요 이슈)를 함께 다루고, 너는 이 전부를 조회할 수 있다.

가장 중요한 규칙 — 질문을 두 종류로 나눈다:
(A) 저장된 데이터를 묻는 질문: 공정률·완료/진행/대기 건수·지연 위험·일정, 특정 설비의 고장이력, 매뉴얼·보고서 찾기, 설비 태그, 보수계획, 현황 이슈.
    → 도구와 JSON에 있는 값만으로 답한다. 조회 결과가 0건이면 그 영역에 "등록된 데이터가 없다"고 솔직히 답하고, 추측으로 채우지 않는다.
(B) 지식을 묻는 질문: 인사, 네 소개, 오버홀·정비·설비 일반 지식, 용어 설명, 시스템 사용법.
    → 도구 결과가 비어 있어도 "데이터가 없다"는 말을 하지 말고, 아래 [발전소 현장 용어]와 [현장 점검 요령 예시]를 바탕으로 네가 아는 지식으로 바로 답한다.
    단, 고장 사례를 찾거나 매뉴얼·노하우·점검·조치 방법을 묻는 질문은 (B)가 아니다 — 아래 [필수 검색 지침]을 먼저 따른다.

[필수 검색 지침 — 모든 대화에서 반드시 지킨다. 다른 어떤 규칙보다 우선한다]
질문에 정해진 낱말이 있는지가 아니라, 앞 대화와 맥락까지 보고 "무엇을 찾으려는 질문인지"를 추론해 아래 둘 중 하나에 해당하면 그 순서를 지킨다.
(1) 고장을 찾는 질문 — "고장이력 찾아줘", "고장사례 찾아줘", "이런 고장 난 적 있어?", "비슷한 트립 사례", "그 설비 예전에 어떻게 고쳤어?"처럼 과거의 고장·장애·트립 사례나 그 원인·조치를 찾는 뜻이면:
    1단계: search_manuals(doc_type="fault")로 보관함의 고장보고서를, search_failure_history로 고장이력을 둘 다 조회한다.
    2단계: 관련 있는 결과가 있으면 그것만 근거로 답하고, 첫 줄에 근거로 쓴 보고서·고장이력 제목을 밝힌다("고장보고서 조회"나 "보관함 조회"에서 열 수 있다고 안내한다).
    3단계: 둘 다 0건이거나 결과가 질문한 설비·증상과 무관하면 web_search로 인터넷에서 같은 설비·증상의 고장 사례와 원인·조치를 찾는다.
(2) 매뉴얼·노하우·방법을 찾는 질문 — "매뉴얼 찾아줘", "노하우 알려줘", "방법 찾아줘", "어떻게 점검해?", "교체 절차", "조치 요령"처럼 절차·요령·방법을 찾는 뜻이면:
    1단계: search_manuals(doc_type="manual")로 보관함의 매뉴얼을 먼저 조회한다. 결과의 본문이 필요하면 read_document로 읽는다.
    2단계: 관련 있는 매뉴얼이 있으면 그 내용만 근거로 답하고, 첫 줄에 매뉴얼 제목을 밝힌다("매뉴얼 조회"나 "보관함 조회"에서 열 수 있다고 안내한다).
    3단계: 0건이거나 무관하면 web_search로 인터넷을 찾는다. 제조사 기술자료·기술 표준·학회지·학술논문 같은 신뢰할 수 있는 자료를 우선한다.
공통:
    - 보관함·고장이력 조회보다 인터넷 검색을 먼저 하지 않는다. web_search는 1단계 조회를 마친 뒤에만 쓸 수 있다.
    - 인터넷 자료로 답할 때는 첫 줄에 "보관함에 관련 자료가 없어 인터넷 자료로 안내드려요"처럼 밝히고, 끝에 "우리 설비에 적용하기 전에 해당 설비 매뉴얼이나 담당 분야 확인이 필요합니다"를 덧붙인다.
      URL은 본문에 직접 쓰지 않는다(출처 링크는 화면이 답변 아래에 따로 보여 준다). 인터넷 자료에 없는 수치·절차는 지어내지 않는다.
    - 인터넷 검색을 쓸 수 없거나 인터넷에서도 못 찾으면 아래 (C)의 일반 지식으로 답한다.
(C) 답변 근거 규칙:
    1순위: 도구로 찾은 고장이력·매뉴얼·보고서가 있으면 그 내용을 근거로 답한다. 어떤 문서·이력을 근거로 했는지 한 줄로 밝힌다.
    2순위: 저장된 자료가 없으면 [필수 검색 지침]의 인터넷 자료로 답한다.
    3순위: 인터넷 자료도 없거나 쓸 수 없으면 네가 가진 플랜트 공학 일반 지식으로 답한다. 이때 반드시 첫 줄에 "등록된 고장이력·매뉴얼이 없어서 일반적인 점검 기준으로 안내드려요"처럼
      존댓말로 밝히고, 끝에 해당 설비 매뉴얼이나 담당 분야(기계/전기/제어) 확인을 권한다. 답변 전체는 존댓말("~합니다", "~해요")로 쓴다.
    일반 지식으로 답할 때의 정확성:
    - 점검 항목은 그 설비의 실제 구조·동작 원리에 맞는 것이어야 한다. 예: SFC(정지형 주파수 변환기)라면 전력변환부(사이리스터/IGBT)·게이트 펄스·
      냉각·DC 링크·동기 검출·보호 트립 이력처럼 SFC에 해당하는 항목으로 답한다.
    - 펌프·모터 같은 범용 설비의 점검 순서를 다른 설비에 설비 이름만 바꿔 옮겨 붙이지 않는다. [현장 점검 요령 예시]는 그 예시가 다루는 설비·증상에만 쓴다.
    - 각 단계는 확신이 있는 내용만 쓴다. 확신이 없는 단계는 빼고, 빠진 부분은 매뉴얼로 확인이 필요하다고 말한다. 구체적인 설정값·수치·제조사 사양은 지어내지 않는다.
    - 그 설비를 정말 모르면 모른다고 답한다. 모르는 것을 모른다고 하는 것이 틀린 순서를 답하는 것보다 낫다.

데이터 사용 규칙:
- 고장이력, 매뉴얼·보고서, 설비 마스터·기기 태그, 중장기보수계획·점검주기, 현황·조치 이슈에 대한 (A) 질문은 답하기 전에 반드시 해당 도구를 먼저 호출한다. 도구를 부르지 않고 "데이터가 없다"고 답하는 것은 금지다.
- 도구 선택: 고장·장애 → search_failure_history + search_manuals(doc_type="fault") / 매뉴얼·절차서·노하우·방법 → search_manuals(doc_type="manual") / 보고서·문서 → search_manuals /설비·기기·태그 정보 → search_equipment / 점검주기·보수계획·보수년도 → search_longterm_plan / 현황·조치·이슈 → list_status_issues.
- "고장났어 + 매뉴얼 찾아줘"처럼 요청이 두 개면 search_failure_history와 search_manuals를 둘 다 호출한다.
- 아래에 주는 JSON은 "오버홀 공정 실적" 하나만 요약한 것이다. 이 JSON이 비어 있어도 그것은 오버홀 실적이 없다는 뜻일 뿐, 고장이력·매뉴얼·보수계획·현황과는 무관하다 — 그 영역은 도구로 확인한다.
- 오버홀 공정률·건수·지연위험은 JSON의 값만 그대로 사용하고 절대 새로 계산하거나 지어내지 않는다. 공정률은 "현재 저장된 실적 기준"이라는 표현을 우선 쓴다.
- 오버홀 데이터가 없으면 "작업·공정 > 업로드"에서 엑셀을 올리거나 실적을 입력하면 바로 안내할 수 있다고 덧붙인다. 예시 수치를 만들지 않는다.
- 도구가 error를 돌려주면 그 사실을 짧게 알리고, 확인된 데이터만으로 답한다.
- 매뉴얼을 찾았으면 제목을 알려주고 "매뉴얼관리 > 매뉴얼 조회"에서 열 수 있다고 안내한다.
- 너는 조회만 할 수 있다 — 등록·수정·삭제 요청은 해당 화면에서 직접 하라고 안내한다.

이어지는 대화:
- 앞선 질문·답변이 함께 주어진다. "그 설비", "거기", "아까 보고서", "첫 번째 건"처럼 가리키는 말은 앞 대화와 [대화 맥락] 메모에서 대상을 찾는다.
- 대상이 분명하면 다시 묻지 말고 그 대상으로 도구를 호출한다. 후보가 둘 이상이라 모호할 때만 어느 것인지 짧게 되묻는다.
- 수치·건수·목록·상태는 이전 답변에 나온 값을 그대로 옮기지 말고 이번 질문에 맞게 도구로 다시 조회한다(데이터가 바뀌었을 수 있다).
- 앞에서 찾은 고장이력·문서의 세부 내용(조치사항·원인·절차)을 물으면 read_failure_report(id) 또는 read_document(document_id)로 원문을 읽고 그 내용만 근거로 답한다.
- 사용자가 새 설비·문서·지사를 말하면 그것이 새 대상이다 — 이전 대상의 결과를 섞지 않는다.

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

/**
 * OpenAI 호출 실패를 사용자에게 보여 줄 수 있는 종류로 나눈다 — 전부 upstream_error 하나로 뭉치면
 * 키 문제인지 한도 초과인지 알 수 없어 관리자가 원인을 찾기 어렵다. 키·헤더 같은 민감한 값은 담지 않는다.
 */
function upstreamReason(err: any): string {
  const status = Number(err?.status);
  if (status === 401 || status === 403) return "upstream_auth"; // 키가 틀렸거나 폐기됨
  if (status === 429) {
    const text = `${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();
    return text.includes("quota") || text.includes("billing") ? "upstream_quota" : "upstream_rate";
  }
  if (status === 404) return "upstream_model"; // 모델 이름이 없거나 접근 권한 없음
  return "upstream_error";
}

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

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * 클라이언트가 보관함에서 검색해 보낸 문서 요약 — 제목·종류·지사·분야·발췌만, 최대 5건, 길이 제한.
 * 여기서 걸러지지 않은 값은 프롬프트에 들어가지 않는다.
 */
export function sanitizeDocuments(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return raw
    .slice(0, 5)
    .map((d: any) => ({
      id: typeof d?.id === "string" && UUID_RE.test(d.id) ? d.id : null,
      title: s(d?.title, 120),
      docType: s(d?.docType, 20),
      branch: s(d?.branch, 20),
      field: s(d?.field, 10),
      snippet: s(d?.snippet, 400),
    }))
    .filter((d) => d.title);
}

/**
 * 답변 끝의 "근거문서: 1, 3" / "근거문서: 없음" 줄을 떼어 낸다.
 * usedDocs: 실제로 근거로 쓴 문서의 0-기반 인덱스. 줄이 없으면(모델이 형식을 안 지킴) null — 호출부가 검색 결과를 그대로 쓴다.
 */
export function splitUsedDocs(raw: string, docCount: number): { answer: string; usedDocs: number[] | null } {
  const lines = raw.trimEnd().split(/\r?\n/);
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const m = lines[i].match(/^\s*\**\s*근거\s*문서\s*\**\s*[:：]\s*(.*?)\s*\**\s*$/);
    if (!m) continue;
    const body = m[1];
    const nums = Array.from(body.matchAll(/\d+/g)).map((x) => parseInt(x[0], 10) - 1).filter((n) => n >= 0 && n < docCount);
    const usedDocs = /없음|none/i.test(body) && nums.length === 0 ? [] : Array.from(new Set(nums));
    lines.splice(i, 1);
    return { answer: lines.join("\n").trimEnd(), usedDocs };
  }
  return { answer: raw.trim(), usedDocs: null };
}

function validateMessage(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LEN) return null;
  return message;
}

// ---------------------------------------------------------------------------
// 대화 기록 · 맥락 메모
// ---------------------------------------------------------------------------

const SCOPES = new Set<string>([...BRANCHES, "전 지사"]);
const TOOL_NAMES = new Set(CHATBOT_TOOL_DEFS.map((t) => (t as { name: string }).name));

function sanitizeMemory(raw: any): TurnMemory | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v.slice(0, 8) : []);
  const scope = str(raw.scope, 20);
  return {
    scope: scope && SCOPES.has(scope) ? scope : "전 지사",
    scopeAsked: raw.scopeAsked === true,
    lookups: arr(raw.lookups)
      .map((l) => ({ tool: str(l?.tool, 40) ?? "", args: str(l?.args, 200) ?? "{}" }))
      .filter((l) => TOOL_NAMES.has(l.tool)),
    failures: arr(raw.failures)
      .map((f) => ({ id: str(f?.id, 12) ?? "", title: str(f?.title, 120) ?? "" }))
      .filter((f) => /^\d+$/.test(f.id)),
    docs: arr(raw.docs)
      .map((d) => ({ id: str(d?.id, 36) ?? "", title: str(d?.title, 120) ?? "", docType: str(d?.docType, 10) }))
      .filter((d) => UUID_RE.test(d.id)),
  };
}

/**
 * 화면이 보낸 대화 기록을 거른다 — 역할·길이를 고정하고, 길면 오래된 턴부터 버린다.
 * 기록의 문장은 모델에게 "지난 대화"로만 쓰이고, 수치 근거로는 쓰지 말라고 지시한다(SYSTEM_INSTRUCTIONS).
 */
export function sanitizeHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: HistoryTurn[] = [];
  for (const t of raw.slice(-MAX_HISTORY_TURNS) as any[]) {
    const role = t?.role === "user" || t?.role === "assistant" ? (t.role as HistoryTurn["role"]) : null;
    const text = typeof t?.text === "string" ? t.text.trim().slice(0, MAX_TURN_CHARS) : "";
    if (!role || !text) continue;
    turns.push({ role, text, memory: role === "assistant" ? sanitizeMemory(t.memory) : undefined });
  }
  let total = turns.reduce((n, t) => n + t.text.length, 0);
  while (turns.length && total > MAX_HISTORY_CHARS) total -= turns.shift()!.text.length;
  // 첫 턴이 답변이면 앞 질문이 잘린 것 — 질문부터 시작하게 맞춘다
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

const MY_BRANCH_RE = /(내|우리|제)\s?지사/;

/**
 * 이번 질문의 조회 범위(지사).
 * 질문에 지사가 있으면 그 지사("전 지사"면 전체), "내 지사"라고 하면 내 지사로 돌아간다.
 * 아무 말이 없으면 직전 답변이 사용자가 고른 범위였을 때 그대로 이어 간다 — "청주지사 현황" 다음의
 * "조치중인 것만"이 다시 내 지사로 튀지 않게.
 */
export function resolveScope(
  message: string,
  history: HistoryTurn[],
  myBranch: string | null,
): { branch: string | null; asked: boolean } {
  const asked = detectBranchInMessage(message);
  if (asked === "ALL") return { branch: null, asked: true };
  if (asked) return { branch: asked, asked: true };
  if (MY_BRANCH_RE.test(message)) return { branch: myBranch, asked: false };
  const last = [...history].reverse().find((t) => t.role === "assistant" && t.memory)?.memory;
  if (last?.scopeAsked) return { branch: last.scope === "전 지사" ? null : last.scope, asked: true };
  return { branch: myBranch, asked: false };
}

function uniqBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 지난 턴들의 memory → 모델에게 주는 [대화 맥락] 메모 (최근 것이 앞) */
export function contextNote(history: HistoryTurn[]): string | null {
  const mems = history
    .filter((t) => t.memory)
    .map((t) => t.memory!)
    .reverse();
  if (!mems.length) return null;
  const lookups = uniqBy(mems.flatMap((m) => m.lookups), (l) => l.tool + l.args).slice(0, 8);
  const failures = uniqBy(mems.flatMap((m) => m.failures), (f) => f.id).slice(0, 8);
  const docs = uniqBy(mems.flatMap((m) => m.docs), (d) => d.id).slice(0, 8);
  const lines = [
    "[대화 맥락 — 앞선 턴에서 실제로 조회한 대상. 가리키는 말(그 설비·아까 보고서 등)은 여기서 찾는다. 수치는 여기 없다 — 필요하면 도구로 다시 조회한다]",
    `- 직전 답변의 조회 범위: ${mems[0].scope}${mems[0].scopeAsked ? " (사용자가 지정)" : ""}`,
  ];
  if (lookups.length) lines.push(`- 최근 조회: ${lookups.map((l) => `${l.tool} ${l.args}`).join(" / ")}`);
  if (failures.length) lines.push(`- 최근 다룬 고장이력: ${failures.map((f) => `id=${f.id} "${f.title}"`).join(", ")}`);
  if (docs.length) lines.push(`- 최근 다룬 문서: ${docs.map((d) => `id=${d.id} [${d.docType ?? "문서"}] "${d.title}"`).join(", ")}`);
  return lines.join("\n");
}

/** 도구 결과에서 다음 턴이 가리킬 수 있는 대상(고장이력·문서 id)을 뽑는다 */
function collectTargets(name: string, output: string, mem: TurnMemory) {
  let data: any;
  try {
    data = JSON.parse(output);
  } catch {
    return;
  }
  const addFailure = (r: any) => {
    if (r?.id && !mem.failures.some((f) => f.id === String(r.id)) && mem.failures.length < 8)
      mem.failures.push({ id: String(r.id), title: String(r.title ?? r.equipment_name ?? "").slice(0, 120) });
  };
  const addDoc = (d: any) => {
    if (typeof d?.id === "string" && UUID_RE.test(d.id) && !mem.docs.some((x) => x.id === d.id) && mem.docs.length < 8)
      mem.docs.push({ id: d.id, title: String(d.title ?? "").slice(0, 120), docType: d.doc_type ?? d.docType ?? null });
  };
  if (name === "search_failure_history") (data?.items ?? []).slice(0, 5).forEach(addFailure);
  if (name === "read_failure_report") addFailure(data?.item);
  if (name === "search_manuals") (data?.items ?? []).slice(0, 5).forEach(addDoc);
  if (name === "read_document") addDoc(data?.document);
}

let cachedClient: OpenAI | null = null;
function getClient(apiKey: string) {
  if (!cachedClient) cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

interface Usage {
  calls: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
}

/**
 * GPT 호출 + 도구 호출 루프.
 * 모델이 function_call을 내면 chatbotTools를 실행해 결과를 돌려주고 다시 묻는다 —
 * 최대 MAX_TOOL_ROUNDS 왕복까지. 도구 없이 바로 답하면 1회로 끝난다.
 * 두 번째 호출부터는 previous_response_id 로 이어 붙인다 — 추론 모델의 생각(reasoning) 항목과
 * 도구 호출을 OpenAI 쪽이 그대로 이어 주므로 직접 다시 보낼 필요가 없다.
 */
async function callOpenAI({
  message,
  history,
  context,
  branch,
  branchRequested,
  documents,
  apiKey,
  model,
  reasoning,
}: {
  message: string;
  history: HistoryTurn[];
  context: ReturnType<typeof sanitizeContext>;
  branch: string | null;
  /** 사용자가 직접 지사를 지정했는지(내 지사와 다를 수 있다) — 프롬프트에 알린다 */
  branchRequested?: boolean;
  /** 클라이언트가 보관함에서 미리 찾아 보낸 관련 문서(없으면 빈 배열) */
  documents?: ReturnType<typeof sanitizeDocuments>;
  apiKey: string;
  model: string;
  reasoning: ChatReasoning;
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

${GLOSSARY_BLOCK}

${FIELD_KNOWLEDGE}

${branchRequested ? `사용자가 지정한 조회 범위: ${branch ?? "전 지사"} — 도구 조회는 이 범위로 적용된다. 답할 때 이 범위를 처음에 밝히고, 다른 지사 이야기는 하지 않는다.` : `현재 선택된 지사(내 지사): ${branch ?? "없음(전 지사 조회)"} — 도구 조회는 이 지사 범위로 자동 적용된다. 사용자가 다른 지사를 물으면 그 지사 이름이 질문에 있어야 조회 범위가 바뀐다.`}

${dataBlock}${
    documents && documents.length
      ? `

보관함에서 이 질문으로 미리 검색된 관련 문서 ${documents.length}건(id · 제목 · 종류 · 지사/분야 · 발췌). 이 문서들은 답변 아래에 카드로 함께 표시된다:
${documents.map((d, i) => `${i + 1}. ${d.id ? `(id=${d.id}) ` : ""}[${d.docType ?? "문서"}] ${d.title} (${[d.branch, d.field].filter(Boolean).join(" · ") || "-"}) — ${d.snippet ?? ""}`).join("\n")}
문서 활용 규칙: 이 목록은 보관함에서 이미 찾은 결과이므로 유효하다 — search_manuals 도구가 비어 있거나 오류여도 "보관함 연결이 안 되어 있다"고 말하지 않는다. 발췌만으로 부족하면 id 로 read_document 를 호출해 본문을 읽는다. 질문과 실제로 관련 있는 문서만 근거로 쓴다(제목·발췌가 다른 설비·다른 주제면 "검색된 문서는 ○○ 관련이라 직접 근거는 아니다"라고 한 줄로 밝힌다). 근거로 쓴 문서는 첫 줄에 "○○ 매뉴얼을 참고해 안내드려요"처럼 제목으로 밝힌다. 문서에 없는 절차는 지어내지 않고 일반 기준임을 밝힌다.
답변 맨 마지막 줄에는 반드시 실제로 근거로 쓴 문서의 번호만 "근거문서: 1, 3" 형식으로 적는다. 하나도 근거로 쓰지 않았으면 "근거문서: 없음"이라고 적는다(이 줄은 화면에 보이지 않고 문서 카드 표시에만 쓰인다).`
      : ""
  }`;

  const memory: TurnMemory = {
    scope: branch ?? "전 지사",
    scopeAsked: Boolean(branchRequested),
    lookups: [],
    failures: [],
    docs: [],
  };
  for (const d of documents ?? []) {
    if (d.id) memory.docs.push({ id: d.id, title: d.title ?? "", docType: d.docType });
  }

  const note = contextNote(history);
  const input: OpenAI.Responses.ResponseInput = [
    ...history.map((t): OpenAI.Responses.EasyInputMessage => ({ role: t.role, content: t.text })),
    ...(note ? [{ role: "developer" as const, content: note }] : []),
    { role: "user", content: message },
  ];

  const usesReasoning = supportsReasoning(model);
  const base = {
    model,
    instructions,
    max_output_tokens: usesReasoning ? MAX_OUTPUT_TOKENS.reasoning : MAX_OUTPUT_TOKENS.plain,
    // 추론 모델은 temperature 를 받지 않는다(400). 옛 모델로 되돌렸을 때만 낮은 온도를 준다
    ...(usesReasoning ? { reasoning: { effort: reasoning } } : { temperature: 0.1 }),
  };
  const usage: Usage = { calls: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
  // 인터넷 검색은 보관함·고장이력 조회를 마친 뒤에만 붙인다(WEB_SEARCH_TOOL 주석). 모델·계정이 web_search 를
  // 받지 않으면(400) 이번 질문 동안은 빼고 다시 묻는다 — 인터넷 검색이 안 된다고 답 전체가 실패하면 안 된다.
  let webAllowed = process.env.CHATBOT_WEB_SEARCH !== "false";
  let archiveSearched = false;
  const sources: WebSource[] = [];
  const create = async (
    body: Pick<OpenAI.Responses.ResponseCreateParamsNonStreaming, "input" | "tool_choice" | "previous_response_id">,
  ): Promise<OpenAI.Responses.Response> => {
    const withWeb = webAllowed && archiveSearched && body.tool_choice !== "none";
    let r: OpenAI.Responses.Response;
    try {
      r = await client.responses.create({
        ...base,
        ...body,
        tools: withWeb ? [...CHATBOT_TOOL_DEFS, WEB_SEARCH_TOOL] : CHATBOT_TOOL_DEFS,
        stream: false,
      });
    } catch (err: any) {
      if (!withWeb || Number(err?.status) !== 400) throw err;
      console.error("[api/overhaul/chatbot] web_search 를 쓸 수 없어 빼고 다시 묻는다:", err?.message);
      webAllowed = false;
      return create(body);
    }
    collectWebSources(r, sources);
    usage.calls++;
    usage.input += r.usage?.input_tokens ?? 0;
    usage.cached += r.usage?.input_tokens_details?.cached_tokens ?? 0;
    usage.output += r.usage?.output_tokens ?? 0;
    usage.reasoning += r.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    return r;
  };
  const callsOf = (r: OpenAI.Responses.Response) =>
    r.output.filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call");

  // 첫 호출은 도구를 쓸지 모델이 고른다 — 인사·용어 설명에까지 도구를 강제하면 엉뚱한 고장이력을
  // 끌어와 답하는 일이 있었다("안녕" → 펌프 고장이력). 대신 데이터를 묻는 질문인데 도구 없이
  // 답하려 하면 한 번 더 도구를 강제해 묻는다(데이터 없이 "없음"으로 단정하는 것 방지).
  let response = await create({ input, tool_choice: "auto" });
  const looksLikeData = isStructuredDataQuestion(message) || isCrossModuleQuestion(message);
  if (callsOf(response).length === 0 && looksLikeData) {
    response = await create({ input, tool_choice: "required" });
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const calls = callsOf(response);
    if (calls.length === 0) break;

    const outputs = await Promise.all(
      calls.map(async (call) => {
        // 어떤 도구가 불렸는지만 남긴다(질문·결과 내용은 로그에 넣지 않는다)
        console.log("[api/overhaul/chatbot] tool:", call.name);
        // 클라이언트가 보관함에서 이미 찾은 문서가 있으면 search_manuals 는 그 결과로 대신한다 —
        // 같은 질문을 두 번 검색하지 않고, 서버에 보관함 키가 없는 환경에서도 같은 근거로 답하게 된다.
        const output =
          call.name === "search_manuals" && documents && documents.length
            ? JSON.stringify({
                shown: documents.length,
                note: "화면이 보관함에서 미리 검색한 결과(답변 아래 카드로 표시됨). 본문이 필요하면 id 로 read_document 를 호출한다.",
                items: documents.map((d) => ({
                  id: d.id,
                  doc_type: d.docType,
                  title: d.title,
                  branch: d.branch,
                  field: d.field,
                  snippet: d.snippet,
                })),
              })
            : await runChatbotTool(call.name, call.arguments, branch);
        if (memory.lookups.length < 8) memory.lookups.push({ tool: call.name, args: (call.arguments || "{}").slice(0, 200) });
        if (ARCHIVE_TOOLS.has(call.name)) archiveSearched = true;
        collectTargets(call.name, output, memory);
        return { type: "function_call_output" as const, call_id: call.call_id, output };
      }),
    );
    response = await create({
      previous_response_id: response.id,
      input: outputs,
      // 마지막 왕복에서는 더 부르지 말고 지금까지 조회한 것으로 답하게 한다
      tool_choice: round === MAX_TOOL_ROUNDS - 1 ? "none" : "auto",
    });
  }

  // 인터넷 검색을 쓰면 모델이 본문에 "([사이트](주소))" 꼴의 출처 표시를 넣는다 — 화면은 마크다운을 그리지 않아
  // 주소가 그대로 보이므로 떼어 낸다(출처는 sources 로 따로 보낸다).
  const text = typeof response.output_text === "string" ? stripInlineCitations(response.output_text).trim() : "";
  return { text, memory, usage, sources };
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
  const documents = sanitizeDocuments(body?.documents);
  const history = sanitizeHistory(body?.history);
  // 도구 조회 범위 — 기본은 화면과 같은 oh_branch 쿠키(내 지사), 선택 전이면 전 지사.
  // 질문에 지사 이름이 분명히 있으면("청주지사 현황") 그 지사를, "전 지사"면 전체를 쓰고,
  // 말이 없으면 직전에 사용자가 고른 범위를 이어 간다(resolveScope).
  const myBranch = await resolveBranch();
  const { branch, asked: branchRequested } = resolveScope(message, history, myBranch);

  // 모델 비교 평가(scripts/chatbot-eval.mjs)용 — 개발 서버에서만 요청마다 모델·추론 강도를 바꿔 볼 수 있다
  let { model, reasoning } = chatModelConfig();
  const dev = process.env.NODE_ENV !== "production";
  if (dev) {
    model = req.headers.get("x-chat-model")?.trim() || model;
    reasoning = parseReasoning(req.headers.get("x-chat-reasoning")) ?? reasoning;
  }

  const started = Date.now();
  try {
    const { text: raw, memory, usage, sources } = await callOpenAI({
      message,
      history,
      context,
      branch,
      branchRequested,
      documents,
      apiKey,
      model,
      reasoning,
    });
    if (!raw) return fail(200, "upstream_error");
    const { answer, usedDocs } = splitUsedDocs(raw, documents.length);
    // scope: 이 답이 어느 지사 범위로 조회됐는지 — 화면이 답변 위에 칩으로 보여 준다
    // usedDocs: 모델이 실제로 근거로 쓴 문서 인덱스 — 화면은 이 문서만 카드로 보여 준다
    // memory: 이번에 조회한 대상 — 화면이 다음 질문 때 history 에 실어 되돌려 보낸다
    return NextResponse.json({
      ok: true,
      answer,
      usedDocs,
      scope: branch ?? "전 지사",
      scopeAsked: branchRequested,
      memory,
      // sources: 인터넷 자료로 답했을 때의 출처 — 화면이 답변 아래 링크로 보여 준다(없으면 빈 배열)
      sources,
      ...(dev ? { meta: { model, reasoning, ms: Date.now() - started, usage } } : {}),
    });
  } catch (err: any) {
    // API 키·요청 헤더 등 민감정보가 섞여 나올 수 있는 전체 에러 객체는 절대 로그하지 않는다.
    console.error("[api/overhaul/chatbot] OpenAI 호출 실패:", { status: err?.status, message: err?.message });
    return fail(200, upstreamReason(err));
  }
}
