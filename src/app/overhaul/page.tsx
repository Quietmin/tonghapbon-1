import { redirect } from "next/navigation";

/** 옛 주소 — 대시보드는 보고서와 함께 /overhaul/dashboard 로 합쳤다 */
export default function OverhaulIndexRedirect() {
  redirect("/overhaul/dashboard");
}
