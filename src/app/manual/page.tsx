import ChapterHome from "@/shared/components/ChapterHome";
import ArchiveBrowser from "@/modules/docgen/components/ArchiveBrowser";

export const metadata = { title: "매뉴얼관리 — 유지보수 마스터" };

/**
 * 매뉴얼관리 챕터 첫 화면 — 고장관리와 같은 골격(ChapterHome).
 * 작성/조회 화면 자체는 문서 자동생성(docgen) 모듈의 것을 그대로 쓴다.
 */
export default function ManualHomePage() {
  return (
    <ChapterHome
      title="매뉴얼관리"
      desc="현장 매뉴얼을 작성하고, 보관된 매뉴얼을 지사·연도·키워드로 찾아봅니다."
      actions={[
        {
          href: "/manual/new",
          icon: "edit_note",
          title: "매뉴얼 작성",
          desc: "사진마다 순번을 매겨 절차를 안내하는 A4 매뉴얼을 만들고 PDF로 출력합니다. 출력하면 보관함에 자동 저장됩니다.",
        },
        {
          href: "/manual/archive",
          icon: "inventory_2",
          title: "매뉴얼 조회",
          desc: "보관된 매뉴얼을 지사·연도·파일명으로 검색해 원본 PDF를 엽니다.",
        },
      ]}
    >
      {/* 조회 화면과 완전히 같은 표로 최근 5건만 미리 보여 준다 */}
      <ArchiveBrowser fixedType="manual" preview={5} moreHref="/manual/archive" />
    </ChapterHome>
  );
}
