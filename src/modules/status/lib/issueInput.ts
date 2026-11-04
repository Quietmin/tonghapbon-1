import { isBranch } from "@/shared/lib/branches";
import { MAX_ISSUE_PHOTOS } from "./constants";
import type { IssueInput } from "./repo";

/**
 * 현황 작성·수정 요청 본문 검사 — 등록(POST /api/status/issues)과 수정(PUT /api/status/issues/[id])이
 * 같은 규칙을 쓰도록 한 곳에 둔다.
 */

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

/** 본문 → 저장할 값. 빠진 칸이나 잘못된 사진이 있으면 화면에 보여 줄 문구를 error 로 돌려준다 */
export function parseIssueBody(
  body: Record<string, unknown>,
): { input: IssueInput; photos: string[] } | { error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const equipmentName = str(body.equipmentName);
  const content = str(body.content);
  const department = str(body.department);
  const reporter = str(body.reporter);
  const branch = str(body.branch);

  if (!branch || !isBranch(branch)) return { error: "지사를 선택해 주세요." };
  if (!equipmentName) return { error: "설비명을 입력해 주세요." };
  if (!content) return { error: "이슈 내용을 입력해 주세요." };
  if (!department) return { error: "담당부서를 선택해 주세요." };
  if (!reporter) return { error: "작성자를 입력해 주세요." };
  const photos = parsePhotos(body.photos);
  if (photos === null) return { error: "사진 형식이나 크기가 올바르지 않습니다. 사진을 다시 골라 주세요." };

  return { input: { branch, equipmentName, content, department, reporter }, photos };
}
