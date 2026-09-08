import FaultReportEditor from "@/modules/docgen/components/FaultReportEditor";

export const metadata = { title: "고장보고서 작성 — 유지보수 마스터" };

/**
 * 고장보고서 작성 — 원래 /docgen/fault-report 였던 화면 그대로.
 * 편집기 본체는 modules/docgen 에 있고 여기는 경로만 준다.
 */
export default function FailureNewPage() {
  return <FaultReportEditor />;
}
