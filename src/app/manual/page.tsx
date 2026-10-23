import ArchiveBrowser from "@/modules/docgen/components/ArchiveBrowser";
import { ButtonLink, Icon } from "@/shared/components/ui";

export const metadata = { title: "매뉴얼관리 — 유지보수 마스터" };

/**
 * 매뉴얼관리 챕터 첫 화면 = 매뉴얼 조회. (고장관리와 같은 꼴)
 * 작성으로는 제목 줄의 버튼으로 간다 — 자세한 이유는 /failure 쪽 주석 참고.
 */
export default function ManualHomePage() {
  return (
    <ArchiveBrowser
      fixedType="manual"
      heading={{
        title: "매뉴얼 조회",
        desc: "출력한 매뉴얼 PDF가 자동 저장됩니다. 지사·분야·매뉴얼 종류·작성자·파일명으로 찾아보세요.",
        // 모바일은 타이틀만 — 빈 배열이면 ScreenHeader가 desc·bullets 모두 생략한다
        bullets: [],
      }}
      headingAction={
        <ButtonLink href="/manual/new">
          <Icon name="edit_note" className="text-lg" />
          매뉴얼 작성
        </ButtonLink>
      }
    />
  );
}
