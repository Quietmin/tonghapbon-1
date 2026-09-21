"use client";

import { useEffect, useState } from "react";
import { getDdasomiReply, type DdasomiReply } from "@/modules/overhaul/lib/ddasomiChat";
import { askDdasomi } from "@/modules/overhaul/lib/chatbotAI";
import type { ChatbotSnapshot } from "@/modules/overhaul/lib/chatbotSnapshot";
import ChatbotFloatingButton from "./ChatbotFloatingButton";
import ChatbotWindow from "./ChatbotWindow";
import "./ddasomi.css";

export interface DdasomiMessage extends DdasomiReply {
  role: "user" | "assistant";
}

const WELCOME: DdasomiMessage = {
  role: "assistant",
  kind: "answer",
  text: "안녕하세요! 따소미예요 👋\n\n오버홀 공정 현황이 궁금하신가요?\n\n전체 공정률, 분야별 진행 상황,\n지연 작업 등을 물어보세요.",
};

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

// 앱 어디서든 보이는 플로팅 챗봇(루트 레이아웃에서 렌더링). 원본(PlantSync Pro)은 브라우저 스토어에서
// 동기로 snapshot을 읽었지만(useStore), 이 저장소는 데이터가 Postgres에 있으므로
// 열릴 때·질문마다 /api/overhaul/chatbot/snapshot을 새로 불러와 항상 최신 데이터로 답한다.
export default function DdasomiChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DdasomiMessage[]>([WELCOME]);
  const [pending, setPending] = useState(false);
  const [snapshot, setSnapshot] = useState<ChatbotSnapshot | null>(null);

  useEffect(() => {
    fetchSnapshot().then(setSnapshot);
  }, []);

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    setMessages((prev) => [...prev, { role: "user", kind: "answer", text: q }]);
    setPending(true);
    // 질문마다 최신 데이터를 다시 읽는다. /api/overhaul/chatbot(GPT)에 질문 + 검증된 요약 데이터(snapshot)를
    // 보내 답을 받는다. 환경변수 미설정이면 항상 비활성 → 아래 로컬 규칙 기반 응답으로 조용히 대체된다.
    // 숫자는 언제나 기존 계산 함수(progress.ts/schedule.ts) 결과에서 나온다.
    const fresh = await fetchSnapshot();
    if (fresh) setSnapshot(fresh);
    const reply = await getDdasomiReply(q, fresh ?? snapshot ?? emptySnapshot(), askDdasomi);
    setPending(false);
    setMessages((prev) => [...prev, { role: "assistant", ...reply }]);
  }

  return (
    <>
      <ChatbotFloatingButton open={open} onToggle={() => setOpen((o) => !o)} />
      <ChatbotWindow open={open} onClose={() => setOpen(false)} messages={messages} pending={pending} onAsk={ask} snapshot={snapshot} />
    </>
  );
}

// snapshot API 자체가 실패했을 때(네트워크 오류 등)의 안전한 기본값 — "데이터 없음" 안내로 이어진다.
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
