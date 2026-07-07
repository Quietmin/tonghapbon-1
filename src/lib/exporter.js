import * as XLSX from 'xlsx'
import { taskProgress, taskStatus } from './progress'

// 전체 작업 및 실적 현황 엑셀 다운로드 (PRD 5장 다운로드 기능)
export function exportTasksToExcel(tasks, project, metrics) {
  const wb = XLSX.utils.book_new()

  // 시트1: 작업 현황
  const rows = tasks.map((t) => ({
    작업ID: t.id,
    분야: t.field,
    설비: t.equipment,
    작업명: t.name,
    규격: t.spec,
    'Tag No.': t.tag,
    계획수량: t.planQty,
    완료수량: t.doneQty,
    단위: t.unit,
    '공정률(%)': taskProgress(t),
    상태: taskStatus(t),
    담당자: t.assignee || '',
    원본시트: t.sheetName,
    원본행: t.sourceRow,
  }))
  const ws1 = XLSX.utils.json_to_sheet(rows)
  ws1['!cols'] = [
    { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 20 }, { wch: 14 },
    { wch: 9 }, { wch: 9 }, { wch: 6 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 8 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, '작업현황')

  // 시트2: 요약
  const summary = [
    ['프로젝트', project.name],
    ['호기', project.unit],
    ['기간', `${project.startDate} ~ ${project.endDate}`],
    ['기준일', project.today],
    [],
    ['전체 공정률(%)', metrics?.overall ?? ''],
    ['기계(%)', metrics?.byField?.기계 ?? ''],
    ['전기(%)', metrics?.byField?.전기 ?? ''],
    ['제어(%)', metrics?.byField?.제어 ?? ''],
    ['지연 위험 공정(건)', metrics?.risk?.length ?? ''],
    ['오늘 미입력(건)', metrics?.missing?.length ?? ''],
    ['전체 작업(건)', tasks.length],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(summary)
  ws2['!cols'] = [{ wch: 20 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, ws2, '요약')

  const stamp = project.today?.replace(/-/g, '') || 'export'
  XLSX.writeFile(wb, `공정현황_${project.unit || '오버홀'}_${stamp}.xlsx`)
}
