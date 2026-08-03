import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { useStore } from './lib/store'
import { Icon } from './components/ui'
import Dashboard from './pages/Dashboard'
import UploadAnalysis from './pages/UploadAnalysis'
import TaskManagement from './pages/TaskManagement'
import PerformanceEntry from './pages/PerformanceEntry'
import Schedule from './pages/Schedule'
import Reports from './pages/Reports'

export default function App() {
  const { state } = useStore()

  // 스토어 최초 로드 대기
  if (!state) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-on-surface-variant">
        <Icon name="factory" className="text-4xl text-primary animate-pulse" />
        <p className="text-sm">불러오는 중…</p>
      </div>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<UploadAnalysis />} />
        <Route path="/tasks" element={<TaskManagement />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/entry" element={<PerformanceEntry />} />
        <Route path="/reports" element={<Reports />} />
      </Routes>
    </Layout>
  )
}
