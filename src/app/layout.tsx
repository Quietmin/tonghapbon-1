import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/shared/components/Shell";
import { ChatbotDockProvider } from "@/shared/components/ChatbotDock";
import { SidebarProvider } from "@/shared/components/SidebarState";
import PwaRegister from "@/shared/components/PwaRegister";

export const metadata: Metadata = {
  title: "유지보수 마스터 — 설비·고장·매뉴얼 통합",
  description:
    "설비 마스터 위에서 고장 보고서와 현장 매뉴얼을 작성·조회하고, 정비 챗봇을 어느 화면에서나 함께 씁니다.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "유지보수 마스터" },
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
      <body>
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
