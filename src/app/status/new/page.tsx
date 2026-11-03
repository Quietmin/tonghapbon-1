import { ButtonLink, Icon, ScreenHeader } from "@/shared/components/ui";
import { getCurrentUser } from "@/shared/lib/currentUser";
import StatusRegisterForm from "@/modules/status/components/StatusRegisterForm";
import { getIssue, listIssuePhotoIds } from "@/modules/status/lib/repo";

export const metadata = { title: "현황 작성 — 유지보수 마스터" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 현황 작성 — 운영 근무자가 이슈가 생긴 설비를 알리는 화면.
 * 등록하면 현황 조회에 '미완료'로 올라간다. 지사·담당부서는 내 지사·부서로 미리 채워진다.
 *
 * 현황 조회의 [수정]으로 들어오면 주소에 ?edit=<현황 id> 가 붙는다(매뉴얼·고장보고서 조회의 [수정]과
 * 같은 방식). 그때는 저장된 내용·사진을 채운 같은 화면을 열고, 저장하면 그 현황을 고친다.
 */
export default async function StatusNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const editId = typeof sp.edit === "string" && UUID_RE.test(sp.edit) ? sp.edit : null;

  const user = await getCurrentUser();
  const [editRow, editPhotoIds] = editId
    ? await Promise.all([getIssue(editId), listIssuePhotoIds(editId)])
    : [null, []];
  const editing = Boolean(editId);

  return (
    <>
      <ScreenHeader
        icon="edit_note"
        title={editing ? "현황 수정" : "현황 작성"}
        desc={
          editing
            ? "저장된 현황의 내용과 사진을 고칩니다. 조치 상태·조치 내용은 그대로 남습니다."
            : "이슈가 생긴 설비와 내용을 적어 올리면 유지보수 담당자가 확인해 조치합니다."
        }
        bullets={[]}
        accent="primary"
        // 꽉 찬 칩 = 작성. 조회 화면은 같은 색 연한 칩이다
        tone="solid"
        action={
          <ButtonLink href="/status" variant="primary">
            <Icon name="monitoring" className="text-lg" />
            현황 조회
          </ButtonLink>
        }
      />
      {editing && !editRow ? (
        <p className="text-sm text-on-surface-variant">
          수정할 현황을 찾을 수 없습니다. 이미 삭제됐을 수 있습니다 — 현황 조회에서 다시 골라 주세요.
        </p>
      ) : (
        <StatusRegisterForm
          initialBranch={user.branch ?? ""}
          initialDepartment={user.department ?? ""}
          editing={editRow ? { row: editRow, photoIds: editPhotoIds } : undefined}
        />
      )}
    </>
  );
}
