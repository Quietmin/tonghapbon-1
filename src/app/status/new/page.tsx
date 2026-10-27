import { ButtonLink, Icon, ScreenHeader } from "@/shared/components/ui";
import StatusRegisterForm from "@/modules/status/components/StatusRegisterForm";

export const metadata = { title: "현황 등록 — 유지보수 마스터" };

/**
 * 현황 등록 — 운영 근무자가 이슈가 생긴 설비를 알리는 화면.
 * 등록하면 현황 조회에 '미완료'로 올라간다.
 */
export default function StatusNewPage() {
  return (
    <>
      <ScreenHeader
        icon="edit_note"
        title="현황 등록"
        desc="이슈가 생긴 설비와 내용을 적어 올리면 유지보수 담당자가 확인해 조치합니다."
        bullets={[]}
        accent="primary"
        // 꽉 찬 칩 = 등록. 조회 화면은 같은 색 연한 칩이다
        tone="solid"
        action={
          <ButtonLink href="/status" variant="tertiary">
            <Icon name="monitoring" className="text-lg" />
            현황 조회
          </ButtonLink>
        }
      />
      <StatusRegisterForm />
    </>
  );
}
