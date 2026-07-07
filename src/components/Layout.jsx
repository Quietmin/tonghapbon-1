import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Icon, Avatar } from './ui'
import { useStore, ROLES } from '../lib/store'

const NAV = [
  { to: '/', icon: 'dashboard', label: '대시보드', end: true },
  { to: '/upload', icon: 'analytics', label: '업로드 분석' },
  { to: '/tasks', icon: 'format_list_bulleted', label: '작업 관리' },
  { to: '/schedule', icon: 'calendar_view_week', label: '공정표' },
  { to: '/entry', icon: 'edit_note', label: '실적 입력' },
  { to: '/reports', icon: 'summarize', label: '보고서' },
]

function RoleSwitcher() {
  const { role, setRole } = useStore()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-border-subtle text-xs font-bold text-on-surface transition-colors"
      >
        <Icon name="badge" className="text-sm text-primary" />
        {ROLES[role].label}
        <Icon name="expand_more" className="text-sm" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-44 glass-card no-lift rounded-xl p-1.5 z-50">
            <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              권한 전환 (데모)
            </p>
            {Object.entries(ROLES).map(([key, r]) => (
              <button
                key={key}
                onClick={() => {
                  setRole(key)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  role === key ? 'bg-primary-container text-on-primary font-bold' : 'hover:bg-surface-container-high text-on-surface'
                }`}
              >
                <Icon name={role === key ? 'check_circle' : 'circle'} className="text-base" />
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MobileLink({ n }) {
  return (
    <NavLink
      to={n.to}
      end={n.end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 ${isActive ? 'text-primary' : 'text-on-surface-variant'}`
      }
    >
      <Icon name={n.icon} className="text-xl" />
      <span className="text-[10px] font-semibold">{n.label}</span>
    </NavLink>
  )
}

export default function Layout({ children }) {
  const { state, roleInfo } = useStore()
  const navigate = useNavigate()
  const project = state?.project

  const linkBase = 'flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-body-md text-body-md'

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* 사이드바 (데스크톱) */}
      <aside className="hidden md:flex flex-col p-4 gap-2 h-screen fixed left-0 top-0 w-[280px] bg-surface-container border-r border-border-subtle z-50">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary">
            <Icon name="factory" />
          </div>
          <div>
            <h1 className="text-title-sm font-black text-on-surface leading-tight">중앙 허브</h1>
            <p className="text-xs text-on-surface-variant">{project?.unit || '오버홀'}</p>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `${linkBase} ${
                  isActive
                    ? 'bg-primary-container text-on-primary font-bold translate-x-1'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`
              }
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-border-subtle flex flex-col gap-1">
          <button
            onClick={() => navigate('/upload')}
            className="w-full mb-2 py-3 px-4 bg-primary text-on-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Icon name="upload_file" />
            엑셀 데이터 업로드
          </button>
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg text-on-surface-variant">
            <Icon name="verified_user" className="text-base" />
            <span className="text-sm">현재 권한: <b className="text-on-surface">{roleInfo.label}</b></span>
          </div>
        </div>
      </aside>

      {/* 본문 */}
      <main className="flex-1 md:ml-[280px] w-full min-h-screen flex flex-col pb-24 md:pb-12">
        <header className="sticky top-0 z-40 bg-surface-glass backdrop-blur-xl border-b border-border-subtle px-gutter h-16 flex justify-between items-center w-full">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-black text-primary tracking-tight">PlantSync Pro</h2>
            <span className="hidden lg:inline text-sm text-on-surface-variant">
              {project?.plant} · {project?.name}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-bold text-primary">{project?.unit} 상태</span>
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">정기 오버홀</span>
            </div>
            <RoleSwitcher />
            <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
              <Icon name="notifications" />
            </button>
            <Avatar name={roleInfo.label[0]} size="w-8 h-8" className="border border-outline-variant" />
          </div>
        </header>

        <div className="p-gutter max-w-content mx-auto w-full space-y-gutter">{children}</div>
      </main>

      {/* 모바일 하단 네비 — 대시보드 · 작업관리 · [업로드 FAB] · 실적입력 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-glass backdrop-blur-xl border-t border-border-subtle flex justify-around items-center z-50">
        {[NAV[0], NAV[3]].map((n) => (
          <MobileLink key={n.to} n={n} />
        ))}
        <div className="relative -top-6">
          <button
            onClick={() => navigate('/upload')}
            className="w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center"
          >
            <Icon name="upload_file" className="text-2xl" />
          </button>
        </div>
        {[NAV[4], NAV[5]].map((n) => (
          <MobileLink key={n.to} n={n} />
        ))}
      </nav>
    </div>
  )
}
