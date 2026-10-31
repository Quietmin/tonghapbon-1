import { NextResponse } from "next/server";
import {
  addIssuePhotos,
  countByStatus,
  createIssue,
  listIssues,
  type IssueFilter,
} from "@/modules/status/lib/repo";
import { MAX_ISSUE_PHOTOS } from "@/modules/status/lib/constants";
import { isBranch } from "@/shared/lib/branches";

export const dynamic = "force-dynamic";

/** 사진 한 장·전체 상한(문자 수) — Vercel 함수는 요청 본문 4.5MB 까지라 그 안에 들어오게 막는다 */
const MAX_PHOTO_CHARS = 1_600_000;
const MAX_TOTAL_PHOTO_CHARS = 3_800_000;

/** 올라온 사진 목록에서 JPEG/PNG/WebP data URL 만 걸러 낸다(최대 MAX_ISSUE_PHOTOS 장). 잘못된 것이 있으면 null */
function parsePhotos(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  let total = 0;
  for (const p of v.slice(0, MAX_ISSUE_PHOTOS)) {
    if (typeof p !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(p) || p.length > MAX_PHOTO_CHARS) {
      return null;
    }
    total += p.length;
    out.push(p);
  }
  return total > MAX_TOTAL_PHOTO_CHARS ? null : out;
}

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
    const photos = parsePhotos(body.photos);
    if (photos === null) return fail("사진 형식이나 크기가 올바르지 않습니다. 사진을 다시 골라 주세요.");

    const { id } = await createIssue({ branch, equipmentName, content, department, reporter });

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
    return NextResponse.json({ ok: true, id, photosSaved, photoWarning }, { status: 201 });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
