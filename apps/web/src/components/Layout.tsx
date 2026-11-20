import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { isDemo } from '../lib/data'
import { useStore } from '../lib/store'
import { LangToggle, useT } from '../lib/i18n'

export const PAGES = [
  { path: '/', label: 'Overview', title: 'Portfolio Overview', ico: '◫', group: 'WORKSPACE' },
  { path: '/positions', label: 'Open Positions', title: 'Open Positions', ico: '▤', group: 'WORKSPACE' },
  { path: '/journal', label: 'Trade Journal', title: 'Trade Journal', ico: '▧', group: 'WORKSPACE' },
  { path: '/watch', label: 'Market Watch', title: 'Market Watch', ico: '⌁', group: 'WORKSPACE' },
  { path: '/risk', label: 'Risk Management', title: 'Risk Management', ico: '◈', group: 'MANAGEMENT' },
  { path: '/analytics', label: 'Analytics', title: 'Analytics', ico: '▥', group: 'MANAGEMENT' },
  { path: '/settings', label: 'Settings', title: 'Settings', ico: '⚙', group: 'MANAGEMENT' },
] as const

export function Brand() {
  const t = useT()
  return (
    <div className="brand">
      <div className="brand-mark">T</div>
      <div><div className="brand-name">TRADEPILOT</div><div className="brand-sub">{t('PERSONAL TRADING DESK')}</div></div>
    </div>
  )
}

export default function Layout({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { toast, loading, error } = useStore()
  const t = useT()
  const page = PAGES.find(p => p.path === pathname) ?? PAGES[0]
  const initials = email ? email.slice(0, 2) : 'DM'

  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <Brand />
        {(['WORKSPACE', 'MANAGEMENT'] as const).map(group => (
          <div key={group}>
            <div className="nav-label">{t(group)}</div>
            <nav className="nav">
              {PAGES.filter(p => p.group === group).map(p => (
                <NavLink key={p.path} to={p.path} end onClick={() => setOpen(false)}>
                  <span className="ico">{p.ico}</span> {t(p.label)}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
        <div className="side-bottom">
          {t('PERSONAL TRADING TERMINAL')}<br />
          <span className="ver">VERSION 0.2 · {isDemo ? t('DEMO MODE') : 'SUPABASE'}</span>
        </div>
      </aside>
      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <main>
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" aria-label={t('Open menu')} onClick={() => setOpen(o => !o)}>☰</button>
            <div>
              <div className="eyebrow">TRADEPILOT / {t(page.label)}</div>
              <h1 className="page-title">{t(page.title)}</h1>
            </div>
          </div>
          <div className="top-actions">
            <div className="market-status">
              <span className={`live-dot${isDemo ? ' demo' : ''}`} />
              {isDemo ? t('DEMO DATA · STORED IN THIS BROWSER') : t('MANUAL ENTRY · NO BROKER CONNECTED')}
            </div>
            <LangToggle />
            <div className="avatar" title={email ?? t('Demo user')}>{initials}</div>
          </div>
        </header>
        {error && <div className="risk-note danger" style={{ marginBottom: 16 }}>{t('Could not load data: {msg}', { msg: error })}</div>}
        {loading ? <div className="subtle">{t('Loading…')}</div> : <Outlet />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
