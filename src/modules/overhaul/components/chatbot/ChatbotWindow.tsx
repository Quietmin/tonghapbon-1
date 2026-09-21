"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/shared/components/ui";
import ChatMessage from "./ChatMessage";
import DdasomiLoading from "./DdasomiLoading";
import type { DdasomiMessage } from "./DdasomiChatbot";
import type { ChatbotSnapshot } from "@/modules/overhaul/lib/chatbotSnapshot";

// 원본: AI-Do-Sample/src/components/chatbot/ChatbotWindow.jsx
// snapshot은 원본에선 항상 동기로 준비돼 있었지만(useStore), 이 저장소는 DB에서 비동기로 가져오므로
// 최초 로딩 중엔 null일 수 있다 — 그 구간만 "데이터 없음" 라벨로 대체한다.
const DATA_SOURCE_LABEL: Record<string, string> = { uploaded: "업로드 데이터", empty: "데이터 없음" };

const QUICK_QUESTIONS = ["전체 공정률 알려줘", "지연 위험 작업 알려줘", "최근 고장이력 보여줘", "설비별 고장 현황 알려줘"];

const OPEN_ANIM_MS = 240;

export default function ChatbotWindow({
  open,
  onClose,
  messages,
  pending,
  onAsk,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  messages: DdasomiMessage[];
  pending: boolean;
  onAsk: (text: string) => void;
  snapshot: ChatbotSnapshot | null;
}) {
  const [input, setInput] = useState("");
  // 닫힐 때 바로 DOM에서 제거하지 않고, transition이 끝난 뒤에 제거한다(부드러운 닫힘 + 닫힌 상태에선 접근성 트리에서 제외)
  const [mounted, setMounted] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(id);
    }
    setAnimateIn(false);
    const t = setTimeout(() => setMounted(false), OPEN_ANIM_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending, open]);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  if (!mounted) return null;

  function submit() {
    if (pending) return;
    const q = input;
    if (!q.trim()) return;
    setInput("");
    onAsk(q);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    // Shift+Enter는 기본 동작(줄바꿈)을 그대로 둔다
  }

  return (
    <div
      role="dialog"
      aria-label="따소미 플랜트 챗봇"
      aria-hidden={!open}
      className={`fixed z-[70] top-20 left-3 right-3 bottom-20 md:top-auto md:left-auto md:right-6 md:bottom-24 md:w-[400px] md:h-[620px] md:max-h-[calc(100vh-120px)] flex flex-col glass-card no-lift rounded-[24px] overflow-hidden ddasomi-window ${
        animateIn ? "ddasomi-window--open" : ""
      }`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-container-low shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/ddasomi-default.png" alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface leading-tight truncate">따소미</p>
            <p className="text-[11px] text-on-surface-variant leading-tight truncate">플랜트 통합 도우미</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="따소미 챗봇 최소화"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <Icon name="remove" className="text-lg" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="따소미 챗봇 닫기"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant transition-colors"
          >
            <Icon name="close" className="text-lg" />
          </button>
        </div>
      </div>

      {/* 데이터 기준 표시 — 답변 문구 자체는 따소미 톤으로 가볍게 유지하고, 출처/기준일은 여기 한 번만 안내 */}
      <div className="px-4 py-1.5 text-[11px] text-on-surface-variant border-b border-border-subtle shrink-0 truncate">
        {DATA_SOURCE_LABEL[snapshot?.dataSource ?? "empty"]}
        {snapshot?.planBaselineDate ? ` · 기준일 ${snapshot.planBaselineDate}` : ""}
      </div>

      {/* 대화 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.map((m, i) => (
          <ChatMessage key={i} message={m} onPick={onAsk} />
        ))}
        {messages.length === 1 && !pending && (
          <div className="flex flex-wrap gap-2 pl-[42px]">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onAsk(q)}
                className="px-3 py-1.5 rounded-full bg-surface-container-low text-xs font-semibold text-primary border border-border-subtle hover:bg-surface-container-high transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {pending && <DdasomiLoading />}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 p-3 border-t border-border-subtle shrink-0"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={pending}
          rows={1}
          placeholder="플랜트 관련 질문을 입력하세요..."
          className="flex-1 resize-none max-h-24 px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-border-subtle text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="질문 보내기"
          className="w-10 h-10 shrink-0 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          <Icon name="send" className="text-lg" />
        </button>
      </form>
    </div>
  );
}
