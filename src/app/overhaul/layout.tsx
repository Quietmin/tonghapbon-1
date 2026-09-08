"use client";

import { usePathname } from "next/navigation";
import ProjectBar from "@/modules/overhaul/components/ProjectBar";

/**
 * 오버홀 화면 공통 껍데기.
 *
 * 공정관리 화면들은 모두 "어느 회차인지"에 매여 있으므로 회차 띠를 위에 붙인다.
 * 회차에 매이지 않는 화면(보수계획 = 계약 전, 회차 관리 자신)은 뺀다.
 */
const NO_PROJECT_BAR = ["/overhaul/plan", "/overhaul/project"];

export default function OverhaulLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hide = NO_PROJECT_BAR.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      {!hide && <ProjectBar />}
      {children}
    </>
  );
}
