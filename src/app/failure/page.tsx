import ArchiveBrowser from "@/modules/docgen/components/ArchiveBrowser";
import { ButtonLink, Icon } from "@/shared/components/ui";

export const metadata = { title: "고장관리 — 유지보수 마스터" };

/**
 * 고장관리 챕터 첫 화면 = 고장이력 조회.
 *
 * 따로 랜딩을 두지 않는다 — 들어와서 가장 자주 하는 일이 "지난 이력 찾기"라
 * 한 번 더 누르게 할 이유가 없다. 작성으로는 제목 줄의 버튼(데스크톱)이나
 * 모바일 챕터 서브내비(ChapterSubNav)의 탭으로 간다.
 */
export default function FailureHomePage() {
  return (
    <ArchiveBrowser
      fixedType="fault"
      heading={{
        title: "고장이력 조회",
        desc: "출력한 고장이력 PDF가 자동 저장됩니다. 지사·분야·설비명·고장내용·작성자·파일명으로 찾아보세요.",
        // 모바일은 타이틀만 — 빈 배열이면 ScreenHeader가 desc·bullets 모두 생략한다
        bullets: [],
      }}
      headingAction={
        <ButtonLink href="/failure/new" variant="tertiary">
          <Icon name="edit_note" className="text-lg" />
          고장이력 작성
        </ButtonLink>
      }
    />
  );
}
