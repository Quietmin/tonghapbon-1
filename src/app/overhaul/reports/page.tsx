import { redirect } from "next/navigation";

/** 옛 주소 — 보고서는 대시보드의 하위 탭(/overhaul/dashboard/reports)으로 합쳤다 */
export default function OverhaulReportsRedirect() {
  redirect("/overhaul/dashboard/reports");
}
