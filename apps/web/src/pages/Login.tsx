import { useState } from 'react'
import { useT } from '../lib/i18n'
import { supabase } from '../lib/data'
import { Brand } from '../components/Layout'
import { LangToggle } from '../lib/i18n'

export default function Login() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setErr(error.message)
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><Brand /><LangToggle /></div>
        <div className="field"><label>{t('Email')}</label><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="field"><label>{t('Password')}</label><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={busy}>{t(busy ? 'Signing in…' : 'Sign in')}</button>
        <p className="subtle" style={{ marginTop: 16 }}>{t('Single-user app. Create your login in Supabase → Authentication → Users.')}</p>
      </form>
    </div>
  )
}
