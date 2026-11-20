import { useState } from 'react'
import { useT } from '../lib/i18n'
import RiskPanel from '../components/RiskPanel'
import { useStore } from '../lib/store'
import type { AccountSettings } from '../lib/types'
import { money } from '../lib/format'

type NumKey = { [K in keyof AccountSettings]: AccountSettings[K] extends number ? K : never }[keyof AccountSettings]

export function SettingsFields({ fields }: { fields: { key: NumKey; label: string; hint?: string; step?: string; min: number; max?: number }[] }) {
  const { settings, saveSettings } = useStore()
  const t = useT()
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(f => [f.key, String(settings[f.key])])))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = { ...settings }
    for (const f of fields) {
      const v = Number(draft[f.key])
      if (!Number.isFinite(v) || v < f.min || (f.max != null && v > f.max) || (f.min === 0 && v === 0)) {
        const msg = f.max != null ? `{f} must be between {a} and {b}${f.min === 0 ? ' and above 0' : ''}.` : `{f} must be at least {a}${f.min === 0 ? ' and above 0' : ''}.`
        return setErr(t(msg, { f: t(f.label), a: f.min, b: f.max ?? '' }))
      }
      if (f.key === 'max_open_positions' && !Number.isInteger(v)) return setErr(t('Max open positions must be a whole number.'))
      ;(next[f.key] as number) = v
    }
    setErr(null); setBusy(true)
    try { await saveSettings(next) } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      {fields.map(f => (
        <div className="field" key={f.key}>
          <label>{t(f.label)}</label>
          <input type="number" inputMode="decimal" step={f.step ?? 'any'} min={f.min} max={f.max} value={draft[f.key]} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
          {f.hint && <div className="hint">{t(f.hint)}</div>}
        </div>
      ))}
      {err && <div className="form-result error">{err}</div>}
      <div className="form-actions"><button className="btn" disabled={busy}>{t(busy ? 'Saving…' : 'Save')}</button></div>
    </form>
  )
}

export default function Risk() {
  const { usage } = useStore()
  const t = useT()
  return (
    <section className="grid two-col">
      <article className="card">
        <div className="card-head"><div><div className="card-title">{t('Risk framework')}</div><div className="subtle">{t('Percentages of current equity ({v})', { v: money(usage.equity) })}</div></div></div>
        <SettingsFields fields={[
          { key: 'risk_per_trade_pct', label: 'Risk per trade (%)', min: 0, max: 100, hint: 'Sizes every position in the planner.' },
          { key: 'min_reward_risk', label: 'Minimum reward : risk', min: 0, hint: 'Planner warns below this.' },
          { key: 'daily_loss_limit_pct', label: 'Daily loss limit (%)', min: 0, max: 100, hint: 'Blocks opening positions once hit.' },
          { key: 'weekly_loss_limit_pct', label: 'Weekly loss limit (%)', min: 0, max: 100, hint: 'Week starts Monday.' },
          { key: 'max_open_positions', label: 'Max open positions', min: 1, max: 100, step: '1' },
        ]} />
      </article>
      <RiskPanel />
    </section>
  )
}
