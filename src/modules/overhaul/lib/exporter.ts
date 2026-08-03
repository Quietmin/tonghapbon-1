// 전체 작업 및 실적 현황 엑셀 다운로드 (PRD 5장 다운로드 기능)
//
// 원본: legacy/plantsync/src/lib/exporter.js
// 원본은 tasks 배열을 직접 계산해 내보냈지만, 여기서는 서버(/api/overhaul/report)가
// 이미 계산해 내려준 값(exportRows·report 요약)을 그대로 시트에 옮기기만 한다.
// 브라우저에서만 실행된다 (XLSX.writeFile이 다운로드를 트리거).
import * as XLSX from "xlsx";

export interface ExportTaskRow {
  id: string;
  field: string | null;
  equipment: string | null;
  name: string;
  spec: string | null;
  tag: string | null;
  planQty: number;
  doneQty: number;
  unit: string | null;
  progress: number;
  status: string;
  assignee: string | null;
  sheetName: string | null;
  rowIndex: number | null;
}

export interface ExportProject {
  name: string;
  plant: string | null;
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface ExportMetrics {
  overall: number;
  byField: Record<string, number>;
  riskCount: number;
  missingCount: number;
}

export function exportTasksToExcel(
  tasks: ExportTaskRow[],
  project: ExportProject,
  metrics: ExportMetrics,
): void {
  const wb = XLSX.utils.book_new();

  // 시트1: 작업 현황
  const rows = tasks.map((t) => ({
    작업ID: t.id,
    분야: t.field,
    설비: t.equipment,
    작업명: t.name,
    규격: t.spec,
    "Tag No.": t.tag,
    계획수량: t.planQty,
    완료수량: t.doneQty,
    단위: t.unit,
    "공정률(%)": t.progress,
    상태: t.status,
    담당자: t.assignee || "",
    원본시트: t.sheetName,
    원본행: t.rowIndex,
  }));
  const ws1 = XLSX.utils.json_to_sheet(rows);
  ws1["!cols"] = [
    { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 20 }, { wch: 14 },
    { wch: 9 }, { wch: 9 }, { wch: 6 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "작업현황");

  // 시트2: 요약
  const today = new Date().toISOString().slice(0, 10);
  const summary = [
    ["프로젝트", project.name],
    ["호기", project.unit ?? ""],
    ["기간", `${project.start_date ?? "미설정"} ~ ${project.end_date ?? "미설정"}`],
    ["기준일", today],
    [],
    ["전체 공정률(%)", metrics.overall],
    ["기계(%)", metrics.byField["기계"] ?? ""],
    ["전기(%)", metrics.byField["전기"] ?? ""],
    ["제어(%)", metrics.byField["제어"] ?? ""],
    ["지연 위험 공정(건)", metrics.riskCount],
    ["오늘 미입력(건)", metrics.missingCount],
    ["전체 작업(건)", tasks.length],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  ws2["!cols"] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, "요약");

  const stamp = today.replace(/-/g, "");
  XLSX.writeFile(wb, `공정현황_${project.unit || "오버홀"}_${stamp}.xlsx`);
}
