import { ButtonLink, Icon, ScreenHeader } from "@/shared/components/ui";
import BulkUploadQueue from "@/modules/failure/components/BulkUploadQueue";

export const metadata = { title: "일괄 업로드 — 유지보수 마스터" };

/**
 * 일괄 업로드 — 과거 "고장상보" PDF 여러 개를 큐로 올려 한 건씩 확인하고 등록한다.
 * 제목 줄은 수기 등록과 같은 모양이다(아이콘 칩 + 제목 + 오른쪽 이동 버튼).
 */
export default function FailureBulkUploadPage() {
  return (
    <>
      <ScreenHeader
        icon="upload_file"
        title="일괄 업로드"
        desc={'과거 "고장상보" PDF를 여러 개 올려 한 건씩 확인하고 등록합니다.'}
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

      <BulkUploadQueue />
    </>
  );
}
