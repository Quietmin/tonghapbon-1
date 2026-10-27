import { redirect } from "next/navigation";

/**
 * 고장보고서 조회는 챕터 첫 화면(/failure)이 되었다.
 * 같은 화면이 두 주소를 갖지 않도록 여기서는 넘기기만 한다 — 이미 공유했거나
 * 즐겨찾기한 링크가 끊기지 않게 경로 자체는 남겨 둔다.
 */
export default function FailureArchiveRedirect() {
  redirect("/failure");
}
