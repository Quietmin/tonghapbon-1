import ArchiveBrowser from "@/modules/docgen/components/ArchiveBrowser";

export const metadata = { title: "보관함 조회 — 유지보수 마스터" };

/**
 * 전체 보관함 조회 (사진대장·매뉴얼·고장 보고서 모두).
 * 메뉴에서는 감췄고 경로만 남긴다 — 종류별 조회는 고장관리/매뉴얼관리 챕터에 있다.
 * 화면 본체는 ArchiveBrowser 로 옮겨 세 화면이 같은 서식을 공유한다.
 */
export default function DocgenArchivePage() {
  return (
    <ArchiveBrowser
      heading={{
        title: "보관함 조회",
        desc: "출력한 PDF가 자동 저장됩니다. 로그인 없이 누구나 지사·연도·종류별로 지난 문서를 찾아볼 수 있습니다.",
      }}
    />
  );
}
