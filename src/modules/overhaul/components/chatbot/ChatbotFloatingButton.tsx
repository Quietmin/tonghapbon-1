// 우측 하단 플로팅 버튼 — 따소미 캐릭터를 클릭하면 챗봇 창이 열린다.
// 챗봇이 열려 있을 때는 창과 겹치지 않도록 페이드 아웃한다.
//
// 원본: AI-Do-Sample/src/components/chatbot/ChatbotFloatingButton.jsx (그대로)
export default function ChatbotFloatingButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "따소미 공정 챗봇 닫기" : "따소미 공정 챗봇 열기"}
      aria-expanded={open}
      className={`fixed z-[70] right-4 bottom-20 md:right-6 md:bottom-6 flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full glass-card no-lift transition-opacity duration-200 ${
        open ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <span className="ddasomi-face-crop w-11 h-11 shrink-0">
        <img src="/ddasomi-default.png" alt="" className="ddasomi-face-crop__img ddasomi-idle-anim" />
      </span>
      <span className="text-sm font-bold text-on-surface hidden sm:inline">따소미에게 물어보기</span>
    </button>
  );
}
