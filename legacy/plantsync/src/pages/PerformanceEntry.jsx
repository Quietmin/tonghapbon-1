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

// 정비 이력 타임라인 — 이 작업항목의 날짜별 기록
function HistoryTimeline({ task, activeDate, onPick, onDelete, canEdit }) {
  const entries = useMemo(
    () => [...(task.entries || [])].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [task.entries]
  )
  if (!entries.length) {
    return (
      <Card lift={false} className="p-card-padding">
        <h5 className="text-title-sm text-on-surface flex items-center gap-2 mb-3">
          <Icon name="history" className="text-base text-primary" /> 정비 이력
        </h5>
        <p className="text-sm text-on-surface-variant py-3 text-center">아직 저장된 실적 이력이 없습니다. 위에서 일자별로 실적을 기록하세요.</p>
      </Card>
    )
  }
  return (
    <Card lift={false} className="p-card-padding">
      <div className="flex items-center justify-between mb-4">
        <h5 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="history" className="text-base text-primary" /> 정비 이력
          <span className="text-xs font-normal text-on-surface-variant">{entries.length}건</span>
        </h5>
        <span className="text-xs text-on-surface-variant">행을 클릭하면 해당 일자를 불러와 수정합니다</span>
      </div>
      <div className="relative pl-5">
        {/* 세로 타임라인 라인 */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border-subtle" />
        <ul className="space-y-1">
          {entries.map((e) => {
            const rate = task.planQty > 0 ? Math.min(100, Math.round((e.cumulative / task.planQty) * 1000) / 10) : 0
            const active = e.date === activeDate
            const delayed = e.delayReason && e.delayReason !== '지연 없음'
            return (
              <li key={e.date} className="relative">
                <span className={`absolute -left-5 top-3.5 w-3.5 h-3.5 rounded-full border-2 border-surface ${active ? 'bg-primary' : delayed ? 'bg-status-error' : 'bg-status-success'}`} />
                <button
                  onClick={() => onPick(e.date)}
                  className={`w-full text-left rounded-xl p-3 transition-colors border ${
                    active ? 'bg-primary/5 border-primary/30' : 'border-transparent hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-data text-sm font-bold text-on-surface">{e.date}</span>
                      {e.doneToday > 0 && (
                        <span className="text-xs font-bold text-primary whitespace-nowrap">+{e.doneToday} {task.unit}</span>
                      )}
                      <span className="text-xs text-on-surface-variant whitespace-nowrap">누적 {e.cumulative}/{task.planQty} · {rate}%</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(e.photos?.before || e.photos?.after) && <Icon name="photo_library" className="text-sm text-on-surface-variant" />}
                      {delayed && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-error/10 text-status-error">지연</span>}
                      {canEdit && (
                        <span
                          role="button"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            if (window.confirm(`${e.date} 실적 이력을 삭제할까요?`)) onDelete(e.date)
                          }}
                          className="text-on-surface-variant hover:text-error p-1 rounded"
                          title="이 이력 삭제"
                        >
                          <Icon name="delete" className="text-sm" />
                        </span>
                      )}
                    </div>
                  </div>
                  {(e.notes || e.plan || delayed) && (
                    <div className="mt-1.5 text-xs space-y-0.5">
                      {e.notes && <p className="text-on-surface"><span className="text-on-surface-variant">작업: </span>{e.notes}</p>}
                      {delayed && <p className="text-error"><span className="text-on-surface-variant">지연사유: </span>{e.delayReason}</p>}
                      {e.plan && <p className="text-on-surface-variant">익일계획: {e.plan}</p>}
                    </div>
                  )}
                  {(e.photos?.before || e.photos?.after) && (
                    <div className="flex gap-2 mt-2">
                      {e.photos?.before && <img src={e.photos.before} alt="분해 전" className="w-16 h-12 object-cover rounded-lg" />}
                      {e.photos?.after && <img src={e.photos.after} alt="분해 후" className="w-16 h-12 object-cover rounded-lg" />}
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}

export default function PerformanceEntry() {
  const { state, can, addEntry, removeEntry } = useStore()
  const { tasks, project } = state
  const [params, setParams] = useSearchParams()

  const selectedId = params.get('task') || tasks[0]?.id
  const task = tasks.find((t) => t.id === selectedId) || tasks[0]

  const today = project.today
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)

  // 특정 날짜 이전까지의 누적 (새 날짜 실적의 기준값)
  function priorCumulative(dateStr) {
    const prev = (task?.entries || []).filter((e) => e.date < dateStr)
    return prev.length ? Math.max(...prev.map((e) => e.cumulative || 0)) : 0
  }

  // 날짜에 해당하는 폼 구성 — 기록이 있으면 로드, 없으면 빈 폼(누적은 직전일 기준)
  function buildForm(dateStr) {
    const ex = task?.entries?.find((e) => e.date === dateStr)
    if (ex) {
      return {
        date: dateStr,
        doneToday: ex.doneToday ?? '',
        cumulative: ex.cumulative ?? 0,
        notes: ex.notes ?? '',
        delayReason: ex.delayReason ?? '지연 없음',
        plan: ex.plan ?? '',
        before: ex.photos?.before ?? null,
        after: ex.photos?.after ?? null,
        existing: true,
      }
    }
    return {
      date: dateStr,
      doneToday: '',
      cumulative: priorCumulative(dateStr),
      notes: '',
      delayReason: '지연 없음',
      plan: '',
      before: null,
      after: null,
      existing: false,
    }
  }

  // 작업 변경 시 기준일로 폼 초기화
  useEffect(() => {
    if (!task) return
    setForm(buildForm(today))
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

  // 날짜 변경 — 해당 일자 기록 로드(없으면 빈 폼)
  function changeDate(dateStr) {
    setForm(buildForm(dateStr))
    setSaved(false)
  }

  // 금일 완료 입력 시 누적 자동 계산 (직전일 누적 + 금일)
  function onDoneToday(v) {
    const n = v === '' ? 0 : Number(v)
    const base = priorCumulative(form.date)
    setForm((f) => ({ ...f, doneToday: v, cumulative: Math.min(task.planQty, base + n) }))
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
    setForm((f) => ({ ...f, existing: true }))
    setSaved(true)
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h3 className="text-display-lg text-on-surface font-bold">실적 입력</h3>
          <p className="text-on-surface-variant text-body-md">
            일자별로 실적·사진을 기록하면 그날 기록으로 저장됩니다. 다른 날짜를 선택하면 빈 양식으로 새로 입력합니다.
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
              <input type="date" value={form.date} onChange={(e) => changeDate(e.target.value)} className="input" />
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
            <p className="text-sm min-h-[20px]">
              {saved && (<span className="text-status-success flex items-center gap-1.5"><Icon name="check_circle" className="text-base" fill /> {form.date} 실적이 저장되었습니다.</span>)}
              {!saved && form.existing && <span className="text-on-surface-variant flex items-center gap-1.5"><Icon name="history" className="text-base" /> {form.date} 기록을 불러왔습니다. 수정 시 덮어씁니다.</span>}
              {!saved && !form.existing && <span className="text-on-surface-variant flex items-center gap-1.5"><Icon name="edit_calendar" className="text-base" /> {form.date} 신규 입력 (직전 누적 {priorCumulative(form.date)}{task.unit} 기준)</span>}
            </p>
            <Button onClick={submit} disabled={!canInput}>
              <Icon name="save" className="text-base" /> {form.existing ? '이 날짜 수정 저장' : '이 날짜로 저장'}
            </Button>
          </div>
        </Card>
      </fieldset>

      {/* 정비 이력 타임라인 */}
      <HistoryTimeline
        task={task}
        activeDate={form.date}
        canEdit={canInput}
        onPick={(d) => changeDate(d)}
        onDelete={(d) => {
          removeEntry(task.id, d)
          if (d === form.date) setForm(buildForm(d))
        }}
      />

      <p className="text-xs text-on-surface-variant flex items-start gap-2 px-1">
        <Icon name="info" className="text-sm mt-0.5" />
        일자별 기록은 각각 저장되어 <b className="text-on-surface">정비 이력</b>으로 누적됩니다. 누적 완료수량 기준으로 설비별·분야별 진행률이 재계산됩니다.
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
