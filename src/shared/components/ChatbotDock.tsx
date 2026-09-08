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

/**
 * 정비 챗봇 도크 — 메뉴가 아니라 모든 화면 위에 떠 있는 창.
 *
 * 상태는 3단계다.
 *   open   : 패널이 열린 상태
 *   bubble : 우하단 동그란 버튼만 (기본값)
 *   hidden : 완전히 치운 상태. 화면 오른쪽 모서리의 얇은 손잡이와 헤더의
 *            챗봇 버튼으로만 다시 부른다.
 *
 * 상태는 localStorage 에 남겨 화면을 옮기거나 새로고침해도 유지한다. 첫 렌더는
 * 서버와 같아야 하므로(하이드레이션 불일치 방지) 항상 bubble 로 시작하고,
 * 마운트 뒤에 저장값으로 맞춘다.
 *
 * PDF/인쇄 안전: 문서 출력은 html2canvas 가 A4 페이지 ref 만 캡처하므로(pdf.ts)
 * 이 도크는 PDF 에 찍히지 않는다. 브라우저 인쇄에서도 빠지도록 print:hidden 을 건다.
 */
export type DockState = "open" | "bubble" | "hidden";

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
      if (saved === "open" || saved === "bubble" || saved === "hidden") setRawState(saved);
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
}

let msgSeq = 0;

export default function ChatbotDock() {
  const { state, setState } = useChatbotDock();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // 새 말풍선이 붙으면 항상 마지막 줄이 보이게
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  function send() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    setMsgs((prev) => [
      ...prev,
      { id: (msgSeq += 1), role: "user", text: q },
      {
        id: (msgSeq += 1),
        role: "bot",
        // 검색 엔진이 아직 없다. 답을 지어내지 않고 상태를 그대로 알린다.
        text: "아직 준공도서 검색이 연결되지 않았습니다. 검색 기능이 붙으면 이 자리에 근거 문서와 원문 발췌가 그대로 표시됩니다.",
      },
    ]);
  }

  if (state === "hidden") {
    return (
      <button
        type="button"
        onClick={() => setState("bubble")}
        aria-label="정비 챗봇 다시 보기"
        title="정비 챗봇 다시 보기"
        // 완전히 숨겼을 때 남는 유일한 자국 — 화면 오른쪽 모서리의 얇은 손잡이
        className="print:hidden fixed right-0 top-1/2 -translate-y-1/2 z-[200] w-3 h-16 rounded-l-lg bg-primary/70 hover:bg-primary hover:w-5 transition-all"
      />
    );
  }

  if (state === "bubble") {
    return (
      <button
        type="button"
        onClick={() => setState("open")}
        aria-label="정비 챗봇 열기"
        // 모바일은 하단탭(h-16) 위로 올린다
        className="print:hidden fixed right-4 bottom-20 md:right-6 md:bottom-6 z-[200] w-14 h-14 rounded-full bg-primary text-on-primary shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
      >
        <Icon name="smart_toy" className="text-2xl" />
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
        <Icon name="smart_toy" className="text-primary text-lg" />
        <span className="text-title-sm text-on-surface flex-1 truncate">정비 챗봇</span>

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
          onClick={() => setState("hidden")}
          aria-label="숨기기"
          title="숨기기 (오른쪽 모서리 손잡이나 헤더 버튼으로 다시 열 수 있습니다)"
          className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="close" className="text-base" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {msgs.length === 0 ? (
          <div className="m-auto text-center px-2">
            <Icon name="smart_toy" className="text-4xl text-on-surface-variant" />
            <p className="text-sm font-bold text-on-surface mt-2">무엇을 찾아 드릴까요?</p>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              태그명이나 고장 증상을 넣으면 준공도서·벤더프린트에서 근거 문서를 찾아 줍니다.
              <br />
              <strong>검색 기능은 아직 연결 전입니다.</strong>
            </p>
          </div>
        ) : (
          msgs.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "self-end bg-primary text-on-primary rounded-br-sm"
                  : "self-start bg-surface-container-high text-on-surface rounded-bl-sm"
              }`}
            >
              {m.text}
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-border-subtle flex items-center gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="예: 1호기 급수펌프 진동"
          aria-label="챗봇에게 물어보기"
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={send}
          aria-label="보내기"
          className="w-10 h-10 shrink-0 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:opacity-90 active:scale-95 transition"
        >
          <Icon name="send" className="text-lg" />
        </button>
      </div>
    </div>
  );
}
