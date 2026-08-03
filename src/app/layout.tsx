import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/shared/components/Sidebar";
import Header from "@/shared/components/Header";
import MobileNav from "@/shared/components/MobileNav";

export const metadata: Metadata = {
  title: "Plant Ops Hub — 공정·고장이력·정비문서 통합",
  description:
    "발전소 오버홀 공정관리, 열원설비 고장이력, 준공도서 검색 챗봇을 하나로 합친 통합 웹앱",
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
        <div className="flex min-h-screen overflow-x-hidden">
          <Sidebar />
          <main className="flex-1 md:ml-[280px] w-full min-h-screen flex flex-col pb-24 md:pb-12">
            <Header />
            <div className="p-gutter max-w-content mx-auto w-full space-y-gutter">{children}</div>
          </main>
          <MobileNav />
        </div>
      </body>
    </html>
  );
}
