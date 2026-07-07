// 공정표 자동 생성 (PRD 8장) — 작업명 키워드 → 오버홀 기간 내 계획일정 자동 배치
import { taskProgress } from './progress'

// 로컬 날짜 파싱 (타임존 영향 없이)
export function toDate(s) {
  if (s instanceof Date) return s
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
export function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
export function diffDays(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000)
}

// 작업 유형별 배치 구간 (전체 기간 대비 시작~종료 비율) — PRD 8.3
const PHASES = [
  { key: '준비', label: '준비·가설·반입', re: /(준비|가설|반입|설치|양생|가설재)/, span: [0.0, 0.2] },
  { key: '분해', label: '분해·개방', re: /(분해|개방|해체|탈거|인출|철거)/, span: [0.05, 0.32] },
  { key: '점검', label: '점검·세정·청소', re: /(점검|세정|청소|세관|세척|점검\/세정)/, span: [0.15, 0.5] },
  { key: '검사', label: '검사·측정·진단', re: /(검사|측정|진단|시료|채취|교정|정정|시험성적|비파괴|ndt|pt|mt|ut)/i, span: [0.35, 0.62] },
  { key: '정비', label: '교체·정비', re: /(교체|정비|보수|용접|가공|수리|재생|오버홀|overhaul)/i, span: [0.4, 0.72] },
  { key: '조립', label: '조립·복구', re: /(조립|복구|재조립|보온|결선|복원|원복)/, span: [0.6, 0.85] },
  { key: '시험', label: '시험·시운전·확인', re: /(시험|시운전|확인|기동|성능|점화|통전|loop|루프)/i, span: [0.8, 1.0] },
]
const PARALLEL = { key: '병행', label: '전기·제어 병행', span: [0.1, 0.9] }
const DEFAULT_PHASE = { key: '기타', label: '일반 공정', span: [0.2, 0.85] }

export function phaseFor(task) {
  const text = `${task.name || ''} ${task.spec || ''}`
  for (const ph of PHASES) {
    if (ph.re.test(text)) {
      // 전기·제어의 단순 점검류는 전체 병행으로 넓게 배치
      if (ph.key === '점검' && (task.field === '전기' || task.field === '제어')) return PARALLEL
      return ph
    }
  }
  if (task.field === '전기' || task.field === '제어') return PARALLEL
  return DEFAULT_PHASE
}

// 단일 작업의 계획일정 산출
export function taskSchedule(task, project) {
  const start = toDate(project.startDate)
  const total = Math.max(1, diffDays(project.startDate, project.endDate))
  const ph = phaseFor(task)
  const startOff = Math.round(ph.span[0] * total)
  const endOff = Math.max(startOff + 1, Math.min(total, Math.round(ph.span[1] * total)))
  const plannedStart = addDays(start, startOff)
  const plannedEnd = addDays(start, endOff)
  return {
    phase: ph,
    startOff,
    endOff,
    total,
    plannedStart,
    plannedEnd,
    plannedStartStr: ymd(plannedStart),
    plannedEndStr: ymd(plannedEnd),
  }
}

// 특정 일자 기준 계획 진척률(%) — 계획 구간 내 선형 램프
export function plannedProgressOn(sch, dateStr) {
  const d = toDate(dateStr)
  if (d <= sch.plannedStart) return 0
  if (d >= sch.plannedEnd) return 100
  const span = diffDays(sch.plannedStart, sch.plannedEnd)
  return Math.round((diffDays(sch.plannedStart, d) / span) * 1000) / 10
}

// 계획 대비 지연 여부 (미완료 & 실적이 계획보다 임계치 이상 뒤처짐)
export function isBehind(task, project, dateStr, threshold = 15) {
  const p = taskProgress(task)
  if (p >= 100) return false
  const sch = taskSchedule(task, project)
  return plannedProgressOn(sch, dateStr) - p >= threshold
}

// 물량 가중 계획 공정률 (PRD 8.4) — 계획일정 기준
export function plannedOverall(tasks, project, dateStr) {
  let plan = 0
  let expect = 0
  for (const t of tasks) {
    const q = Number(t.planQty) || 0
    plan += q
    expect += (q * plannedProgressOn(taskSchedule(t, project), dateStr)) / 100
  }
  if (plan <= 0) return 0
  return Math.round((expect / plan) * 1000) / 10
}

// 예상 준공일 (현재 진행 속도 기준 단순 선형 추정) — 경영진 보고용
export function projectedFinish(overall, project) {
  const elapsed = Math.max(1, diffDays(project.startDate, project.today))
  if (overall <= 0) return { date: null, deltaDays: null }
  const pace = overall / elapsed // %/일
  const remainingDays = Math.ceil((100 - overall) / pace)
  const finish = addDays(toDate(project.today), remainingDays)
  const deltaDays = diffDays(project.endDate, finish) // +면 지연, -면 선행
  return { date: ymd(finish), deltaDays }
}
