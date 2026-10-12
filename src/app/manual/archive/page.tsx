import { redirect } from "next/navigation";

/** 매뉴얼 조회는 챕터 첫 화면(/manual)이 되었다 — /failure/archive 와 같은 이유 */
export default function ManualArchiveRedirect() {
  redirect("/manual");
}
