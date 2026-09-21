import { cookies } from "next/headers";
import { isBranch } from "@/shared/lib/branches";

/**
 * "지금 보고 있는 지사"를 정하는 곳 — activeProject.ts와 같은 방식이다.
 *
 * 유지보수 업무는 지사별로 독립 운영되므로 회차·보수계획·수량산출서가 모두
 * 지사 하나에 매인다. 선택한 지사를 쿠키에 담아 서버가 읽고, 화면은
 * /api/overhaul/branch로 바꾼다. 지사가 아직 선택되지 않았으면 null을 돌려주고,
 * 화면 쪽 BranchGate가 선택 화면을 띄운다 (기본값을 깔지 않는다 — 기본값이
 * 있으면 다른 지사 사람이 남의 데이터에 실적을 쌓는다).
 *
 * 서버 전용이다 (next/headers).
 */

export const BRANCH_COOKIE = "oh_branch";

/** 쿠키 유지 기간 — 지사 소속은 사실상 바뀌지 않으므로 1년 */
export const BRANCH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * 쿠키 값은 한글이라 percent-encoding이 겹겹이 씌워져 올 수 있다
 * (우리가 한 번, 쿠키 직렬화가 한 번 더). 목록의 값이 나올 때까지 벗겨서 검증한다.
 */
function normalize(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v;
  for (let i = 0; i < 3; i++) {
    if (isBranch(s)) return s;
    try {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    } catch {
      break; // 깨진 인코딩 — 목록에 없는 값으로 취급
    }
  }
  return isBranch(s) ? s : null;
}

/** 선택된 지사. 없거나 목록에 없는 값이면 null */
export async function resolveBranch(explicit?: string | null): Promise<string | null> {
  const byQuery = normalize(explicit);
  if (byQuery) return byQuery;
  return normalize((await cookies()).get(BRANCH_COOKIE)?.value);
}

/** Request에서 ?branch= 를 읽어 지사를 정한다 — API Route용 단축 */
export async function resolveBranchFromRequest(req: Request): Promise<string | null> {
  return resolveBranch(new URL(req.url).searchParams.get("branch"));
}
