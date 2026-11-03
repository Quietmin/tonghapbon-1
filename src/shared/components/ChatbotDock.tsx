"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "./ui";
import { getDdasomiReply, type DdasomiReply } from "@/modules/overhaul/lib/ddasomiChat";
import { askDdasomi } from "@/modules/overhaul/lib/chatbotAI";
import type { ChatbotSnapshot } from "@/modules/overhaul/lib/chatbotSnapshot";
import DdasomiLoading from "@/modules/overhaul/components/chatbot/DdasomiLoading";
import "@/modules/overhaul/components/chatbot/ddasomi.css";
import { searchDocgenDocuments, type DocMatch } from "@/modules/docgen/lib/docgenSearch";
import { getSignedUrl } from "@/modules/docgen/lib/archive";
import { MODE_LABELS } from "@/modules/docgen/lib/constants";
import PdfPreviewModal from "@/modules/docgen/components/PdfPreviewModal";

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
  /** 매뉴얼·고장보고서 검색 결과 — 있으면 말풍선 아래에 카드 목록으로 그린다 */
  matches?: DocMatch[];
  /** AI 답변이 조회한 지사 범위 — 있으면 말풍선 위에 "범위: 청주지사" 칩으로 보인다 */
  scope?: string;
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

const DOCK_POS_KEY = "chatbot-dock-pos";
/** 드래그로 안 치고 그냥 누른 걸로 볼 최대 이동 거리(px) — 이보다 덜 움직였으면 클릭이다 */
const DRAG_CLICK_THRESHOLD = 6;

/**
 * 챗봇(접힌 버튼 · 데스크톱 패널)을 손가락/마우스로 끌어 옮길 수 있게 한다.
 * 버튼이 다른 화면의 버튼과 겹쳐 눌리지 않는 문제가 있어 추가했다(사용자 요청).
 *
 * Pointer Events 하나로 마우스·터치를 같이 받는다 — 모바일(손가락)·데스크톱(마우스)을
 * 따로 구현할 필요가 없다. 옮긴 자리는 translate 로만 얹는다(원래 fixed 위치는 그대로
 * 두고 그 위에 더하는 식이라, 화면 폭이 바뀌어도 기준점 계산을 다시 할 필요가 없다).
 * 위치는 localStorage 에 저장해 새로고침·다른 화면 이동에도 남는다.
 *
 * "눌러서 열기"와 "끌어서 옮기기"를 구분해야 한다 — 전혀 안 움직였으면 클릭으로 보고
 * 평소처럼 열리게 둔다(justDragged 를 안 세운다). 조금이라도 문턱을 넘겨 움직였으면
 * 그 클릭은 버린다(옮기고 나서 바로 열리면 사용자가 당황한다).
 */
