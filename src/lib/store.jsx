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
  return {
    role: 'admin',
    project: buildSeedProject(),
    tasks: buildSeedTasks(),
    lastAnalysis: null,
  }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(null)

  // 최초 로드: IndexedDB → 없으면 시드
  useEffect(() => {
    let alive = true
    get(KEY).then((saved) => {
      if (!alive) return
      setState(saved && saved.tasks ? saved : initialState())
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

    // 엑셀 분석 결과를 작업항목으로 확정
    commitAnalysis: (analysis) =>
      update((s) => ({
        ...s,
        lastAnalysis: {
          fileName: analysis.fileName,
          sheetCount: analysis.sheetCount,
          totalRows: analysis.totalRows,
          extractedCount: analysis.extractedCount,
          excludedCount: analysis.excludedCount,
          byField: analysis.byField,
          byEquipment: analysis.byEquipment,
        },
        tasks: analysis.tasks.map((t) => ({ ...t, doneQty: 0, assignee: null, entries: [] })),
      })),

    setLastAnalysis: (analysis) => update((s) => ({ ...s, lastAnalysis: analysis })),

    assignTask: (id, assignee) =>
      update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, assignee } : t)) })),

    // 실적 입력 (하루 1회)
    addEntry: (id, entry) =>
      update((s) => ({
        ...s,
        tasks: s.tasks.map((t) => {
          if (t.id !== id) return t
          const entries = (t.entries || []).filter((e) => e.date !== entry.date)
          entries.push(entry)
          const doneQty = Math.max(...entries.map((e) => e.cumulative), 0)
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
