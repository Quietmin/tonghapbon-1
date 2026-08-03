import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Icon, FieldChip } from '../components/ui'
import { useStore } from '../lib/store'
import { analyzeWorkbook } from '../lib/excelParser'

// 프로젝트 / 계약기간 설정
function ProjectSettings({ project, canEdit, onSave }) {
  const [form, setForm] = useState(project)
  const [saved, setSaved] = useState(false)
  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(project)
  const fields = [
    { k: 'name', label: '프로젝트명', type: 'text', full: true },
    { k: 'plant', label: '발전소/지사', type: 'text' },
    { k: 'unit', label: '호기', type: 'text' },
    { k: 'startDate', label: '계약 시작일', type: 'date' },
    { k: 'endDate', label: '준공일', type: 'date' },
    { k: 'today', label: '기준일 (오늘)', type: 'date' },
  ]
  return (
    <Card lift={false} className="p-card-padding">
      <div className="flex items-center justify-between mb-4">
        <h5 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="event_note" className="text-base text-primary" /> 프로젝트 · 계약기간
        </h5>
        {canEdit && (
          <Button
            onClick={() => {
              onSave(form)
              setSaved(true)
            }}
            disabled={!dirty}
            className="!py-2"
          >
            <Icon name="save" className="text-base" /> 저장
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {fields.map((f) => (
          <label key={f.k} className={`block ${f.full ? 'col-span-2 md:col-span-3' : ''}`}>
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{f.label}</span>
            <input
              type={f.type}
              disabled={!canEdit}
              value={form[f.k] || ''}
              onChange={(e) => set(f.k, e.target.value)}
              className="input mt-1.5 disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-on-surface-variant flex items-start gap-1.5 mt-3">
        <Icon name="info" className="text-sm mt-0.5" />
        엑셀에 <b className="text-on-surface">작업 예정일</b>이 있으면 그 날짜를 우선 사용하고, 없으면 <b className="text-on-surface">계약 시작일~준공일</b> 기간 내에 작업 유형별로 예정공정표를 자동 작성합니다.
      </p>
      {saved && !dirty && <p className="text-xs text-status-success mt-2 flex items-center gap-1"><Icon name="check_circle" className="text-sm" fill /> 저장되었습니다.</p>}
    </Card>
  )
}

// 업로드된(등록 완료) 파일 관리 — 삭제/리셋
function SourcesManager({ sources, canEdit, onDelete, onReset, onDemo, onGoTasks }) {
  const totalReal = sources.filter((s) => !s.demo).reduce((a, s) => a + s.count, 0)
  return (
    <Card lift={false} className="p-card-padding">
      <div className="flex items-center justify-between mb-4">
        <h5 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="folder_open" className="text-base text-primary" /> 등록된 파일
          <span className="text-xs font-normal text-on-surface-variant">
            {sources.filter((s) => !s.demo).length}개 파일 · 작업 {totalReal.toLocaleString()}건
          </span>
        </h5>
        {canEdit && sources.length > 0 && (
          <div className="flex gap-2">
            <Button variant="ghost" className="!py-2" onClick={onDemo}>
              <Icon name="science" className="text-base" /> 샘플 불러오기
            </Button>
            <Button variant="danger" className="!py-2" onClick={onReset}>
              <Icon name="restart_alt" className="text-base" /> 전체 리셋
            </Button>
          </div>
        )}
      </div>
      {sources.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-3 text-center">등록된 파일이 없습니다. 위에서 엑셀을 올린 뒤 “공정관리에 추가”를 누르세요.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {sources.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.demo ? 'bg-secondary/10 text-secondary' : 'bg-status-success/10 text-status-success'}`}>
                  <Icon name={s.demo ? 'science' : 'description'} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{s.fileName}</p>
                  <p className="text-xs text-on-surface-variant">
                    작업 {s.count.toLocaleString()}건{s.demo ? ' · 샘플' : s.uploadedAt ? ` · ${s.uploadedAt}` : ''}
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => onDelete(s.id)}
                  className="text-on-surface-variant hover:text-error transition-colors p-2 rounded-lg hover:bg-error/5 shrink-0"
                  title="이 파일 삭제"
                >
                  <Icon name="delete" className="text-base" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sources.some((s) => !s.demo) && (
        <button onClick={onGoTasks} className="text-primary text-sm font-semibold hover:underline mt-3 flex items-center gap-1">
          작업 관리로 이동 <Icon name="arrow_forward" className="text-sm" />
        </button>
      )}
    </Card>
  )
}

function StatCard({ icon, color, value, label }) {
  return (
    <Card className="p-card-padding text-center">
      <div className={`w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center bg-${color}/10 text-${color}`}>
        <Icon name={icon} fill />
      </div>
      <p className="text-3xl font-black text-on-surface tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mt-1">{label}</p>
    </Card>
  )
}

const DISCIPLINES = ['자동', '기계', '전기', '제어']
const DISC_LABEL = { 자동: '자동감지', 기계: '기계', 전기: '전기', 제어: '제어' }

export default function UploadAnalysis() {
  const { state, can, addAnalysis, removeSource, resetAll, resetDemo, setProject } = useStore()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const pid = useRef(0)
  const [pending, setPending] = useState([]) // {id, fileName, discipline, result}
  const [disc, setDisc] = useState('자동') // 새로 올릴 파일에 적용할 분야
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const sources = state.sources || []
  const hasReal = sources.some((s) => !s.demo)

  // 분야 지정 시 해당 파일의 모든 작업 field를 덮어씀
  function tasksOf(entry) {
    if (entry.discipline === '자동') return entry.result.tasks
    return entry.result.tasks.map((t) => ({
      ...t,
      field: entry.discipline,
      issues: (t.issues || []).filter((i) => i !== '분야 분류 불가'),
    }))
  }

  async function handleFiles(files) {
    if (!files || !files.length) return
    setBusy(true)
    setError(null)
    try {
      const entries = []
      for (const file of files) {
        const buf = await file.arrayBuffer()
        const res = await analyzeWorkbook(buf, file.name)
        entries.push({ id: `P${Date.now().toString(36)}-${pid.current++}`, fileName: file.name, discipline: disc, result: res })
      }
      setPending((prev) => [...prev, ...entries]) // 누적 (기존 대기 파일 유지)
    } catch (e) {
      console.error(e)
      setError('엑셀 분석 중 오류가 발생했습니다. 파일 형식(.xlsx)을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const setPendingDiscipline = (id, d) => setPending((prev) => prev.map((e) => (e.id === id ? { ...e, discipline: d } : e)))
  const removePending = (id) => setPending((prev) => prev.filter((e) => e.id !== id))

  function commitAll() {
    for (const e of pending) {
      const tasks = tasksOf(e)
      const byField = {}
      const byEquipment = {}
      for (const t of tasks) {
        byField[t.field] = (byField[t.field] || 0) + 1
        byEquipment[t.equipment] = (byEquipment[t.equipment] || 0) + 1
      }
      addAnalysis({
        fileName: e.fileName,
        sheetCount: e.result.sheetCount,
        totalRows: e.result.totalRows,
        extractedCount: tasks.length,
        excludedCount: e.result.excludedCount,
        byField,
        byEquipment,
        tasks,
      })
    }
    setPending([])
  }

  // 대기열 집계
  const allTasks = pending.flatMap(tasksOf)
  const agg = {
    totalRows: pending.reduce((a, e) => a + e.result.totalRows, 0),
    extracted: allTasks.length,
    excluded: pending.reduce((a, e) => a + e.result.excludedCount, 0),
  }
  const byField = {}
  for (const t of allTasks) byField[t.field] = (byField[t.field] || 0) + 1
  const needVerify = allTasks.filter((t) => t.issues && t.issues.length)

  return (
    <>
      <div>
        <h3 className="text-display-lg text-on-surface font-bold">업로드 분석</h3>
        <p className="text-on-surface-variant text-body-md">
          ① 분야를 고르고 엑셀을 <b>올리기</b> → ② 결과 확인 → ③ <b>공정관리에 추가</b>. 여러 파일을 하나씩 나눠 올려도 대기열에 쌓입니다.
        </p>
      </div>

      <ProjectSettings project={state.project} canEdit={can.edit} onSave={setProject} />

      {!can.upload && (
        <div className="bg-surface-container-low border border-border-subtle rounded-xl p-4 flex items-center gap-3 text-sm text-on-surface-variant">
          <Icon name="lock" className="text-base" />
          현재 권한(<b>담당자/조회자</b>)에서는 업로드가 제한됩니다. 관리자 권한으로 전환하세요.
        </div>
      )}

      {/* 1) 분야 선택 + 올리기 */}
      <Card lift={false} className={`p-card-padding ${!can.upload ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <span className="text-sm font-semibold text-on-surface whitespace-nowrap">이 파일의 분야</span>
          <div className="flex gap-1 p-1 bg-surface-container-high rounded-xl">
            {DISCIPLINES.map((d) => (
              <button
                key={d}
                onClick={() => setDisc(d)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  disc === d ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {DISC_LABEL[d]}
              </button>
            ))}
          </div>
          <span className="text-xs text-on-surface-variant">
            {disc === '자동' ? '시트·컬럼·키워드로 분야 자동 분류' : `이 파일의 모든 작업을 [${disc}]로 지정`}
          </span>
        </div>

        <div
          className={`border-2 border-dashed rounded-xl p-8 transition-colors cursor-pointer flex flex-col items-center text-center gap-3 ${
            dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(e.dataTransfer.files)
          }}
        >
          <div className="w-16 h-16 rounded-2xl bg-primary-container/15 flex items-center justify-center text-primary">
            <Icon name={busy ? 'hourglass_top' : 'cloud_upload'} className="text-3xl" fill />
          </div>
          <div>
            <p className="font-bold text-on-surface">{busy ? '분석 중…' : '엑셀 파일 올리기 — 드래그하거나 클릭해서 선택'}</p>
            <p className="text-sm text-on-surface-variant mt-1">
              분야: <b className="text-primary">{DISC_LABEL[disc]}</b> · .xlsx · 한 번에 여러 개 또는 하나씩 나눠서 올려도 누적됩니다
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        {error && <p className="text-sm text-error mt-4 text-center">{error}</p>}
      </Card>

      {/* 2) 대기열 — 올린 파일 목록 + 분야 수정 + 추가 */}
      {pending.length > 0 && (
        <>
          <Card lift={false} className="p-card-padding">
            <div className="flex items-center justify-between mb-4">
              <h5 className="text-title-sm text-on-surface flex items-center gap-2">
                <Icon name="pending_actions" className="text-base text-primary" /> 올린 파일 (대기)
                <span className="text-xs font-normal text-on-surface-variant">{pending.length}개 · 작업 {agg.extracted.toLocaleString()}건</span>
              </h5>
              <Button variant="ghost" className="!py-2" onClick={() => setPending([])}>
                <Icon name="close" className="text-base" /> 대기열 비우기
              </Button>
            </div>
            <ul className="divide-y divide-border-subtle">
              {pending.map((e) => {
                const cnt = tasksOf(e).length
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Icon name="draft" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{e.fileName}</p>
                        <p className="text-xs text-on-surface-variant">시트 {e.result.sheetCount}개 · 작업 {cnt.toLocaleString()}건</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={e.discipline}
                        onChange={(ev) => setPendingDiscipline(e.id, ev.target.value)}
                        className="h-9 px-3 rounded-lg bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
                        title="분야 지정"
                      >
                        {DISCIPLINES.map((d) => (
                          <option key={d} value={d}>{DISC_LABEL[d]}</option>
                        ))}
                      </select>
                      <button onClick={() => removePending(e.id)} className="text-on-surface-variant hover:text-error transition-colors p-2 rounded-lg hover:bg-error/5" title="대기열에서 제거">
                        <Icon name="delete" className="text-base" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          {/* 집계 요약 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
            <StatCard icon="table_rows" color="primary" value={agg.totalRows} label="처리한 전체 행" />
            <StatCard icon="checklist" color="status-success" value={agg.extracted} label="추출된 작업" />
            <StatCard icon="filter_alt_off" color="secondary" value={agg.excluded} label="제외된 헤더/소계/합계" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
            <Card className="p-card-padding">
              <h5 className="text-title-sm text-on-surface mb-1">분야별 분류 (대기)</h5>
              <p className="text-xs text-on-surface-variant mb-5">파일별 분야 지정 결과가 반영됩니다.</p>
              <div className="space-y-4">
                {Object.entries(byField)
                  .sort((a, b) => b[1] - a[1])
                  .map(([field, count]) => {
                    const pct = agg.extracted ? Math.round((count / agg.extracted) * 100) : 0
                    const color = field === '기계' ? 'primary' : field === '전기' ? 'status-success' : field === '제어' ? 'status-info' : 'secondary'
                    return (
                      <div key={field} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold"><FieldChip field={field} /></span>
                          <span className="text-on-surface-variant">{count.toLocaleString()}건</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                          <div className={`h-full bg-${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </Card>

            <Card className="p-card-padding">
              <div className="flex items-center justify-between mb-1">
                <h5 className="text-title-sm text-on-surface">확인 필요 항목</h5>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-status-warning/10 text-status-warning">{needVerify.length}건</span>
              </div>
              <p className="text-xs text-on-surface-variant mb-4">수량·단위·분야가 불명확한 항목입니다. 분야를 지정하면 분야 관련 경고는 사라집니다.</p>
              {needVerify.length === 0 ? (
                <div className="text-center py-8 text-sm text-on-surface-variant">
                  <Icon name="verified" className="text-3xl text-status-success mb-2" />
                  <p>확인이 필요한 항목이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-border-subtle max-h-[240px] overflow-y-auto -mx-2">
                  {needVerify.slice(0, 20).map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-2 py-2.5">
                      <p className="text-sm font-semibold text-on-surface truncate">{t.name || '(명칭 없음)'}</p>
                      <div className="flex gap-1 shrink-0">
                        {t.issues.map((iss) => (
                          <span key={iss} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-error/10 text-error whitespace-nowrap">{iss}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {needVerify.length > 20 && <p className="text-center text-xs text-on-surface-variant py-3">외 {needVerify.length - 20}건 더 있음</p>}
                </div>
              )}
            </Card>
          </div>

          {/* 3) 추가 */}
          <Card className="p-card-padding flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4">
            <div className="flex items-center gap-3">
              <Icon name="info" className="text-primary" fill />
              <p className="text-sm text-on-surface-variant">
                대기 중인 <b className="text-on-surface">파일 {pending.length}개 · 작업 {agg.extracted.toLocaleString()}건</b>을 {hasReal ? '기존 데이터에 추가' : '공정관리 데이터로 등록'}합니다.
              </p>
            </div>
            <Button className="w-full sm:w-auto" onClick={commitAll} disabled={!can.upload || !pending.length}>
              <Icon name="add" className="text-base" /> 공정관리에 추가
            </Button>
          </Card>
        </>
      )}

      {/* 등록된 파일 관리 */}
      <SourcesManager
        sources={sources}
        canEdit={can.upload}
        onDelete={(id) => removeSource(id)}
        onReset={() => {
          if (window.confirm('등록된 모든 작업항목을 삭제합니다. 계속할까요?')) resetAll()
        }}
        onDemo={() => {
          if (window.confirm('현재 데이터를 샘플 데모 데이터로 교체합니다. 계속할까요?')) resetDemo()
        }}
        onGoTasks={() => navigate('/tasks')}
      />
    </>
  )
}
