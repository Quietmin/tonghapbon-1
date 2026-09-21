"use client";

import { usePathname } from "next/navigation";
import ProjectBar from "@/modules/overhaul/components/ProjectBar";
import BranchGate from "@/modules/overhaul/components/BranchGate";

/**
 * 오버홀 화면 공통 껍데기.
 *
 * 맨 바깥은 지사 관문(BranchGate)이다 — 유지보수는 지사별로 독립 운영되므로
 * 지사를 먼저 고르기 전에는 어떤 오버홀 화면도 보여주지 않는다.
 *
 * 그 안에서, 공정관리 화면들은 모두 "어느 회차인지"에 매여 있으므로 회차 띠를
 * 위에 붙인다. 회차에 매이지 않는 화면(보수계획 = 계약 전, 회차 관리 자신,
 * 전체 현황 = 지사 설비 전체 이력)은 뺀다.
 */
const NO_PROJECT_BAR = ["/overhaul/plan", "/overhaul/project", "/overhaul/matrix"];

export default function OverhaulLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hide = NO_PROJECT_BAR.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <BranchGate>
      {!hide && <ProjectBar />}
      {children}
    </BranchGate>
  );
}
