// 대화 메시지 한 줄 — 사용자는 오른쪽, 따소미는 왼쪽 + 아바타 + 이름
//
// 원본: AI-Do-Sample/src/components/chatbot/ChatMessage.jsx (그대로)
import type { DdasomiMessage } from "./DdasomiChatbot";

export default function ChatMessage({ message, onPick }: { message: DdasomiMessage; onPick: (text: string) => void }) {
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
      <img src="/ddasomi-default.png" alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
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
