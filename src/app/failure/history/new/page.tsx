import { ButtonLink, Icon, ScreenHeader } from "@/shared/components/ui";
import FailureHistoryForm from "@/modules/failure/components/FailureHistoryForm";

export const metadata = { title: "수기 등록 — 유지보수 마스터" };

/**
 * 수기 등록 — 고장이력을 직접 입력해 등록한다(PDF를 올리면 항목을 뽑아 채워 준다).
 * 제목 줄은 고장보고서 조회·작성 화면과 같은 모양(아이콘 칩 + 제목 + 오른쪽 이동 버튼)이다.
 * 등록 화면이라 꽉 찬 칩이다.
 */
export default function FailureHistoryNewPage() {
  return (
    <>
      <ScreenHeader
        icon="note_add"
        title="수기 등록"
        desc="PDF 없이 발생일시·설비명·상황 등 항목을 직접 입력해 고장이력을 등록합니다."
        bullets={[]}
        accent="primary"
        tone="solid"
        action={
          <ButtonLink href="/failure" variant="primary">
            <Icon name="inventory_2" className="text-lg" />
            고장보고서 조회
          </ButtonLink>
        }
      />

      <FailureHistoryForm />
    </>
  );
}
