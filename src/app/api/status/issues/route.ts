import { NextResponse, after } from "next/server";
import {
  addIssuePhotos,
  countByStatus,
  createIssue,
  getIssue,
  listIssues,
  type IssueFilter,
} from "@/modules/status/lib/repo";
import { parseIssueBody } from "@/modules/status/lib/issueInput";
import { notifyIssueCreated } from "@/shared/lib/push";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

/**
 * GET ?branch=&status=&department=&q=
 * 목록과 상태별 건수. 건수는 status 조건을 뺀 나머지 필터만 적용한다.
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const filter: IssueFilter = {
      branch: sp.get("branch") || undefined,
      status: sp.get("status") || undefined,
      department: sp.get("department") || undefined,
      q: sp.get("q") || undefined,
    };
    const [rows, counts] = await Promise.all([listIssues(filter), countByStatus(filter)]);
    return NextResponse.json({ ok: true, rows, counts });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

/** POST — 운영 근무자의 현황 등록. 상태는 항상 '미완료'로 시작한다 */
export async function POST(req: Request) {
  try {
    const parsed = parseIssueBody(await req.json());
    if ("error" in parsed) return fail(parsed.error);
    const { input, photos } = parsed;

    const { id } = await createIssue(input);

    // 사진은 이슈를 저장한 뒤에 붙인다 — 사진만 실패해도(예: 배포 DB 에 사진 테이블이 아직 없음) 이슈는 남고,
    // 화면에 "사진은 저장하지 못했다"고 알린다.
    let photosSaved = 0;
    let photoWarning: string | undefined;
    if (photos.length > 0) {
      try {
        photosSaved = await addIssuePhotos(id, photos);
      } catch (e) {
        console.error("[api/status/issues] 사진 저장 실패:", e instanceof Error ? e.message : e);
        photoWarning = "현황은 등록됐지만 사진은 저장하지 못했습니다. 관리자에게 알려 주세요.";
      }
    }
    // 담당부서 기기들로 푸시 — 응답을 먼저 보내고(after) 뒤에서 발송한다.
    // 발송 실패는 notifyIssueCreated 가 삼키므로 등록 자체에는 영향이 없다.
    after(async () => {
      const row = await getIssue(id).catch(() => null);
      if (row) await notifyIssueCreated(row);
    });

    return NextResponse.json({ ok: true, id, photosSaved, photoWarning }, { status: 201 });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
