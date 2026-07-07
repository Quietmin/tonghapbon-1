import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Icon, FieldChip, EmptyState } from '../components/ui'
import { useStore } from '../lib/store'
import { analyzeWorkbook } from '../lib/excelParser'

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

export default function UploadAnalysis() {
  const { state, can, commitAnalysis } = useStore()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [analysis, setAnalysis] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const last = state.lastAnalysis

  async function handleFiles(files) {
    if (!files || !files.length) return
    setBusy(true)
    setError(null)
    try {
      const merged = { fileName: '', sheetCount: 0, totalRows: 0, extractedCount: 0, excludedCount: 0, byField: {}, byEquipment: {}, needVerify: [], tasks: [] }
      const names = []
      for (const file of files) {
        const buf = await file.arrayBuffer()
        const res = await analyzeWorkbook(buf, file.name)
        names.push(file.name)
        merged.sheetCount += res.sheetCount
        merged.totalRows += res.totalRows
        merged.excludedCount += res.excludedCount
        merged.tasks.push(...res.tasks)
      }
      // 병합 후 재집계 + ID 재부여
      merged.fileName = names.join(', ')
      merged.tasks.forEach((t, i) => (t.id = `T-${String(i + 1).padStart(4, '0')}`))
      merged.extractedCount = merged.tasks.length
      for (const t of merged.tasks) {
        merged.byField[t.field] = (merged.byField[t.field] || 0) + 1
        merged.byEquipment[t.equipment] = (merged.byEquipment[t.equipment] || 0) + 1
      }
      merged.needVerify = merged.tasks.filter((t) => t.issues && t.issues.length)
      setAnalysis(merged)
    } catch (e) {
      console.error(e)
      setError('엑셀 분석 중 오류가 발생했습니다. 파일 형식(.xlsx)을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  function confirmAnalysis() {
    commitAnalysis(analysis)
    navigate('/tasks')
  }

  const view = analysis // 현재 세션 분석 결과

  return (
    <>
      <div>
        <h3 className="text-display-lg text-on-surface font-bold">업로드 분석</h3>
        <p className="text-on-surface-variant text-body-md">
          설계내역서 엑셀을 업로드하면 작업항목을 자동 추출합니다. 결과 확인 후 작업항목을 생성하세요.
        </p>
      </div>

      {!can.upload && (
        <div className="bg-surface-container-low border border-border-subtle rounded-xl p-4 flex items-center gap-3 text-sm text-on-surface-variant">
          <Icon name="lock" className="text-base" />
          현재 권한(<b>담당자/조회자</b>)에서는 업로드가 제한됩니다. 관리자 권한으로 전환하세요.
        </div>
      )}

      {/* 업로드 존 */}
      <Card
        lift={false}
        className={`p-8 border-2 border-dashed transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant'} ${!can.upload ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <div
          className="flex flex-col items-center text-center gap-3 cursor-pointer"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        >
          <div className="w-16 h-16 rounded-2xl bg-primary-container/15 flex items-center justify-center text-primary">
            <Icon name={busy ? 'hourglass_top' : 'cloud_upload'} className="text-3xl" fill />
          </div>
          <div>
            <p className="font-bold text-on-surface">{busy ? '분석 중…' : '엑셀 설계내역서를 여기에 놓거나 클릭하여 선택'}</p>
            <p className="text-sm text-on-surface-variant mt-1">기계·전기·제어 내역서 (.xlsx) — 여러 파일 동시 선택 가능</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        {error && <p className="text-sm text-error mt-4 text-center">{error}</p>}
      </Card>

      {!view && last && (
        <Card className="p-card-padding flex items-center gap-3 text-sm">
          <Icon name="history" className="text-primary" />
          <span className="text-on-surface-variant">
            최근 확정: <b className="text-on-surface">{last.fileName}</b> — 작업 {last.extractedCount?.toLocaleString()}건 확정됨
          </span>
        </Card>
      )}

      {!view && !last && !busy && (
        <Card lift={false}>
          <EmptyState
            icon="analytics"
            title="분석 결과가 없습니다"
            desc="상단에서 설계내역서를 업로드하면 자동 분석 결과가 표시됩니다. 샘플 데이터로 먼저 둘러볼 수도 있습니다."
            action={<Button variant="ghost" onClick={() => navigate('/')}>대시보드 둘러보기</Button>}
          />
        </Card>
      )}

      {view && (
        <>
          {/* 파일 정보 */}
          <Card className="p-card-padding flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-status-success/10 text-status-success flex items-center justify-center">
                <Icon name="task_alt" fill />
              </div>
              <div>
                <p className="font-bold text-on-surface break-all">{view.fileName}</p>
                <p className="text-xs text-on-surface-variant">전체 시트 {view.sheetCount}개 분석 완료</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => inputRef.current?.click()}>
              <Icon name="cached" className="text-base" /> 파일 교체
            </Button>
          </Card>

          {/* 요약 통계 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
            <StatCard icon="table_rows" color="primary" value={view.totalRows} label="처리한 전체 행" />
            <StatCard icon="checklist" color="status-success" value={view.extractedCount} label="추출된 작업" />
            <StatCard icon="filter_alt_off" color="secondary" value={view.excludedCount} label="제외된 헤더/소계/합계" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
            {/* 분야별 분류 */}
            <Card className="p-card-padding">
              <h5 className="text-title-sm text-on-surface mb-1">분야별 분류</h5>
              <p className="text-xs text-on-surface-variant mb-5">시트명·작업명·설비명 기준 자동 분류 결과</p>
              <div className="space-y-4">
                {Object.entries(view.byField)
                  .sort((a, b) => b[1] - a[1])
                  .map(([field, count]) => {
                    const pct = Math.round((count / view.extractedCount) * 100)
                    const color = field === '기계' ? 'primary' : field === '전기' ? 'status-success' : field === '제어' ? 'status-info' : 'secondary'
                    return (
                      <div key={field} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold flex items-center gap-2"><FieldChip field={field} /></span>
                          <span className="text-on-surface-variant">{count.toLocaleString()}건</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                          <div className={`h-full bg-${color} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="mt-6 pt-4 border-t border-border-subtle grid grid-cols-2 gap-3">
                {Object.entries(view.byEquipment)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([eq, c]) => (
                    <div key={eq} className="flex items-center justify-between text-sm bg-surface-container-low rounded-lg px-3 py-2">
                      <span className="font-mono-data">{eq}</span>
                      <span className="text-on-surface-variant">{c}건</span>
                    </div>
                  ))}
              </div>
            </Card>

            {/* 확인 필요 항목 */}
            <Card className="p-card-padding">
              <div className="flex items-center justify-between mb-1">
                <h5 className="text-title-sm text-on-surface">확인 필요 항목</h5>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-status-warning/10 text-status-warning">
                  {view.needVerify.length}건
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mb-4">수량·단위·분야 분류가 불명확한 항목입니다.</p>
              {view.needVerify.length === 0 ? (
                <div className="text-center py-10 text-sm text-on-surface-variant">
                  <Icon name="verified" className="text-3xl text-status-success mb-2" />
                  <p>확인이 필요한 항목이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-border-subtle max-h-[280px] overflow-y-auto -mx-2">
                  {view.needVerify.slice(0, 20).map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-2 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{t.name || '(명칭 없음)'}</p>
                        <p className="text-xs text-on-surface-variant font-mono-data">
                          {t.sheetName} · {t.sourceRow}행
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {t.issues.map((iss) => (
                          <span key={iss} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-error/10 text-error whitespace-nowrap">
                            {iss}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {view.needVerify.length > 20 && (
                    <p className="text-center text-xs text-on-surface-variant py-3">
                      외 {view.needVerify.length - 20}건 더 있음
                    </p>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* 확정 바 */}
          <Card className="p-card-padding flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4">
            <div className="flex items-center gap-3">
              <Icon name="info" className="text-primary" fill />
              <p className="text-sm text-on-surface-variant">
                결과 확인 후 <b className="text-on-surface">작업항목 {view.extractedCount.toLocaleString()}건</b>을 공정관리 데이터로 확정합니다.
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="ghost" className="flex-1" onClick={() => setAnalysis(null)}>
                취소
              </Button>
              <Button className="flex-1" onClick={confirmAnalysis} disabled={!can.edit}>
                <Icon name="check" className="text-base" /> 작업항목 생성
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  )
}
