import { useState } from 'react'
import { supabase } from '../lib/data'
import { Brand } from '../components/Layout'

export default function Login() {
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
        <Brand />
        <div className="field"><label>Email</label><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="field"><label>Password</label><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="subtle" style={{ marginTop: 16 }}>Single-user app. Create your login in Supabase → Authentication → Users.</p>
      </form>
    </div>
  )
}
