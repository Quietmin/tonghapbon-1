import { cookies } from "next/headers";
import { resolveBranch } from "@/modules/overhaul/lib/activeBranch";
import { isDepartment, type Department } from "./departments";

/**
 * "지금 쓰는 사람" — 로그인이 없는 동안의 임시 대용이다.
 *
 * 업무망에서 로그인하면 본인 소속 지사·부서가 정해지겠지만, 그 전에는 처음 접속할 때
 * 고른 지사·부서(쿠키)를 쓴다. 화면과 API 는 쿠키를 직접 읽지 말고 이 함수만 부른다 —
 * 나중에 실제 로그인(세션)이 붙을 때 이 함수 안만 바꾸면 모든 화면이 그대로 따라온다.
 *
 * ⚠️ 쿠키라서 누구나 바꿀 수 있다. 보안 장치가 아니라 "내 지사·부서 기준으로 먼저 보여 주기"
 * 위한 편의 기능이다.
 *
 * 서버 전용이다 (next/headers).
 */

/** 내 부서 쿠키. 지사는 설비관리와 같은 oh_branch 쿠키를 그대로 쓴다 (activeBranch.ts) */
export const DEPT_COOKIE = "oh_dept";
export const DEPT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface CurrentUser {
  branch: string | null;
  department: Department | null;
}

/** 한글 쿠키 값은 percent-encoding 이 겹겹이 씌워져 올 수 있어 목록의 값이 나올 때까지 벗긴다 */
function normalizeDepartment(v: string | null | undefined): Department | null {
  if (!v) return null;
  let s = v;
  for (let i = 0; i < 3; i++) {
    if (isDepartment(s)) return s;
    try {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    } catch {
      break;
    }
  }
  return isDepartment(s) ? s : null;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const [branch, deptCookie] = await Promise.all([
    resolveBranch(),
    cookies().then((c) => c.get(DEPT_COOKIE)?.value),
  ]);
  return { branch, department: normalizeDepartment(deptCookie) };
}
