import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, ProgressRing, ProgressBar, StatusChip, Avatar, Icon, Button } from '../components/ui'
import { useStore } from '../lib/store'
import {
  overallProgress,
  progressByField,
  progressByEquipment,
  scheduleInfo,
  taskProgress,
  missingEntries,
  fieldColor,
} from '../lib/progress'
import { plannedOverall, scheduleDelayTasks } from '../lib/schedule'
import { exportTasksToExcel } from '../lib/exporter'

const FIELD_LABEL_EN = { 기계: 'Mechanical', 전기: 'Electrical', 제어: 'Control' }

export default function Dashboard() {
  const { state } = useStore()
  const navigate = useNavigate()
  const { tasks, project } = state

  const m = useMemo(() => {
    const sched = scheduleInfo(project)
    const overall = overallProgress(tasks)
    const planned = plannedOverall(tasks, project, project.today)
    const byField = progressByField(tasks)
    const equip = progressByEquipment(tasks).sort((a, b) => b.count - a.count)
    const risk = scheduleDelayTasks(tasks, project, project.today)
    const missing = missingEntries(tasks, project.today)
    return { sched, overall, planned, byField, equip, risk, missing }
  }, [tasks, project])

  const onTrack = m.overall >= m.planned - 5
  const alert = m.missing.length > 0 || m.risk.length > 0

  return (
    <>
      {/* 알림 배너 */}
      {alert && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-error/20">
          <div className="flex items-center gap-3">
            <Icon name="warning" className="text-error" fill />
            <div>
              <p className="font-bold">실적 입력 / 지연 위험 알림</p>
              <p className="text-sm opacity-90">
                오늘 미입력 {m.missing.length}건 · 지연 위험 공정 {m.risk.length}건이 확인되었습니다.
              </p>
            </div>
          </div>
          <Button variant="danger" className="shrink-0" onClick={() => navigate('/entry')}>
            지금 입력하기
          </Button>
        </div>
      )}

      {/* 타이틀 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-display-lg text-on-surface font-bold">대시보드</h3>
          <p className="text-on-surface-variant text-body-md">
            {project.name} 정기 오버홀 공정 현황 (실시간)
          </p>
        </div>
        <div className="flex gap-2">
          <div className="px-4 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle flex items-center gap-2 text-sm font-semibold">
            <Icon name="calendar_month" className="text-base" />
            {project.today}
          </div>
          <Button onClick={() => exportTasksToExcel(tasks, project, m)}>
            <Icon name="download" className="text-base" />
            보고서
          </Button>
        </div>
      </div>

      {/* Bento 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <Card className="p-card-padding flex items-center gap-6">
          <ProgressRing value={m.overall}>
            <span className="text-xl font-black text-on-surface">{m.overall}%</span>
          </ProgressRing>
          <div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">전체 공정률</p>
            <h4 className={`text-3xl font-black ${onTrack ? 'text-primary' : 'text-error'}`}>
              {onTrack ? '정상 진행' : '지연 주의'}
            </h4>
            <p className={`text-xs mt-1 flex items-center gap-1 ${onTrack ? 'text-status-success' : 'text-error'}`}>
              <Icon name={onTrack ? 'trending_up' : 'trending_down'} className="text-sm" />
              계획 대비 {(m.overall - m.planned).toFixed(1)}%p
            </p>
          </div>
        </Card>

        <Card className="p-card-padding">
          <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-4">오버홀 경과일</p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-4xl font-black text-on-surface">{m.sched.elapsed}</span>
            <span className="text-on-surface-variant text-xl mb-1">/ {m.sched.totalDays}일</span>
          </div>
          <ProgressBar value={(m.sched.elapsed / m.sched.totalDays) * 100} color="status-info" height="h-3" />
          <p className="text-xs text-on-surface-variant mt-3">목표 완료일: {project.endDate}</p>
        </Card>

        <Card className="p-card-padding">
          <div className="flex justify-between items-start mb-4">
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">지연 위험 공정</p>
            <span className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center text-error">
              <Icon name="warning" fill />
            </span>
          </div>
          <h4 className="text-4xl font-black text-error">{String(m.risk.length).padStart(2, '0')}</h4>
          <p className="text-sm text-on-surface-variant mt-1">
            {m.risk[0] ? `${m.risk[0].equipment} 등 즉시 조치 필요` : '지연 위험 공정 없음'}
          </p>
        </Card>
      </div>

      {/* 분야별 성과 + 설비별 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <Card className="lg:col-span-4 p-card-padding space-y-6">
          <h5 className="text-title-sm text-on-surface border-b border-border-subtle pb-4">분야별 진행률</h5>
          {['기계', '전기', '제어'].map((f) => (
            <div key={f} className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="font-semibold text-sm">
                  {f} <span className="text-on-surface-variant font-normal">{FIELD_LABEL_EN[f]}</span>
                </span>
                <span className={`font-bold text-${fieldColor(f)}`}>{m.byField[f]}%</span>
              </div>
              <ProgressBar value={m.byField[f]} color={fieldColor(f)} />
            </div>
          ))}
          <div className="pt-4 mt-4 bg-surface-container-low p-4 rounded-xl flex items-center gap-3">
            <Icon name="info" className="text-primary" fill />
            <p className="text-xs text-on-surface-variant leading-relaxed">
              공정률은 물량 기준(Σ완료수량 / Σ계획수량)으로 자동 산정됩니다.
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-8 p-card-padding">
          <div className="flex justify-between items-center mb-6">
            <h5 className="text-title-sm text-on-surface">설비별 현황</h5>
            <button onClick={() => navigate('/tasks')} className="text-primary text-sm font-semibold hover:underline">
              전체 작업 보기
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest border-b border-border-subtle">
                  <th className="pb-4">설비</th>
                  <th className="pb-4">분야</th>
                  <th className="pb-4">작업 수</th>
                  <th className="pb-4">상태</th>
                  <th className="pb-4 text-right">진행률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {m.equip.slice(0, 7).map((e) => {
                  const status = e.progress >= 100 ? '완료' : e.progress >= m.planned - 15 ? '진행중' : '지연'
                  return (
                    <tr key={e.equipment} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-4 font-mono-data text-on-surface">{e.equipment}</td>
                      <td className="py-4 text-sm text-on-surface-variant">{e.field}</td>
                      <td className="py-4 text-sm">{e.count}건</td>
                      <td className="py-4">
                        <StatusChip status={status} />
                      </td>
                      <td className="py-4 text-right font-bold text-on-surface">{e.progress}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 보고서 / 다운로드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        <Card className="overflow-hidden h-64 relative group p-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary-container to-status-info opacity-90" />
          <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Live Site</p>
            <h5 className="text-xl font-bold">{project.unit} 오버홀 현장</h5>
            <p className="text-sm opacity-90 mt-1">전체 작업 {tasks.length}건 · 완료 {tasks.filter((t) => taskProgress(t) >= 100).length}건</p>
          </div>
        </Card>

        <Card className="p-card-padding flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-primary-container/20 rounded-2xl flex items-center justify-center text-primary">
              <Icon name="description" />
            </div>
            <div>
              <h5 className="text-title-sm text-on-surface">일일 / 경영진 보고서</h5>
              <p className="text-sm text-on-surface-variant">{project.today} 기준 자동 생성</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => exportTasksToExcel(tasks, project, m)}>
              <Icon name="table_view" className="text-base" /> 엑셀 다운로드
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => window.print()}>
              <Icon name="print" className="text-base" /> 인쇄 / PDF
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}
