import { NextResponse } from "next/server";
import { countByStatus, createIssue, listIssues, type IssueFilter } from "@/modules/status/lib/repo";
import { isBranch } from "@/shared/lib/branches";

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
    const body = await req.json();
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    const equipmentName = str(body.equipmentName);
    const content = str(body.content);
    const department = str(body.department);
    const reporter = str(body.reporter);
    const branch = str(body.branch);

    if (!branch || !isBranch(branch)) return fail("지사를 선택해 주세요.");
    if (!equipmentName) return fail("설비명을 입력해 주세요.");
    if (!content) return fail("이슈 내용을 입력해 주세요.");
    if (!department) return fail("담당부서를 선택해 주세요.");
    if (!reporter) return fail("작성자를 입력해 주세요.");
    const { id } = await createIssue({ branch, equipmentName, content, department, reporter });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
