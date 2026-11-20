import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isDemo, supabase } from './lib/data'
import { StoreProvider } from './lib/store'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Positions from './pages/Positions'
import Journal from './pages/Journal'
import MarketWatch from './pages/MarketWatch'
import Risk from './pages/Risk'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Analyze from './pages/Analyze'
import HotStocks from './pages/HotStocks'
import { useT } from './lib/i18n'

function Shell({ email }: { email: string | null }) {
  return (
    <StoreProvider>
      <Routes>
        <Route element={<Layout email={email} />}>
          <Route index element={<Overview />} />
          <Route path="positions" element={<Positions />} />
          <Route path="journal" element={<Journal />} />
          <Route path="watch" element={<MarketWatch />} />
          <Route path="analyze" element={<Analyze />} />
          <Route path="hot" element={<HotStocks />} />
          <Route path="risk" element={<Risk />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings email={email} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </StoreProvider>
  )
}

function AuthGate() {
  const t = useT()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="center-screen subtle">{t('Loading…')}</div>
  if (!session) return <Login />
  // key: remount the store when the user changes so no data leaks between sessions
  return <Shell key={session.user.id} email={session.user.email ?? null} />
}

export default function App() {
  return <BrowserRouter>{isDemo ? <Shell email={null} /> : <AuthGate />}</BrowserRouter>
}
