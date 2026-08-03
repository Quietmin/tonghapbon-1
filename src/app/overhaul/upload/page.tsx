import ModuleStub from "@/shared/components/ModuleStub";

export default function OverhaulUploadPage() {
  return (
    <ModuleStub
      title="업로드 분석"
      from="legacy/plantsync/src/pages/UploadAnalysis.jsx"
      note="엑셀 자동분석 엔진(excelParser)은 서버 API Route로 옮겨 Supabase에 작업항목을 적재하도록 바꿉니다."
    />
  );
}
