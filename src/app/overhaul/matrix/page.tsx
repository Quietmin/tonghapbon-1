import { redirect } from "next/navigation";

/** 옛 주소 — 전체 현황은 중장기보수계획의 하위 탭(/overhaul/plan/matrix)으로 합쳤다 */
export default function OverhaulMatrixRedirect() {
  redirect("/overhaul/plan/matrix");
}
