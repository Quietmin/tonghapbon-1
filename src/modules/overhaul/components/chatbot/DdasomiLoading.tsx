"use client";

import { useEffect, useState } from "react";

// 로딩 중 표시 — 실제로는 "로컬 규칙 매칭 → (필요 시) 서버 분류/답변 호출"을 기다리는 것뿐이라,
// 수행하지 않는 작업(예: 특정 항목을 체크 중이라는 문구)을 단정적으로 표현하지 않고
// 항상 참인 문구("찾고 있어요") + 점 애니메이션만 사용한다.
//
// 원본: AI-Do-Sample/src/components/chatbot/DdasomiLoading.jsx (그대로)
export default function DdasomiLoading() {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <img src="/ddasomi-search.png" alt="" className="w-16 h-16 rounded-full object-cover ddasomi-search-anim" />
      <p className="text-sm text-on-surface-variant font-medium">공정 데이터를 찾고 있어요{".".repeat(dots)}</p>
    </div>
  );
}
