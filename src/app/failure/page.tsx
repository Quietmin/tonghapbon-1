import ChapterHome from "@/shared/components/ChapterHome";
import ArchiveBrowser from "@/modules/docgen/components/ArchiveBrowser";

export const metadata = { title: "고장관리 — 유지보수 마스터" };

/**
 * 고장관리 챕터 첫 화면.
 * 요구사항: 들어오면 "고장보고서 작성" 란과 "고장보고서 조회"가 함께 보인다.
 * 작성/조회 화면 자체는 문서 자동생성(docgen) 모듈의 것을 그대로 쓴다 — 서식이
 * 결재 문서라 배치만 바꾸고 내용은 손대지 않는다.
 */
export default function FailureHomePage() {
  return (
    <ChapterHome
      title="고장관리"
      desc="고장 보고서를 작성하고, 지난 보고서를 지사·연도·키워드로 찾아봅니다."
      actions={[
        {
          href: "/failure/new",
          icon: "edit_note",
          title: "고장보고서 작성",
          desc: "고장 요약 표와 현장 사진을 채워 A4 고장 보고서를 만들고 PDF로 출력합니다. 출력하면 보관함에 자동 저장됩니다.",
        },
        {
          href: "/failure/archive",
          icon: "inventory_2",
          title: "고장보고서 조회",
          desc: "보관된 고장 보고서를 지사·연도·파일명·고장내용·설비명으로 검색해 원본 PDF를 엽니다.",
        },
      ]}
    >
      {/* 조회 화면과 완전히 같은 표로 최근 5건만 미리 보여 준다 */}
      <ArchiveBrowser fixedType="fault" preview={5} moreHref="/failure/archive" />
    </ChapterHome>
  );
}
