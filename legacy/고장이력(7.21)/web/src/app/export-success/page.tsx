import Link from "next/link";
import Header from "@/components/Header";

export default function ExportSuccessPage() {
  return (
    <div>
      <Header title="엑셀 내보내기 결과" />
      <main className="p-container-padding max-w-[1200px] mx-auto">
        <div className="bg-white border border-border-subtle rounded-lg p-stack-lg shadow-sm flex flex-col items-center text-center py-12 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-primary/5 blur-3xl"></div>
          <div className="relative z-10 w-24 h-24 bg-status-success/10 rounded-full flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-[48px] text-status-success" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
          </div>
          <h2 className="text-display-lg font-display-lg text-primary mb-2">엑셀 파일이 생성되었습니다</h2>
          <p className="text-secondary font-body-md mb-10 max-w-lg">데이터 추출이 성공적으로 완료되었습니다.</p>
          <div className="bg-surface-container-low border border-border-subtle rounded-xl p-6 mb-10 w-full max-w-md text-left">
            <div className="flex justify-between border-b border-outline-variant/30 pb-4 mb-4">
              <div>
                <p className="text-label-caps text-secondary uppercase">파일명</p>
                <p className="font-bold font-data-mono text-primary">고장이력_추출_20240115.xlsx</p>
              </div>
              <div className="text-right">
                <p className="text-label-caps text-secondary uppercase">크기</p>
                <p className="font-bold text-primary">1.24 MB</p>
              </div>
            </div>
            <div className="flex justify-between">
              <div>
                <p className="text-label-caps text-secondary uppercase">생성 일시</p>
                <p className="text-primary">2024-01-15 14:30:05</p>
              </div>
              <div className="text-right">
                <p className="text-label-caps text-secondary uppercase">형식</p>
                <p className="text-primary">Excel Spreadsheet</p>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button className="px-10 py-4 bg-primary text-on-primary rounded-lg font-bold text-title-sm hover:bg-primary-container shadow-md flex items-center gap-3">
              <span className="material-symbols-outlined">download</span>다운로드
            </button>
            <Link href="/history" className="px-8 py-4 border border-outline text-primary rounded-lg font-bold">
              기록 보기
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
