// 따소미 멀티턴 대화의 주고받는 모양 — 화면(ChatbotDock)과 서버(api/overhaul/chatbot)가 같이 쓴다.
//
// 대화는 서버에 저장하지 않는다. 화면이 대화를 들고 있다가(탭을 닫기 전까지 sessionStorage 에도 남긴다)
// 질문할 때마다 최근 기록을 history 로 함께 보내고, 서버는 답과 함께 "이번에 실제로 조회한 대상"을
// memory 로 돌려준다. 새 대화를 시작하면 화면이 기록을 비우므로 이전 맥락이 끊긴다.

/** 한 답변이 실제로 조회한 대상 — 서버가 만들어 돌려주고, 화면은 손대지 않고 다음 질문에 되돌려 보낸다 */
export interface TurnMemory {
  /** 조회한 지사 범위("청주지사" 또는 "전 지사") */
  scope: string;
  /** 사용자가 질문에서 직접 고른 범위인지 — 그렇다면 다음 질문도 그 범위를 이어 간다 */
  scopeAsked: boolean;
  /** 호출한 도구와 인자(JSON 문자열) */
  lookups: { tool: string; args: string }[];
  /** 다룬 고장이력 — "그 고장 조치사항은?"에서 id 로 전문을 다시 읽는다 */
  failures: { id: string; title: string }[];
  /** 다룬 보관함 문서 — "아까 보고서에서 ~"에서 id 로 본문을 다시 읽는다 */
  docs: { id: string; title: string; docType: string | null }[];
}

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
  memory?: TurnMemory;
}

/**
 * 앞 대화를 가리키는 후속 질문인가 — "그 설비는?", "아까 보고서에서 조치사항은?", "첫 번째 건 자세히".
 * 이런 질문은 문장 자체로 보관함을 임베딩 검색해 봐야 엉뚱한 문서만 걸리므로 검색을 건너뛰고,
 * 서버가 대화 맥락으로 대상을 찾게 둔다.
 */
export const FOLLOW_UP_RE =
  /(아까|방금|앞에서|위에서|이전|그\s?(설비|기기|문서|보고서|매뉴얼|고장|건|거|중|것|지사)|거기|저기|그거|그건|그럼|그러면|첫\s?번째|두\s?번째|세\s?번째|마지막\s?(건|거))/;
