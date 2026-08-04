import DocEditor from "@/modules/docgen/components/DocEditor";

export const metadata = { title: "사진대장 만들기 — Plant Ops Hub" };

/**
 * 사진대장 — 현장 사진과 설명을 정리하는 보고서.
 * 머리말 없이 파일명만 받는다(원본과 동일). 순번 배지도 붙이지 않는다.
 */
export default function PhotoReportPage() {
  return <DocEditor mode="report" />;
}
