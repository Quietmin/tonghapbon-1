"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "./ui";
import { getDdasomiReply, type DdasomiReply } from "@/modules/overhaul/lib/ddasomiChat";
import { askDdasomi } from "@/modules/overhaul/lib/chatbotAI";
import type { ChatbotSnapshot } from "@/modules/overhaul/lib/chatbotSnapshot";
import DdasomiLoading from "@/modules/overhaul/components/chatbot/DdasomiLoading";
import "@/modules/overhaul/components/chatbot/ddasomi.css";

/** 빈 화면·질문창 아래에 항상 보여주는 예시 질문 — 오버홀/고장이력 도메인을 둘 다 보여준다 */
const QUICK_QUESTIONS = ["전체 공정률 알려줘", "지연 위험 작업 알려줘", "최근 고장이력 보여줘", "설비별 고장 현황 알려줘"];

/**
 * 정비 챗봇 도크 — 메뉴가 아니라 모든 화면 위에 떠 있는 창.
 *
 * 상태는 2단계다.
 *   open   : 패널이 열린 상태
 *   bubble : 우하단 동그란 버튼만 (기본값). 닫기(X)도 여기로 돌아온다 —
 *            화면 밖으로 완전히 숨기는 단계를 따로 두면 다시 찾기 어렵다.
 *
 * 상태는 localStorage 에 남겨 화면을 옮기거나 새로고침해도 유지한다. 첫 렌더는
 * 서버와 같아야 하므로(하이드레이션 불일치 방지) 항상 bubble 로 시작하고,
 * 마운트 뒤에 저장값으로 맞춘다.
 *
 * PDF/인쇄 안전: 문서 출력은 html2canvas 가 A4 페이지 ref 만 캡처하므로(pdf.ts)
 * 이 도크는 PDF 에 찍히지 않는다. 브라우저 인쇄에서도 빠지도록 print:hidden 을 건다.
 */
export type DockState = "open" | "bubble";

const STORAGE_KEY = "chatbot-dock-state";

/** 편집기 화면 — 처음 들어갈 때 패널이 A4 미리보기를 가리지 않게 자동으로 접는다 */
const EDITOR_ROUTES = ["/failure/new", "/manual/new", "/docgen/photo-report"];

interface DockApi {
  state: DockState;
  setState: (s: DockState) => void;
  open: () => void;
}

const DockContext = createContext<DockApi | null>(null);

/** 헤더 등 도크 밖에서 도크를 여닫을 때 쓴다 */
export function useChatbotDock(): DockApi {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error("useChatbotDock 은 ChatbotDockProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}

export function ChatbotDockProvider({ children }: { children: React.ReactNode }) {
  const [state, setRawState] = useState<DockState>("bubble");
  const pathname = usePathname();

  // 저장된 상태 복원 (마운트 후 1회). 시크릿 창·저장소 차단에서는 조용히 넘어간다.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "open" || saved === "bubble") setRawState(saved);
    } catch {
      /* 저장소를 못 읽어도 기본값으로 그냥 동작한다 */
    }
  }, []);

  const setState = useCallback((s: DockState) => {
    setRawState(s);
    try {
      localStorage.setItem(STORAGE_KEY, s);
    } catch {
      /* 저장 실패는 이번 세션에서만 상태가 안 남는 정도라 무시한다 */
    }
  }, []);

  // 편집기로 "이동할 때"만 접는다. 이동 후 사용자가 다시 열면 그대로 열려 있다
  // (열 때마다 닫히면 편집 중에는 챗봇을 못 쓴다).
  useEffect(() => {
    if (EDITOR_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
      setRawState((prev) => (prev === "open" ? "bubble" : prev));
    }
  }, [pathname]);

  const api = useMemo<DockApi>(
    () => ({ state, setState, open: () => setState("open") }),
    [state, setState],
  );

  return <DockContext.Provider value={api}>{children}</DockContext.Provider>;
}

interface Msg {
  id: number;
  role: "user" | "bot";
  text: string;
  kind?: DdasomiReply["kind"];
  suggestions?: string[];
}

let msgSeq = 0;

/** 실패(네트워크 오류 등)해도 null — 호출부가 이전 snapshot이나 emptySnapshot으로 대체한다 */
async function fetchSnapshot(): Promise<ChatbotSnapshot | null> {
  try {
    const res = await fetch("/api/overhaul/chatbot/snapshot");
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? data.snapshot : null;
  } catch {
    return null;
  }
}

function emptySnapshot(): ChatbotSnapshot {
  return {
    queriedAt: new Date().toISOString(),
    dataSource: "empty",
    planBaselineDate: new Date().toISOString().slice(0, 10),
    lastEntryDate: null,
    project: null,
    counts: { total: 0, done: 0, inProgress: 0, waiting: 0 },
    canCompute: false,
    overall: null,
    plannedOverall: null,
    byField: null,
    byEquipment: null,
    delayRiskCount: null,
    delayRiskTasks: null,
    scheduleInfo: null,
    anomalies: [],
    hasAnomalies: false,
  };
}

