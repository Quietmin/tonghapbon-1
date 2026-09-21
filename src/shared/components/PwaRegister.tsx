"use client";

import { useEffect } from "react";

/**
 * 서비스 워커 등록 — 홈화면에 설치해 앱처럼 쓰기 위한 최소 준비.
 *
 * 개발 중에는 등록하지 않는다. next dev 의 HMR 응답까지 캐시에 얹히면 고친
 * 화면이 안 바뀌어 원인 찾기가 어려워진다. 이미 등록된 워커가 있으면 풀어 준다
 * (프로덕션을 돌려 본 브라우저로 개발할 때 남아 있을 수 있다).
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => void r.unregister()))
        .catch(() => {});
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패는 설치형으로 못 쓸 뿐, 웹으로는 그대로 동작한다 */
    });
  }, []);

  return null;
}
