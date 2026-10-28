"use client";

import { useEffect, useState } from "react";

// 로딩 중 표시 — 실제로는 "로컬 규칙 매칭 → (필요 시) 서버 분류/답변 호출"을 기다리는 것뿐이라,
// 수행하지 않는 작업(예: 특정 항목을 체크 중이라는 문구)을 단정적으로 표현하지 않고
// 항상 참인 문구("알아보고 있는 중이에요") + 점 애니메이션만 사용한다.
// 챗봇이 공정 데이터뿐 아니라 정비 지식·현장 점검 요령 등 여러 가지를 답하므로 "공정 데이터"로 한정하지 않는다.
// 폰트는 ddasomi.css의 .ddasomi-cute-text(Jua) — 따소미 캐릭터 톤에 맞춘 둥근 글씨.
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
      <p className="ddasomi-cute-text">따소미가 열심히 알아보고 있는 중이에요{".".repeat(dots)}</p>
    </div>
  );
}
