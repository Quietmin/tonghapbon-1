import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/shared/components/Sidebar";
import Header from "@/shared/components/Header";
import MobileNav from "@/shared/components/MobileNav";
import ChatbotDock, { ChatbotDockProvider } from "@/shared/components/ChatbotDock";
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
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
        {/*
          아이콘은 Material Symbols 합자(ligature)라 폰트가 오기 전에는 "expand_more"
          같은 이름이 글자로 그려진다. 폰트가 준비될 때까지 셸을 감추고 로고만 띄운다.
          클래스만 토글하므로 하이드레이션과 무관하다. 폰트를 못 받거나(2.5초)
          자바스크립트가 꺼져 있으면 그냥 연다 — 화면이 영영 안 뜨는 쪽이 더 나쁘다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement;d.classList.add('app-loading');" +
              "var done=function(){d.classList.remove('app-loading');d.classList.add('app-ready')};" +
              "var t=setTimeout(done,2500);var fin=function(){clearTimeout(t);done()};" +
              "try{var f=document.fonts;if(!f){fin();return}" +
              "var p=f.load?f.load('24px \"Material Symbols Outlined\"').catch(function(){}):Promise.resolve();" +
              "p.then(function(){return f.ready}).then(fin,fin)}catch(e){fin()}})();",
          }}
        />
      </head>
      <body>
        <div id="app-splash" aria-hidden="true">
          <span className="app-splash-spinner" />
        </div>
        {/* 챗봇 도크는 어느 화면에서나 떠 있어야 해서 레이아웃에 한 번만 마운트한다.
            헤더의 챗봇 버튼도 같은 상태를 만져야 하므로 Provider 가 셸 전체를 감싼다. */}
        <ChatbotDockProvider>
          <div className="flex min-h-screen overflow-x-hidden">
            <Sidebar />
            <main className="flex-1 md:ml-[280px] w-full min-h-screen flex flex-col pb-24 md:pb-12">
              <Header />
              <div className="p-gutter max-w-content mx-auto w-full space-y-gutter">{children}</div>
            </main>
            <MobileNav />
            <ChatbotDock />
          </div>
        </ChatbotDockProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
