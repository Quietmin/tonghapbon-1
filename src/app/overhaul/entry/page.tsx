import { redirect } from "next/navigation";

/** 옛 주소 — 실적 입력은 작업·공정 목록에서 작업을 누르면 뜨는 팝업으로 합쳤다 */
export default function OverhaulEntryRedirect() {
  redirect("/overhaul/tasks");
}
