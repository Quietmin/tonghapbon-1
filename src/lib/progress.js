// 공정률 산정 (PRD 7장) — 물량 기준
export const FIELDS = ['기계', '전기', '제어']

// 작업별 공정률 = 실제 완료수량 / 계획수량 × 100
export function taskProgress(task) {
  const plan = Number(task.planQty) || 0
  const done = Number(task.doneQty) || 0
  if (plan <= 0) return 0
  return Math.min(100, Math.round((done / plan) * 1000) / 10)
}

// 물량 가중 공정률 (그룹): Σ완료 / Σ계획 × 100
export function weightedProgress(tasks) {
  let plan = 0
  let done = 0
  for (const t of tasks) {
    plan += Number(t.planQty) || 0
    done += Math.min(Number(t.doneQty) || 0, Number(t.planQty) || 0)
  }
  if (plan <= 0) return 0
  return Math.round((done / plan) * 1000) / 10
}

export function overallProgress(tasks) {
  return weightedProgress(tasks)
}

export function progressByField(tasks) {
  const out = {}
  for (const f of FIELDS) {
    out[f] = weightedProgress(tasks.filter((t) => t.field === f))
  }
  return out
}

export function progressByEquipment(tasks) {
  const groups = {}
  for (const t of tasks) {
    ;(groups[t.equipment] ||= []).push(t)
  }
  return Object.entries(groups).map(([equipment, list]) => ({
    equipment,
    field: list[0].field,
    count: list.length,
    progress: weightedProgress(list),
  }))
}

// 오버홀 기간 경과
export function scheduleInfo(project) {
  const start = new Date(project.startDate)
  const end = new Date(project.endDate)
  const today = project.today ? new Date(project.today) : new Date()
  const totalDays = Math.max(1, Math.round((end - start) / 86400000))
  const elapsed = Math.max(0, Math.min(totalDays, Math.round((today - start) / 86400000)))
  const expected = Math.round((elapsed / totalDays) * 1000) / 10 // 계획 공정률(선형)
  return { totalDays, elapsed, expected, start, end, today }
}

// 작업 상태
export function taskStatus(task) {
  const p = taskProgress(task)
  if (p >= 100) return '완료'
  if (p > 0) return '진행중'
  return '대기'
}

// 지연 위험 공정: 계획 대비 실적이 임계치 이상 뒤처진 미완료 작업
export function delayRiskTasks(tasks, expected, threshold = 15) {
  return tasks.filter((t) => {
    const p = taskProgress(t)
    return p < 100 && expected - p >= threshold
  })
}

// 오늘 실적 미입력 작업 (담당 지정된 미완료 작업 중 today 입력 없음)
export function missingEntries(tasks, todayStr) {
  return tasks.filter((t) => {
    if (taskProgress(t) >= 100) return false
    const entries = t.entries || []
    return !entries.some((e) => e.date === todayStr)
  })
}

export function fieldColor(field) {
  return { 기계: 'primary', 전기: 'status-success', 제어: 'status-error' }[field] || 'secondary'
}
