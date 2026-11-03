import { redirect } from "next/navigation";

/**
 * 챗봇은 전용 화면이 아니라 모든 화면 우하단에 떠 있는 도크다
 * (shared/components/ChatbotDock.tsx — GPT tool-calling + 문서 RAG 검색).
 * 옛 주소로 들어와도 길을 잃지 않게 홈으로 보낸다 — 도크는 홈에도 떠 있다.
 */
export default function ChatbotPage() {
  redirect("/");
}
