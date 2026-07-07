import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Icon, FieldChip, StatusChip, EmptyState } from '../components/ui'
import { useStore } from '../lib/store'
import { taskProgress } from '../lib/progress'
import { taskSchedule, plannedProgressOn, plannedOverall, diffDays, toDate, ymd, addDays } from '../lib/schedule'

const FIELD_BAR = { 기계: 'primary', 전기: 'status-success', 제어: 'status-info' }

// 기간 눈금 생성 (약 6~8개)
function makeTicks(total) {
  const step = Math.max(1, Math.ceil(total / 7))
  const ticks = []
  for (let d = 0; d <= total; d += step) ticks.push(d)
  if (ticks[ticks.length - 1] !== total) ticks.push(total)
  return { step, ticks }
}

export default function Schedule() {
  const { state } = useStore()
  const navigate = useNavigate()
  const { tasks, project } = state

  const [field, setField] = useState('전체')
  const [equipment, setEquipment] = useState('전체')
  const [onlyDelay, setOnlyDelay] = useState(false)
  const [collapsed, setCollapsed] = useState({})

  const total = Math.max(1, diffDays(project.startDate, project.endDate))
  const todayOff = Math.max(0, Math.min(total, diffDays(project.startDate, project.today)))
  const { ticks } = useMemo(() => makeTicks(total), [total])

  const equipmentOptions = useMemo(() => ['전체', ...new Set(tasks.map((t) => t.equipment))], [tasks])

  // 스케줄 계산 + 필터
  const rows = useMemo(() => {
    return tasks
      .filter((t) => (field === '전체' || t.field === field) && (equipment === '전체' || t.equipment === equipment))
      .map((t) => {
        const sch = taskSchedule(t, project)
        const actual = taskProgress(t)
        const planned = plannedProgressOn(sch, project.today)
        const behind = actual < 100 && planned - actual >= 15
        const status = actual >= 100 ? '완료' : behind ? '지연' : actual > 0 ? '진행중' : '대기'
        return { task: t, sch, actual, planned, behind, status }
      })
      .filter((r) => !onlyDelay || r.behind)
  }, [tasks, project, field, equipment, onlyDelay])

  // 설비별 그룹화
  const groups = useMemo(() => {
    const map = {}
    for (const r of rows) (map[r.task.equipment] ||= []).push(r)
    return Object.entries(map)
      .map(([equip, list]) => {
        const minOff = Math.min(...list.map((r) => r.sch.startOff))
        const maxOff = Math.max(...list.map((r) => r.sch.endOff))
        let plan = 0
        let done = 0
        for (const r of list) {
          plan += r.task.planQty
          done += Math.min(r.task.doneQty, r.task.planQty)
        }
        const progress = plan > 0 ? Math.round((done / plan) * 1000) / 10 : 0
        return { equip, field: list[0].task.field, list, minOff, maxOff, progress, behind: list.some((r) => r.behind) }
      })
      .sort((a, b) => a.minOff - b.minOff)
  }, [rows])

  const plannedPct = plannedOverall(tasks, project, project.today)
  const pos = (off) => `${(off / total) * 100}%`

  if (!tasks.length) {
    return (
      <Card lift={false}>
        <EmptyState
          icon="calendar_view_week"
          title="공정표를 생성할 작업이 없습니다"
          desc="먼저 설계내역서를 업로드하여 작업항목을 생성하세요."
          action={<Button onClick={() => navigate('/upload')}>업로드 분석으로</Button>}
        />
      </Card>
    )
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-display-lg text-on-surface font-bold">공정표</h3>
          <p className="text-on-surface-variant text-body-md">
            작업명 키워드 기준으로 자동 배치된 계획일정입니다. (오버홀 {project.startDate} ~ {project.endDate} · 총 {total}일)
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right">
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">오늘 계획공정률</p>
            <p className="text-2xl font-black text-primary leading-tight">{plannedPct}%</p>
          </div>
        </div>
      </div>

      {/* 필터 + 범례 */}
      <Card lift={false} className="p-card-padding">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex flex-wrap gap-3 flex-1">
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
            >
              {['전체', '기계', '전기', '제어'].map((f) => (
                <option key={f} value={f}>{f === '전체' ? '분야: 전체' : f}</option>
              ))}
            </select>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
            >
              {equipmentOptions.map((eq) => (
                <option key={eq} value={eq}>{eq === '전체' ? '설비: 전체' : eq}</option>
              ))}
            </select>
            <button
              onClick={() => setOnlyDelay((v) => !v)}
              className={`h-11 px-4 rounded-xl text-sm font-semibold border transition-colors flex items-center gap-2 ${
                onlyDelay ? 'bg-error/10 border-error/30 text-error' : 'bg-surface-container-low border-border-subtle text-on-surface-variant'
              }`}
            >
              <Icon name="warning" className="text-base" fill={onlyDelay} /> 지연 위험만
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-surface-container-highest" /> 계획</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-primary" /> 실적</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-status-error" /> 지연</span>
            <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-status-error" /> 오늘</span>
          </div>
        </div>
      </Card>

      {/* 간트차트 */}
      <Card lift={false} className="p-card-padding overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            {/* 타임라인 헤더 */}
            <div className="flex items-stretch border-b border-border-subtle pb-2 mb-2">
              <div className="w-[220px] shrink-0 text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-end">
                설비 / 작업
              </div>
              <div className="relative flex-1 h-8">
                {ticks.map((d) => (
                  <div key={d} className="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2" style={{ left: pos(d) }}>
                    <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{ymd(addDays(toDate(project.startDate), d)).slice(5)}</span>
                    <span className="text-[9px] text-on-surface-variant/60">D+{d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 그룹/작업 행 */}
            <div className="relative">
              {/* 오늘 기준선 (전체 높이) */}
              <div className="absolute top-0 bottom-0 w-px bg-status-error/70 z-10 pointer-events-none" style={{ left: `calc(220px + (100% - 220px) * ${todayOff / total})` }}>
                <span className="absolute -top-0.5 -translate-x-1/2 text-[9px] font-bold text-status-error bg-surface px-1 rounded">오늘</span>
              </div>

              {groups.map((g) => {
                const isOpen = !collapsed[g.equip]
                return (
                  <div key={g.equip}>
                    {/* 설비 요약 행 */}
                    <div
                      className="flex items-center py-2 cursor-pointer hover:bg-surface-container-low rounded-lg transition-colors"
                      onClick={() => setCollapsed((c) => ({ ...c, [g.equip]: isOpen }))}
                    >
                      <div className="w-[220px] shrink-0 pr-3 flex items-center gap-1.5">
                        <Icon name={isOpen ? 'expand_more' : 'chevron_right'} className="text-base text-on-surface-variant" />
                        <FieldChip field={g.field} />
                        <span className="font-mono-data text-sm font-bold text-on-surface truncate">{g.equip}</span>
                        <span className="text-xs text-on-surface-variant">({g.list.length})</span>
                      </div>
                      <div className="relative flex-1 h-6">
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full bg-surface-container-highest overflow-hidden"
                          style={{ left: pos(g.minOff), width: pos(Math.max(1, g.maxOff - g.minOff)) }}
                        >
                          <div
                            className={`h-full rounded-full ${g.behind ? 'bg-status-error' : 'bg-primary'}`}
                            style={{ width: `${g.progress}%` }}
                          />
                        </div>
                        <span
                          className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant"
                          style={{ left: `calc(${pos(g.maxOff)} + 6px)` }}
                        >
                          {g.progress}%
                        </span>
                      </div>
                    </div>

                    {/* 작업 상세 행 */}
                    {isOpen &&
                      g.list.map((r) => (
                        <div
                          key={r.task.id}
                          className="flex items-center py-1.5 group cursor-pointer"
                          onClick={() => navigate(`/entry?task=${r.task.id}`)}
                        >
                          <div className="w-[220px] shrink-0 pr-3 pl-7">
                            <p className="text-xs text-on-surface truncate group-hover:text-primary transition-colors">{r.task.name}</p>
                            <p className="text-[10px] text-on-surface-variant font-mono-data">
                              {r.sch.plannedStartStr.slice(5)} ~ {r.sch.plannedEndStr.slice(5)} · {r.sch.phase.label}
                            </p>
                          </div>
                          <div className="relative flex-1 h-5">
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full bg-surface-container overflow-hidden group-hover:ring-2 group-hover:ring-primary/20"
                              style={{ left: pos(r.sch.startOff), width: pos(Math.max(1, r.sch.endOff - r.sch.startOff)) }}
                              title={`계획 ${r.planned}% / 실적 ${r.actual}%`}
                            >
                              <div
                                className={`h-full rounded-full ${r.behind ? 'bg-status-error' : r.actual >= 100 ? 'bg-status-success' : `bg-${FIELD_BAR[r.task.field] || 'primary'}`}`}
                                style={{ width: `${r.actual}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* 요약 지표 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">계획 공정률</p>
          <p className="text-2xl font-black text-on-surface">{plannedPct}%</p>
          <p className="text-xs text-on-surface-variant mt-1">오늘({project.today}) 기준</p>
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">지연 위험 공정</p>
          <p className="text-2xl font-black text-error">{rows.filter((r) => r.behind).length}건</p>
          <p className="text-xs text-error mt-1">계획 대비 15%p+ 미달</p>
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">표시 설비</p>
          <p className="text-2xl font-black text-on-surface">{groups.length}개</p>
          <p className="text-xs text-on-surface-variant mt-1">작업 {rows.length}건</p>
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">경과 / 전체</p>
          <p className="text-2xl font-black text-on-surface">{todayOff} / {total}일</p>
          <p className="text-xs text-on-surface-variant mt-1">~ {project.endDate}</p>
        </Card>
      </div>
    </>
  )
}
