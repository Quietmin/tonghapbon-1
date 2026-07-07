import { useMemo, useRef, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, Button, Icon, StatusChip, FieldChip, ProgressBar, EmptyState } from '../components/ui'
import { useStore } from '../lib/store'
import { taskProgress, taskStatus } from '../lib/progress'

const DELAY_REASONS = ['지연 없음', '자재/부품 입고 지연', '인력 부족', '선행 공정 지연', '설비 이상 발견', '기상 조건', '기타']

function PhotoSlot({ label, value, onChange, disabled }) {
  const ref = useRef(null)
  function pick(files) {
    const file = files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result)
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex-1">
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files)} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1 overflow-hidden relative group disabled:opacity-50 disabled:pointer-events-none"
      >
        {value ? (
          <>
            <img src={value} alt={label} className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center text-white opacity-0 group-hover:opacity-100">
              <Icon name="cached" /> 교체
            </span>
          </>
        ) : (
          <>
            <Icon name="photo_camera" className="text-2xl text-on-surface-variant" />
            <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
          </>
        )}
      </button>
      {value && !disabled && (
        <button onClick={() => onChange(null)} className="text-xs text-error mt-1.5 hover:underline">
          사진 삭제
        </button>
      )}
    </div>
  )
}

export default function PerformanceEntry() {
  const { state, can, addEntry } = useStore()
  const { tasks, project } = state
  const [params, setParams] = useSearchParams()

  const selectedId = params.get('task') || tasks[0]?.id
  const task = tasks.find((t) => t.id === selectedId) || tasks[0]

  const today = project.today
  const existing = useMemo(() => task?.entries?.find((e) => e.date === today), [task, today])

  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)

  // 작업 변경 시 폼 초기화
  useEffect(() => {
    if (!task) return
    const ex = task.entries?.find((e) => e.date === today)
    setForm({
      date: today,
      doneToday: ex?.doneToday ?? '',
      cumulative: ex?.cumulative ?? task.doneQty ?? 0,
      notes: ex?.notes ?? '',
      delayReason: ex?.delayReason ?? '지연 없음',
      plan: ex?.plan ?? '',
      before: ex?.photos?.before ?? null,
      after: ex?.photos?.after ?? null,
    })
    setSaved(false)
  }, [selectedId, today]) // eslint-disable-line

  if (!tasks.length) {
    return (
      <Card lift={false}>
        <EmptyState icon="edit_note" title="입력할 작업이 없습니다" desc="먼저 설계내역서를 업로드하여 작업항목을 생성하세요." />
      </Card>
    )
  }
  if (!task || !form) return null

  const canInput = can.edit
  const p = taskProgress(task)

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }

  // 금일 완료 입력 시 누적 자동 계산
  function onDoneToday(v) {
    const n = v === '' ? '' : Number(v)
    const base = task.doneQty || 0
    setForm((f) => ({ ...f, doneToday: v, cumulative: v === '' ? base : Math.min(task.planQty, base + n) }))
    setSaved(false)
  }

  function submit() {
    addEntry(task.id, {
      date: form.date,
      doneToday: Number(form.doneToday) || 0,
      cumulative: Math.min(task.planQty, Number(form.cumulative) || 0),
      notes: form.notes,
      delayReason: form.delayReason,
      plan: form.plan,
      photos: { before: form.before, after: form.after },
    })
    setSaved(true)
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-display-lg text-on-surface font-bold">실적 입력</h3>
          <p className="text-on-surface-variant text-body-md">
            오버홀 특정 과업의 일일 실적과 사진 근거를 기록합니다. (기준일 {today})
          </p>
        </div>
        {/* 작업 선택 */}
        <select
          value={task.id}
          onChange={(e) => setParams({ task: e.target.value })}
          className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary max-w-full md:max-w-xs truncate"
        >
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              [{t.equipment}] {t.name}
            </option>
          ))}
        </select>
      </div>

      {!canInput && (
        <div className="bg-surface-container-low border border-border-subtle rounded-xl p-4 flex items-center gap-3 text-sm text-on-surface-variant">
          <Icon name="lock" className="text-base" />
          현재 권한(<b>조회자</b>)에서는 실적 입력이 제한됩니다. 담당자/관리자 권한으로 전환하세요.
        </div>
      )}

      {/* 작업 헤더 */}
      <Card className="p-card-padding">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FieldChip field={task.field} />
              <span className="font-mono-data text-xs text-on-surface-variant">{task.tag}</span>
            </div>
            <h4 className="text-headline-md-mobile md:text-headline-md text-on-surface">{task.name}</h4>
            <p className="text-sm text-on-surface-variant mt-1">
              {task.equipment} · {task.spec} · 계획수량 <b className="text-on-surface font-mono-data">{task.planQty.toLocaleString()} {task.unit}</b>
            </p>
          </div>
          <div className="text-right shrink-0">
            <StatusChip status={taskStatus(task)} />
            <p className="text-2xl font-black text-primary mt-2">{p}%</p>
          </div>
        </div>
        <ProgressBar value={p} height="h-2" />
      </Card>

      {/* 입력 폼 */}
      <fieldset disabled={!canInput} className={!canInput ? 'opacity-60' : ''}>
        <Card className="p-card-padding space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="입력일자">
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className="input" />
            </Field>
            <Field label={`금일 완료 (${task.unit})`}>
              <input type="number" min="0" value={form.doneToday} onChange={(e) => onDoneToday(e.target.value)} placeholder="0" className="input" />
            </Field>
            <Field label={`누적 완료수량 (${task.unit})`}>
              <input type="number" min="0" max={task.planQty} value={form.cumulative} onChange={(e) => set('cumulative', e.target.value)} className="input" />
            </Field>
          </div>

          <Field label="금일 작업내용">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="주요 작업내용, 특이사항 등을 입력하세요."
              className="input resize-none"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="지연 사유 (선택)">
              <select value={form.delayReason} onChange={(e) => set('delayReason', e.target.value)} className="input">
                {DELAY_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="익일 계획 / 조치계획">
              <input value={form.plan} onChange={(e) => set('plan', e.target.value)} placeholder="다음 작업 계획을 입력하세요." className="input" />
            </Field>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">분해 전 / 후 사진</label>
            <div className="flex gap-4 mt-2">
              <PhotoSlot label="분해 전 (BEFORE)" value={form.before} onChange={(v) => set('before', v)} disabled={!canInput} />
              <PhotoSlot label="분해 후 (AFTER)" value={form.after} onChange={(v) => set('after', v)} disabled={!canInput} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-sm text-status-success flex items-center gap-1.5 min-h-[20px]">
              {saved && (<><Icon name="check_circle" className="text-base" fill /> 실적이 저장되었습니다.</>)}
              {!saved && existing && <span className="text-on-surface-variant flex items-center gap-1.5"><Icon name="history" className="text-base" /> 오늘 입력 내역이 있습니다. 수정 시 덮어씁니다.</span>}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={submit} disabled={!canInput}>임시 저장</Button>
              <Button onClick={submit} disabled={!canInput}>
                <Icon name="send" className="text-base" /> 실적 제출
              </Button>
            </div>
          </div>
        </Card>
      </fieldset>

      <p className="text-xs text-on-surface-variant flex items-start gap-2 px-1">
        <Icon name="info" className="text-sm mt-0.5" />
        입력하신 금일 완료 물량은 계획수량과 대비하여 공정률에 자동 반영되며, 누적 완료수량 기준으로 설비별·분야별 진행률이 재계산됩니다.
      </p>
    </>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