function useDraggablePosition() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(
    null,
  );
  const justDraggedRef = useRef(false);
  // posRef 는 리액트가 다시 그린 뒤에야(state → ref 복사가 렌더 중에 일어나므로) 최신
  // 값이 된다. pointermove 를 여러 번 받고 바로 pointerup 이 오는 경우(리액트 18 은
  // 같은 틱 안의 setPos 를 모아 한 번에 처리한다 — 그 사이엔 아직 다시 그려지지
  // 않는다) posRef 가 "드래그를 시작하기 전" 값에 멈춰 있을 수 있다. 끝난 자리를
  // 저장할 때는 이 ref 를 쓴다 — onPointerMove 안에서 렌더와 상관없이 바로 갱신한다.
  const lastPosRef = useRef(pos);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCK_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
      if (typeof parsed.x === "number" && typeof parsed.y === "number") setPos({ x: parsed.x, y: parsed.y });
    } catch {
      /* 저장된 위치를 못 읽어도 기본 자리(0,0)로 그냥 동작한다 */
    }
  }, []);

  /** candidate(x,y) 만큼 옮겼을 때 요소가 화면 밖으로 나가지 않게 깎는다 */
  const clamp = useCallback((x: number, y: number) => {
    const el = elRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    // rect 는 이미 지금 pos 만큼 옮겨진 상태다 — 옮기기 전(기준) 좌표로 되돌린다
    const baseLeft = rect.left - posRef.current.x;
    const baseTop = rect.top - posRef.current.y;
    const minX = -baseLeft;
    const maxX = window.innerWidth - rect.width - baseLeft;
    const minY = -baseTop;
    const maxY = window.innerHeight - rect.height - baseTop;
    return {
      x: Math.min(Math.max(x, Math.min(minX, maxX)), Math.max(minX, maxX)),
      y: Math.min(Math.max(y, Math.min(minY, maxY)), Math.max(minY, maxY)),
    };
  }, []);

  // 화면을 돌리거나 창 크기를 바꾸면(폰 가로/세로 전환 등) 저장해 둔 자리가 화면
  // 밖으로 나갈 수 있다 — 다시 안으로 당긴다.
  useEffect(() => {
    function onResize() {
      setPos((p) => clamp(p.x, p.y));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  /*
   * 포인터 캡처(setPointerCapture) 두 가지를 다 시도해 봤는데 둘 다 문제가 있었다.
   *   - pointerdown 에서 바로 걸면: 끌기는 잘 되는데(커서가 작은 버튼 56~112px
   *     밖으로 나가도 계속 쫓아간다), 그냥 클릭했을 때도 캡처가 걸려 있어서 뒤이어
   *     오는 mouseup/click 이(브라우저가 포인터 캡처 중엔 마우스 호환 이벤트도 같이
   *     캡처한 요소로 겨냥한다) 안쪽 버튼이 아니라 이 바깥 div 로 가 버린다 — 버튼의
   *     onClick 이 전혀 안 불리는 원인이었다. pointerup 핸들러 안에서 즉시
   *     releasePointerCapture 를 불러도 소용없었다 — mouseup 의 타겟은 이미 그 전에
   *     정해진 뒤라 너무 늦다(실제로 재현·확인함).
   *   - 문턱을 넘을 때까지 캡처를 미루면: 클릭은 멀쩡한데, 빠르게 끌 때 첫
   *     pointermove 가 오기도 전에 커서가 이미 버튼 밖으로 나가 버리는 경우가 있어
   *     (버튼이 작아서) 그 뒤로 pointermove 를 하나도 못 받고 드래그가 멈춰 버렸다.
   *
   * 그래서 캡처 자체를 쓰지 않는다. 대신 pointerdown 이 일어난 그 순간 window 에
   * 직접 pointermove/pointerup 리스너를 달아 포인터를 쫓는다 — 커서가 어디로
   * 가든(버튼 밖이든 화면 끝이든) window 는 계속 이벤트를 받으므로 추적이 끊기지
   * 않고, click 이벤트의 타겟은 애초에 전혀 건드리지 않으니(캡처를 안 거니까)
   * 그냥 누르기는 항상 원래 버튼으로 간다.
   */
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return; // 마우스는 왼쪽 버튼만
      const pointerId = e.pointerId;
      dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: posRef.current.x, baseY: posRef.current.y, moved: false };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const st = dragRef.current;
        if (!st) return;
        const dx = ev.clientX - st.startX;
        const dy = ev.clientY - st.startY;
        if (!st.moved && Math.hypot(dx, dy) < DRAG_CLICK_THRESHOLD) return;
        st.moved = true;
        const next = clamp(st.baseX + dx, st.baseY + dy);
        lastPosRef.current = next;
        setPos(next);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const st = dragRef.current;
        dragRef.current = null;
        if (!st?.moved) return;
        justDraggedRef.current = true;
        // justDraggedRef 는 도크 전체(열기 버튼·최소화·닫기)가 같이 쓴다. 막아야 하는
        // 건 딱 하나 — 드래그를 끝낸 바로 그 pointerup 이 만드는 "유령 클릭"뿐이다
        // (마우스를 떼면 브라우저가 같은 동작 안에서 바로 click 을 하나 더 쏜다).
        // 그 유령 클릭은 pointerup 과 같은 동기 작업 안에서 일어나므로, microtask 로
        // 미뤄 끄면 그 클릭이 지나간 *바로 다음*에 풀린다 — 시간을 정해 두면(예:
        // 300ms) 그 안에 사용자가 다른 버튼(예: 헤더를 끌고 바로 닫기)을 눌러도 같이
        // 막혀 버리는데, microtask 는 그 문제가 없다.
        queueMicrotask(() => {
          justDraggedRef.current = false;
        });
        try {
          localStorage.setItem(DOCK_POS_KEY, JSON.stringify(lastPosRef.current));
        } catch {
          /* 못 저장해도 이번 화면에서는 그대로 보이니 무시한다 */
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clamp],
  );

  /** 버튼 onClick 맨 앞에서 부른다 — true 면 방금 드래그였다는 뜻이니 열기 동작을 건너뛴다 */
  const consumeDraggedFlag = useCallback(() => {
    const was = justDraggedRef.current;
    justDraggedRef.current = false;
    return was;
  }, []);

  return {
    elRef,
    pos,
    /** 접힌 버튼용 — 폰·PC 모두 옮기므로 바로 transform 으로 적용한다 */
    style: { transform: pos.x || pos.y ? `translate(${pos.x}px, ${pos.y}px)` : undefined },
    /**
     * 데스크톱 패널용 — 패널은 PC(md 이상)에서만 끌어 옮기고 폰 시트는 바닥에 그대로
     * 붙어 있어야 한다. transform 을 바로 주면 PC 에서 끌어 옮긴 좌표가 localStorage 에
     * 남아 있다가 폰 화면에서도 시트를 밀어 버린다 — CSS 변수로만 값을 건네고, 실제
     * transform 적용은 ddasomi.css 의 `@media (min-width:768px)` 규칙에 맡긴다(그 미디어
     * 밖에서는 변수가 있어도 적용되지 않는다).
     */
    panelStyle: { "--dock-x": `${pos.x}px`, "--dock-y": `${pos.y}px` } as CSSProperties,
    // onPointerDown 하나면 된다 — 움직임 추적은 window 리스너가 알아서 하니,
    // move/up/cancel 을 요소에 따로 걸 필요가 없다.
    dragHandlers: { onPointerDown },
    consumeDraggedFlag,
  };
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
  const [preview, setPreview] = useState<{ title: string; previewUrl: string; downloadUrl: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const drag = useDraggablePosition();

  /** 검색 결과 카드를 탭했을 때 — 보관함 조회 화면(ArchiveBrowser)과 같은 방식으로 서명 URL 둘을 받아 모달로 연다 */
  async function openMatch(m: DocMatch) {
    setOpeningId(m.id);
    try {
      const [previewUrl, downloadUrl] = await Promise.all([
        getSignedUrl(m.pdfPath),
        getSignedUrl(m.pdfPath, 3600, { download: true }),
      ]);
      setPreview({ title: m.title, previewUrl, downloadUrl });
    } catch {
      setMsgs((prev) => [
        ...prev,
        { id: (msgSeq += 1), role: "bot", text: "문서를 여는 데 실패했어요. 다시 시도해 주세요." },
      ]);
    } finally {
      setOpeningId(null);
    }
  }

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

    const reply = await getDdasomiReply(q, snapshot, askDdasomi, searchDocgenDocuments);
    setPending(false);
    setMsgs((prev) => [
      ...prev,
      { id: (msgSeq += 1), role: "bot", text: reply.text, kind: reply.kind, suggestions: reply.suggestions, matches: reply.matches, scope: reply.scope },
    ]);
  }

  function send() {
    sendText(input.trim());
  }

  if (state === "bubble") {
    return (
      // 모바일은 하단탭(h-16) 위로 올린다. 다른 화면의 버튼과 겹쳐 그 버튼을 못 누르는
      // 일이 있어, 손가락(폰)·마우스(PC) 로 끌어 옮길 수 있게 했다(drag.dragHandlers) —
      // touch-none 이 없으면 폰에서 끌 때 브라우저가 화면 스크롤로 먼저 가로채 간다.
      <div
        ref={drag.elRef}
        style={drag.style}
        className="print:hidden fixed right-4 bottom-20 md:right-6 md:bottom-6 z-[200] flex flex-col items-end gap-3 touch-none"
        {...drag.dragHandlers}
      >
        {/* 말풍선 — 버튼과 같이 눌리도록 클릭 영역을 공유한다. 폰에서는 버튼을 작게(56px) 하고 말풍선은
            감춘다 — 큰 버튼과 말풍선이 현황 목록 같은 본문을 가리는 데 대한 조정(PC 는 그대로 2배 크기) */}
        <button
          type="button"
          onClick={() => {
            if (drag.consumeDraggedFlag()) return;
            setState("open");
          }}
          aria-hidden="true"
          tabIndex={-1}
          className="ddasomi-speech-bubble mr-6 md:mr-7 max-md:hidden"
        >
          따소미에게
          <br />
          뭐든지 물어봐!
        </button>
        <button
          type="button"
          onClick={() => {
            if (drag.consumeDraggedFlag()) return;
            setState("open");
          }}
          aria-label="정비 챗봇 열기 (따소미) — 길게 끌면 자리를 옮길 수 있어요"
          className="w-14 h-14 md:w-28 md:h-28 rounded-full bg-primary shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        >
          <span className="ddasomi-face-crop w-full h-full">
            <img src="/ddasomi-default.png" alt="" className="ddasomi-face-crop__img ddasomi-idle-anim" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={drag.elRef}
      style={drag.panelStyle}
      role="dialog"
      aria-label="정비 챗봇"
      className={[
        // 떠 있는 판이라 카드와 같은 흰색이어야 바탕 위에 올라앉은 것으로 읽힌다
        // dock-draggable: 끌어 옮긴 좌표(--dock-x/--dock-y)는 md 이상에서만 실제
        // transform 으로 적용한다(ddasomi.css) — 폰 시트가 PC 드래그 좌표에 밀리지 않게.
      "print:hidden fixed z-[200] flex flex-col bg-surface-container-lowest border border-border-subtle shadow-2xl dock-draggable",
        // 모바일: 하단 시트 (하단탭 위에 붙는다) — 시트는 끌어 옮기지 않는다(폰 화면
        // 관례상 바닥에 붙어 있는 게 자연스럽고, 열려 있는 동안은 다른 버튼을 일부러
        // 가리는 모달에 가깝다 — 안 보이는 버튼은 아래 "여유 스크롤"로 접근한다).
        "inset-x-0 bottom-16 h-[70vh] rounded-t-2xl",
        // 데스크톱: 우하단 패널 — 떠 있는 카드라 헤더를 끌어 옮길 수 있다
        "md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[560px] md:max-h-[calc(100vh-6rem)] md:rounded-2xl",
      ].join(" ")}
    >
      <header
        className="flex items-center gap-2 px-4 h-12 border-b border-border-subtle shrink-0 md:cursor-grab md:active:cursor-grabbing"
        onPointerDown={(e) => {
          // 폰 폭에서는 시트 자체를 끌지 않는다 — pointerType 이 아니라 화면 폭으로
          // 가른다(마우스를 쓰는 좁은 창도 있을 수 있어서).
          if (window.innerWidth < 768) return;
          drag.dragHandlers.onPointerDown(e);
        }}
      >
        <span className="ddasomi-face-crop w-7 h-7 shrink-0">
          <img src="/ddasomi-default.png" alt="" className="ddasomi-face-crop__img" />
        </span>
        <span className="text-title-sm text-on-surface flex-1 truncate">정비 챗봇 (따소미)</span>

        <button
          type="button"
          onClick={() => {
            if (drag.consumeDraggedFlag()) return;
            setState("bubble");
          }}
          aria-label="최소화"
          title="최소화"
          className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
        >
          <Icon name="remove" className="text-base" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (drag.consumeDraggedFlag()) return;
            setState("bubble");
          }}
          aria-label="닫기"
          title="닫기"
          className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
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
              매뉴얼·고장보고서 내용도 찾아드려요(예: "변압기 고장 관련 보고서 찾아줘").
              <br />
              <strong>준공도서·벤더프린트 검색은 아직 연결 전입니다.</strong>
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendText(q)}
                  className="px-3.5 min-h-10 rounded-full bg-surface-container-low text-xs font-semibold text-primary border border-border-subtle hover:bg-surface-container-high transition-colors"
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
              <div key={m.id} className="max-w-[92%] self-start flex items-start gap-2">
                <span className={`ddasomi-msg-avatar w-11 h-11 shrink-0 mt-0.5 ${isLatestBot ? "ddasomi-lookaround-anim" : ""}`}>
                  <img src="/ddasomi-search.png" alt="" className="ddasomi-msg-avatar__img" />
                </span>
                <div className="flex flex-col gap-1.5 min-w-0">
                  {/* 어느 지사 범위로 조회한 답인지 — 내 지사와 질문 속 지사가 다를 수 있어 늘 밝힌다 */}
                  {m.scope && (
                    <span className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      <Icon name="location_on" className="text-[13px]" />
                      범위: {m.scope}
                    </span>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-line rounded-bl-sm ${
                      m.kind === "refused" ? "bg-error-container text-on-error-container" : "bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {m.text}
                  </div>
                  {m.matches && m.matches.length > 0 && (
                    <div className="w-full flex flex-col gap-1.5">
                      {m.matches.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => void openMatch(doc)}
                          disabled={openingId === doc.id}
                          className="text-left px-3 py-2 rounded-xl bg-surface-container border border-border-subtle hover:bg-surface-container-high transition-colors disabled:opacity-60"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                            <Icon name="description" className="text-sm" />
                            {MODE_LABELS[doc.docType]}
                            {doc.branch && <span>· {doc.branch}</span>}
                            {doc.field && <span>· {doc.field}</span>}
                          </div>
                          <div className="text-sm font-bold text-on-surface mt-0.5 truncate">{doc.title}</div>
                          <div className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{doc.snippet}</div>
                          <div className="text-xs text-primary font-bold mt-1 flex items-center gap-1">
                            <Icon name="visibility" className="text-sm" />
                            {openingId === doc.id ? "여는 중…" : "미리보기"}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
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
          placeholder="예: 전체 공정률 / 최근 고장이력 알려줘"
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

      {preview && (
        <PdfPreviewModal
          title={preview.title}
          previewUrl={preview.previewUrl}
          downloadUrl={preview.downloadUrl}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
