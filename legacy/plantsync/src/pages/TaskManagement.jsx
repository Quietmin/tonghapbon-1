import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Icon, StatusChip, FieldChip, Avatar, EmptyState, ProgressBar } from '../components/ui'
import { useStore } from '../lib/store'
import { taskProgress, scheduleInfo, overallProgress } from '../lib/progress'
import { scheduleDelayTasks } from '../lib/schedule'
import { exportTasksToExcel } from '../lib/exporter'

const PAGE_SIZE = 12

export default function TaskManagement() {
  const { state, can } = useStore()
  const navigate = useNavigate()
  const { tasks, project } = state

  const [q, setQ] = useState('')
  const [field, setField] = useState('전체')
  const [equipment, setEquipment] = useState('전체')
  const [page, setPage] = useState(1)

  const equipmentOptions = useMemo(() => ['전체', ...new Set(tasks.map((t) => t.equipment))], [tasks])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (field !== '전체' && t.field !== field) return false
      if (equipment !== '전체' && t.equipment !== equipment) return false
      if (kw) {
        const hay = `${t.name} ${t.spec} ${t.tag} ${t.equipment} ${t.id}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [tasks, q, field, equipment])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const curPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  const sched = scheduleInfo(project)
  const risk = scheduleDelayTasks(tasks, project, project.today)
  const completion = overallProgress(tasks)
  const personnel = new Set(tasks.map((t) => t.assignee).filter(Boolean)).size

  function resetPageAnd(fn) {
    return (v) => { setPage(1); fn(v) }
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-display-lg text-on-surface font-bold">작업 관리</h3>
          <p className="text-on-surface-variant text-body-md">{project.name} · 전체 {tasks.length.toLocaleString()}개 작업</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => exportTasksToExcel(tasks, project, { overall: completion, risk })}>
            <Icon name="download" className="text-base" /> 내보내기
          </Button>
          {can.edit && (
            <Button onClick={() => navigate('/upload')}>
              <Icon name="add" className="text-base" /> 작업 추가
            </Button>
          )}
        </div>
      </div>

      <Card lift={false} className="p-card-padding">
        {/* 필터 바 */}
        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          <div className="flex-1 flex items-center gap-2 bg-surface-container-low rounded-xl px-4 h-11 border border-transparent focus-within:border-primary focus-within:bg-surface-container-lowest transition-colors">
            <Icon name="search" className="text-on-surface-variant text-base" />
            <input
              value={q}
              onChange={(e) => resetPageAnd(setQ)(e.target.value)}
              placeholder="작업명, 규격, Tag No. 검색"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <select
            value={field}
            onChange={(e) => resetPageAnd(setField)(e.target.value)}
            className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
          >
            {['전체', '기계', '전기', '제어'].map((f) => (
              <option key={f} value={f}>{f === '전체' ? '분야: 전체' : f}</option>
            ))}
          </select>
          <select
            value={equipment}
            onChange={(e) => resetPageAnd(setEquipment)(e.target.value)}
            className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
          >
            {equipmentOptions.map((eq) => (
              <option key={eq} value={eq}>{eq === '전체' ? '설비: 전체' : eq}</option>
            ))}
          </select>
        </div>

        {/* 테이블 */}
        {filtered.length === 0 ? (
          <EmptyState icon="search_off" title="조건에 맞는 작업이 없습니다" desc="검색어나 필터를 변경해 보세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead>
                <tr className="text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest border-b border-border-subtle">
                  <th className="pb-3 pr-3">설비 / 작업명</th>
                  <th className="pb-3 px-3">규격</th>
                  <th className="pb-3 px-3">계획수량</th>
                  <th className="pb-3 px-3 w-40">진행률</th>
                  <th className="pb-3 px-3">상태</th>
                  <th className="pb-3 px-3">담당자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {pageRows.map((t) => {
                  const p = taskProgress(t)
                  const status = p >= 100 ? '완료' : risk.includes(t) ? '지연' : p > 0 ? '진행중' : '대기'
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-surface-container-low transition-colors cursor-pointer"
                      onClick={() => navigate(`/entry?task=${t.id}`)}
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          <FieldChip field={t.field} />
                          <span className="font-mono-data text-xs text-on-surface-variant">{t.tag}</span>
                        </div>
                        <p className="font-semibold text-on-surface text-sm">{t.name}</p>
                        <p className="text-xs text-on-surface-variant">{t.equipment}</p>
                      </td>
                      <td className="py-3 px-3 text-sm text-on-surface-variant max-w-[180px]">{t.spec || '—'}</td>
                      <td className="py-3 px-3 font-mono-data text-sm whitespace-nowrap">
                        {t.planQty.toLocaleString()} {t.unit}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={p} color={status === '지연' ? 'status-error' : 'primary'} height="h-1.5" className="flex-1" />
                          <span className="text-xs font-bold tabular-nums w-10 text-right">{p}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3"><StatusChip status={status} /></td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={t.assignee} />
                          <span className="text-sm whitespace-nowrap">{t.assignee || <span className="text-on-surface-variant">미지정</span>}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border-subtle text-sm">
            <span className="text-on-surface-variant">
              {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, filtered.length)} / 총 {filtered.length}건
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={curPage === 1}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-container-high disabled:opacity-30"
              >
                <Icon name="chevron_left" />
              </button>
              <span className="px-3 font-semibold">{curPage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={curPage === totalPages}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-container-high disabled:opacity-30"
              >
                <Icon name="chevron_right" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* 하단 요약 지표 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">전체 완료율</p>
          <p className="text-2xl font-black text-primary">{completion}%</p>
          <ProgressBar value={completion} className="mt-2" height="h-1.5" />
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">지연 위험</p>
          <p className="text-2xl font-black text-error">{String(risk.length).padStart(2, '0')}</p>
          <p className="text-xs text-error mt-1">즉시 조치 필요</p>
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">투입 인원</p>
          <p className="text-2xl font-black text-on-surface">{personnel}명</p>
          <p className="text-xs text-on-surface-variant mt-1">담당 지정 기준</p>
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">잔여 기간</p>
          <p className="text-2xl font-black text-on-surface">{Math.max(0, sched.totalDays - sched.elapsed)}일</p>
          <p className="text-xs text-on-surface-variant mt-1">~ {project.endDate}</p>
        </Card>
      </div>
    </>
  )
}
