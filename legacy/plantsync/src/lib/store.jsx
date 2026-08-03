// 전역 데이터 스토어 — React Context + IndexedDB 영속화
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { get, set } from 'idb-keyval'
import { buildSeedTasks, buildSeedProject } from './seed'

const KEY = 'plantsync-state-v1'
const StoreCtx = createContext(null)

const ROLES = {
  admin: { label: '관리자', can: { upload: true, edit: true, assign: true, report: true, manageUsers: true } },
  editor: { label: '담당자', can: { upload: false, edit: true, assign: false, report: true, manageUsers: false } },
  viewer: { label: '조회자', can: { upload: false, edit: false, assign: false, report: true, manageUsers: false } },
}

function initialState() {
  const tasks = buildSeedTasks().map((t) => ({ ...t, sourceId: 'demo' }))
  return {
    role: 'admin',
    project: buildSeedProject(),
    tasks,
    sources: [{ id: 'demo', fileName: '데모 샘플 데이터', count: tasks.length, demo: true, uploadedAt: null }],
    lastAnalysis: null,
  }
}

// 이전 버전(파일 관리 이전)에 저장된 데이터 호환 — sources 없으면 생성, task에 sourceId 부여
function migrate(s) {
  if (s.sources && s.sources.length) return s
  const tasks = (s.tasks || []).map((t) => ({ ...t, sourceId: t.sourceId || 'legacy' }))
  const fileName = s.lastAnalysis?.fileName || '기존 업로드 데이터'
  return { ...s, tasks, sources: tasks.length ? [{ id: 'legacy', fileName, count: tasks.length, uploadedAt: null }] : [] }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(null)

  // 최초 로드: IndexedDB → 없으면 시드
  useEffect(() => {
    let alive = true
    get(KEY).then((saved) => {
      if (!alive) return
      setState(saved && saved.tasks ? migrate(saved) : initialState())
    })
    return () => {
      alive = false
    }
  }, [])

  // 변경 시 영속화
  useEffect(() => {
    if (state) set(KEY, state)
  }, [state])

  const update = useCallback((fn) => {
    setState((prev) => fn(prev))
  }, [])

  const value = {
    state,
    role: state?.role || 'admin',
    roleInfo: ROLES[state?.role || 'admin'],
    can: ROLES[state?.role || 'admin'].can,

    setRole: (role) => update((s) => ({ ...s, role })),

    setProject: (patch) => update((s) => ({ ...s, project: { ...s.project, ...patch } })),

    // 엑셀 분석 결과를 작업항목으로 "추가" (누적) — 여러 파일 관리 지원
    addAnalysis: (analysis) =>
      update((s) => {
        const prevReal = (s.sources || []).filter((x) => !x.demo)
        // 첫 실제 업로드면 데모 샘플은 자동 정리
        const keepTasks = prevReal.length ? s.tasks.filter((t) => t.sourceId !== 'demo') : []
        const id = 'SRC' + Date.now().toString(36).toUpperCase()
        const added = analysis.tasks.map((t, i) => ({
          ...t,
          sourceId: id,
          id: `${id}-${String(i + 1).padStart(4, '0')}`,
          doneQty: 0,
          assignee: null,
          entries: [],
        }))
        const source = {
          id,
          fileName: analysis.fileName,
          count: added.length,
          uploadedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        }
        return {
          ...s,
          tasks: [...keepTasks, ...added],
          sources: [...prevReal, source],
          lastAnalysis: {
            fileName: analysis.fileName,
            sheetCount: analysis.sheetCount,
            totalRows: analysis.totalRows,
            extractedCount: analysis.extractedCount,
            excludedCount: analysis.excludedCount,
            byField: analysis.byField,
            byEquipment: analysis.byEquipment,
          },
        }
      }),

    // 특정 업로드 파일(및 그 작업항목) 삭제
    removeSource: (id) =>
      update((s) => ({
        ...s,
        tasks: s.tasks.filter((t) => t.sourceId !== id),
        sources: (s.sources || []).filter((x) => x.id !== id),
      })),

    // 전체 리셋 — 업로드 데이터 전부 삭제 (프로젝트 설정은 유지)
    resetAll: () => update((s) => ({ ...s, tasks: [], sources: [], lastAnalysis: null })),

    setLastAnalysis: (analysis) => update((s) => ({ ...s, lastAnalysis: analysis })),

    assignTask: (id, assignee) =>
      update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, assignee } : t)) })),

    // 실적 입력 (하루 1회) — 같은 날짜는 덮어쓰기, 날짜별로 이력 누적
    addEntry: (id, entry) =>
      update((s) => ({
        ...s,
        tasks: s.tasks.map((t) => {
          if (t.id !== id) return t
          const entries = (t.entries || []).filter((e) => e.date !== entry.date)
          entries.push(entry)
          entries.sort((a, b) => (a.date < b.date ? -1 : 1))
          const doneQty = Math.max(...entries.map((e) => e.cumulative), 0)
          return { ...t, doneQty, entries }
        }),
      })),

    // 특정 일자 실적 이력 삭제
    removeEntry: (id, date) =>
      update((s) => ({
        ...s,
        tasks: s.tasks.map((t) => {
          if (t.id !== id) return t
          const entries = (t.entries || []).filter((e) => e.date !== date)
          const doneQty = entries.length ? Math.max(...entries.map((e) => e.cumulative), 0) : 0
          return { ...t, doneQty, entries }
        }),
      })),

    resetDemo: () => setState(initialState()),
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export { ROLES }
