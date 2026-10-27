import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/shared/components/Shell";
import { ChatbotDockProvider } from "@/shared/components/ChatbotDock";
import { SidebarProvider } from "@/shared/components/SidebarState";
import PwaRegister from "@/shared/components/PwaRegister";

export const metadata: Metadata = {
  title: "유지보수 마스터 — 설비·고장·매뉴얼 통합",
  description:
    "설비 마스터 위에서 고장이력과 현장 매뉴얼을 작성·조회하고, 정비 챗봇을 어느 화면에서나 함께 씁니다.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PIMS" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

/**
 * viewportFit: "cover" + globals.css 의 safe-area 패딩 — 아이폰 홈바에 하단탭이
 * 가리지 않게 한다. maximumScale 을 막지 않는 이유는 A4 미리보기를 손가락으로
 * 확대해 봐야 하기 때문이다.
 */
export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      {/*
        가로 스크롤 차단은 body 에 둔다 — Shell 안의 div 에 두면 position:sticky 가
        깨진다(가로 overflow 를 막으려고 overflow-x 를 non-visible 로 주면, 명세상
        overflow-y 도 auto 로 같이 승격돼 그 div 가 새 스크롤 컨테이너가 되고, 안의
        sticky 는 그 컨테이너 기준으로 계산된다 — 그런데 실제 스크롤은 창 전체에서
        일어나니 서로 어긋나 버린다. body/html 은 뷰포트 자체로 취급되는 특례라 이
        문제가 없다). A4 미리보기를 오른쪽에 고정해 둔 DocEditor 2열 레이아웃이 이
        자리를 쓴다.

        hidden 대신 clip 을 쓰는 이유: hidden 도 같은 "overflow-y 자동 auto 승격"
        규칙을 body 에서까지 적용받는다 — body 가 "뷰포트 특례"로 빠지는 건 실제
        페이지 스크롤이 일어나는 바로 그 박스(보통 html)에 한정되고, 이 프로젝트처럼
        body 에 직접 overflow-x 를 주면 그 특례를 못 받아 body 가 스스로 스크롤
        컨테이너가 돼 버린 적이 있었다(모바일 브라우저의 주소창 자동 숨김이 창
        스크롤을 기준으로 동작해서, body 가 스크롤을 떠안으면 하단 고정 탭이 첫
        진입에는 주소창에 가려 있다가 스크롤해야 올라오는 것처럼 보였다). clip 은
        overflow-y 승격 규칙 자체가 적용되지 않는 값이라 body 를 스크롤 컨테이너로
        만들지 않으면서 가로 넘침만 그대로 막는다.
      */}
      <body className="overflow-x-clip">
        {/* 챗봇 도크는 어느 화면에서나 떠 있어야 해서 레이아웃에 한 번만 마운트한다.
            헤더의 챗봇 버튼·사이드바 접기 버튼도 같은 상태를 만져야 하므로
            Provider 둘이 셸 전체를 감싼다. 실제 배치는 Shell 이 한다. */}
        <ChatbotDockProvider>
          <SidebarProvider>
            <Shell>{children}</Shell>
          </SidebarProvider>
        </ChatbotDockProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
