import ArchiveBrowser from "@/modules/docgen/components/ArchiveBrowser";

export const metadata = { title: "고장보고서 조회 — 유지보수 마스터" };

/**
 * 고장보고서 조회 — 문서보관함 화면을 고장 보고서 종류로 고정해 보여 준다.
 * 검색 조건과 표 서식은 보관함 원본과 동일하다 (ArchiveBrowser 한 벌을 공유).
 */
export default function FailureArchivePage() {
  return (
    <ArchiveBrowser
      fixedType="fault"
      heading={{
        title: "고장보고서 조회",
        desc: "출력한 고장 보고서 PDF가 자동 저장됩니다. 지사·연도·키워드(파일명·고장내용·설비명)로 찾아보세요.",
      }}
    />
  );
}