export default function ChatbotDock() {
  const { state, setState } = useChatbotDock();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const snapshotRef = useRef<ChatbotSnapshot | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 패널을 열 때 최신 데이터를 미리 받아둔다 — 첫 질문에서도 바로 답할 수 있게.
  useEffect(() => {
    if (state === "open") fetchSnapshot().then((s) => { if (s) snapshotRef.current = s; });
  }, [state]);

  // 새 말풍선이 붙으면 항상 마지막 줄이 보이게
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  /** 입력창 텍스트뿐 아니라 퀵 질문·제안 버튼 클릭에서도 재사용한다 */
  async function sendText(q: string) {
    if (!q || pending) return;
    setInput("");
    setMsgs((prev) => [...prev, { id: (msgSeq += 1), role: "user", text: q }]);
    setPending(true);

    // 질문마다 최신 데이터를 다시 읽는다. 실패하면 이전에 받아둔 snapshot, 그것도 없으면 emptySnapshot.
    const fresh = await fetchSnapshot();
    if (fresh) snapshotRef.current = fresh;
    const snapshot = snapshotRef.current ?? emptySnapshot();

    const reply = await getDdasomiReply(q, snapshot, askDdasomi);
    setPending(false);
    setMsgs((prev) => [
      ...prev,
      { id: (msgSeq += 1), role: "bot", text: reply.text, kind: reply.kind, suggestions: reply.suggestions },
    ]);
  }

  function send() {
    sendText(input.trim());
  }

  if (state === "bubble") {
    return (
      <button
        type="button"
        onClick={() => setState("open")}
        aria-label="정비 챗봇 열기 (따소미)"
        // 모바일은 하단탭(h-16) 위로 올린다
        className="print:hidden fixed right-4 bottom-20 md:right-6 md:bottom-6 z-[200] w-14 h-14 rounded-full bg-primary shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center overflow-hidden"
      >
        <span className="ddasomi-face-crop w-full h-full">
          <img src="/ddasomi-default.png" alt="" className="ddasomi-face-crop__img ddasomi-idle-anim" />
        </span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="정비 챗봇"
      className={[
        "print:hidden fixed z-[200] flex flex-col bg-surface-container border border-border-subtle shadow-2xl",
        // 모바일: 하단 시트 (하단탭 위에 붙는다)
        "inset-x-0 bottom-16 h-[70vh] rounded-t-2xl",
        // 데스크톱: 우하단 패널
        "md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[560px] md:max-h-[calc(100vh-6rem)] md:rounded-2xl",
      ].join(" ")}
    >
      <header className="flex items-center gap-2 px-4 h-12 border-b border-border-subtle shrink-0">
        <span className="ddasomi-face-crop w-7 h-7 shrink-0">
          <img src="/ddasomi-default.png" alt="" className="ddasomi-face-crop__img" />
        </span>
        <span className="text-title-sm text-on-surface flex-1 truncate">정비 챗봇 (따소미)</span>

        <Link
          href="/chatbot"
          aria-label="전체화면으로 열기"
          title="전체화면으로 열기"
          className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="open_in_full" className="text-base" />
        </Link>
        <button
          type="button"
          onClick={() => setState("bubble")}
          aria-label="최소화"
          title="최소화"
          className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="remove" className="text-base" />
        </button>
        <button
          type="button"
          onClick={() => setState("bubble")}
          aria-label="닫기"
          title="닫기"
          className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="close" className="text-base" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {msgs.length === 0 ? (
          <div className="m-auto text-center px-2">
            <span className="ddasomi-face-crop w-16 h-16 mx-auto block">
              <img src="/ddasomi-default.png" alt="" className="ddasomi-face-crop__img" />
            </span>
            <p className="text-sm font-bold text-on-surface mt-2">안녕하세요! 따소미예요 👋</p>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              플랜트 운영과 정비 관련해서 궁금한 점을 물어보세요.
              <br />
              오버홀 공정 현황과 고장이력 정보를 함께 확인해드릴게요.
              <br />
              <strong>준공도서·벤더프린트 검색, 고장이력 데이터 연동은 아직 준비 중입니다.</strong>
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendText(q)}
                  className="px-3 py-1.5 rounded-full bg-surface-container-low text-xs font-semibold text-primary border border-border-subtle hover:bg-surface-container-high transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => {
            const isLatestBot = m.role === "bot" && i === msgs.length - 1;
            if (m.role === "user") {
              return (
                <div
                  key={m.id}
                  className="max-w-[85%] self-end px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-line bg-primary text-on-primary rounded-br-sm"
                >
                  {m.text}
                </div>
              );
            }
            return (
              <div key={m.id} className="max-w-[85%] self-start flex items-start gap-2">
                <span className={`ddasomi-msg-avatar w-11 h-11 shrink-0 mt-0.5 ${isLatestBot ? "ddasomi-lookaround-anim" : ""}`}>
                  <img src="/ddasomi-search.png" alt="" className="ddasomi-msg-avatar__img" />
                </span>
                <div className="flex flex-col gap-1 min-w-0">
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-line rounded-bl-sm ${
                      m.kind === "refused" ? "bg-error-container text-on-error-container" : "bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {m.text}
                  </div>
                  {Array.isArray(m.suggestions) && m.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => sendText(s)}
                          className="px-3 py-1.5 rounded-full bg-surface-container text-xs font-semibold text-primary border border-border-subtle hover:bg-surface-container-highest transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {pending && <DdasomiLoading />}
      </div>

      <div className="p-3 border-t border-border-subtle flex items-center gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="예: 전체 공정률 알려줘"
          aria-label="챗봇에게 물어보기"
          disabled={pending}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          aria-label="보내기"
          disabled={pending}
          className="w-10 h-10 shrink-0 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:opacity-90 active:scale-95 transition disabled:opacity-60"
        >
          <Icon name="send" className="text-lg" />
        </button>
      </div>
    </div>
  );
}
