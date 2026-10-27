import { redirect } from "next/navigation";

/** 옛 주소 — 업로드 분석은 작업·공정의 '엑셀 등록' 탭으로 합쳤다 */
export default function OverhaulUploadRedirect() {
  redirect("/overhaul/tasks/upload");
}
