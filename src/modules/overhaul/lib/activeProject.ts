import { cookies } from "next/headers";
import { getOrCreateProject, getProject, type OverhaulProject } from "./repo";

/**
 * "지금 보고 있는 오버홀 회차"를 정하는 곳.
 *
 * 회차는 여러 개다(2026년 1호기, 2027년 1호기 …). 화면마다 projectId를 들고
 * 다니게 하면 모든 fetch에 인자가 하나씩 붙고 빠뜨리기 쉬우므로, 선택한 회차를
 * 쿠키에 담아 서버가 읽는다. 쿠키가 없거나 그 회차가 지워졌으면 가장 최근 회차로
 * 조용히 되돌아간다 — 화면이 빈 채로 멈추는 것보다 낫다.
 *
 * 쿼리스트링(?projectId=)이 오면 쿠키보다 우선한다. 특정 회차를 링크로 공유하거나
 * 두 회차를 나란히 비교할 때 쓴다.
 *
 * 서버 전용이다 (next/headers).
 */

export const PROJECT_COOKIE = "oh_project";

/** 쿠키 유지 기간 — 회차는 몇 달씩 이어지므로 넉넉하게 1년 */
export const PROJECT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function resolveProject(explicitId?: string | null): Promise<OverhaulProject> {
  if (explicitId) {
    const byQuery = await getProject(explicitId);
    if (byQuery) return byQuery;
  }

  const cookieId = (await cookies()).get(PROJECT_COOKIE)?.value;
  if (cookieId) {
    const byCookie = await getProject(cookieId);
    if (byCookie) return byCookie;
  }

  // 지정된 회차가 없거나 이미 지워졌다 → 가장 최근 회차 (없으면 기본 회차를 만든다)
  return getOrCreateProject();
}

/** Request에서 ?projectId= 를 읽어 회차를 정한다 — API Route용 단축 */
export async function resolveProjectFromRequest(req: Request): Promise<OverhaulProject> {
  return resolveProject(new URL(req.url).searchParams.get("projectId"));
}
