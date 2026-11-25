import { useStore } from '../lib/store'
import { useT } from '../lib/i18n'
import { isDemo, resetDemo, supabase } from '../lib/data'
import { tradePnl } from '../lib/calc'
import type { Trade } from '../lib/types'
import { SettingsFields } from './Risk'

export function downloadTradesCsv(trades: Trade[]) {
  const cols = ['symbol', 'company', 'direction', 'status', 'entry_price', 'stop_loss', 'take_profit', 'quantity', 'exit_price', 'best_price', 'eod_price', 'fees', 'pnl', 'opened_at', 'closed_at', 'setup', 'notes', 'created_at'] as const
  const esc = (v: unknown) => {
    if (v == null) return ''
    let s = String(v)
    if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s // guard against spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = trades.map(t => cols.map(c => esc(c === 'pnl' ? (t.status === 'CLOSED' ? tradePnl(t).toFixed(2) : '') : t[c])).join(','))
  const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `tradepilot-trades-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Settings({ email }: { email: string | null }) {
  const { settings, trades, saveSettings } = useStore()
  const t = useT()
  return (
    <section className="grid two-col">
      <div className="stack">
        <article className="card">
          <div className="card-head"><div><div className="card-title">{t('Account')}</div><div className="subtle">{t('Equity = starting capital + realized P&L')}</div></div></div>
          <SettingsFields fields={[{ key: 'starting_capital', label: 'Starting capital ($)', min: 0, hint: 'Change this if you deposit or withdraw.' }]} />
          <label className="check" style={{ marginTop: 16 }}>
            <input type="checkbox" checked={settings.fractional_shares} onChange={e => saveSettings({ ...settings, fractional_shares: e.target.checked }).catch(() => {})} />
            {t('Allow fractional shares in position sizing')}
          </label>
        </article>
        <article className="card">
          <div className="card-head"><div className="card-title">{t('Data')}</div></div>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => downloadTradesCsv(trades)}>{t('Export trades (CSV)')}</button>
            {isDemo && <button className="btn danger" onClick={() => { if (confirm(t('Erase all demo data in this browser and restore the sample trades?'))) { resetDemo(); location.reload() } }}>{t('Reset demo data')}</button>}
          </div>
        </article>
      </div>
      <article className="card">
        <div className="card-head"><div className="card-title">{t('Session')}</div></div>
        <dl className="kv">
          <dt>{t('Mode')}</dt><dd>{isDemo ? t('Demo · browser storage') : 'Supabase'}</dd>
          <dt>{t('Signed in as')}</dt><dd>{email ?? '—'}</dd>
          <dt>{t('Trades stored')}</dt><dd>{trades.length}</dd>
          <dt>{t('Market data')}</dt><dd>{t('Not connected')}</dd>
          <dt>{t('Broker')}</dt><dd>{t('Not connected')}</dd>
        </dl>
        {isDemo ? (
          <div className="risk-note">{t('Demo mode stores data only in this browser. Add your Supabase URL and anon key to apps/web/.env to sync across devices.')}</div>
        ) : (
          <div style={{ marginTop: 18 }}><button className="btn secondary" onClick={() => supabase!.auth.signOut()}>{t('Sign out')}</button></div>
        )}
      </article>
    </section>
  )
}
