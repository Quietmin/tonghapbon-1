import { redirect } from "next/navigation";

/**
 * 매뉴얼 작성은 매뉴얼관리 챕터로 옮겼다.
 * 이 경로는 지우지 않고 새 경로로 넘긴다 — 북마크와 기존 링크가 깨지지 않게.
 */
export default function DocgenManualRedirect() {
  redirect("/manual/new");
}
