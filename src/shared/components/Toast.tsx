"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

/**
 * 짧은 알림("저장했습니다") — 창이 닫히거나 화면이 다시 그려져도 사라지지 않도록 Shell 에서
 * 전체를 감싼다. 몇 초 뒤 저절로 사라지고, 스크린리더에는 role="status" 로 읽힌다.
 * 폰에서는 하단 탭 위에, PC 에서는 아래쪽 가운데에 뜬다.
 */
type Show = (message: string) => void;

const ToastContext = createContext<Show>(() => {});

export function useToast(): Show {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<Show>((text) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 md:bottom-8 z-[600] flex justify-center px-4 print:hidden"
      >
        {message && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-on-surface text-surface px-5 py-3 text-sm font-bold shadow-lg">
            <Icon name="check_circle" className="text-lg text-status-success" />
            {message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
