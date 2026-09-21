// 대화 메시지 한 줄 — 사용자는 오른쪽, 따소미는 왼쪽 + 아바타 + 이름
//
// 원본: AI-Do-Sample/src/components/chatbot/ChatMessage.jsx — 아바타를 돋보기 든
// ddasomi-search.png로 바꾸고, 최신 assistant 메시지에만 "좌우를 살펴보는" 애니메이션을 준다.
import type { DdasomiMessage } from "./DdasomiChatbot";

export default function ChatMessage({
  message,
  onPick,
  isLatest = false,
}: {
  message: DdasomiMessage;
  onPick: (text: string) => void;
  /** 최신 assistant 메시지일 때만 true — 이전 메시지 아바타는 정지 상태로 둔다 */
  isLatest?: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary text-on-primary text-sm leading-relaxed whitespace-pre-wrap">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <span className="ddasomi-msg-avatar w-11 h-11 shrink-0 mt-0.5">
        <img
          src="/ddasomi-search.png"
          alt=""
          className={`ddasomi-msg-avatar__img ${isLatest ? "ddasomi-lookaround-anim" : ""}`}
        />
      </span>
      <div className="flex flex-col gap-1 max-w-[80%] min-w-0">
        <span className="text-xs font-bold text-primary">따소미</span>
        <div
          className={`px-4 py-2.5 rounded-2xl rounded-bl-md text-sm leading-relaxed whitespace-pre-wrap ${
            message.kind === "refused" ? "bg-error-container text-on-error-container" : "bg-surface-container-high text-on-surface"
          }`}
        >
          {message.text}
        </div>
        {Array.isArray(message.suggestions) && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
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
}
