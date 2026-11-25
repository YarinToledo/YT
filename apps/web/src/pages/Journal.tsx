import { useState } from 'react'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { Trade, TradeStatus } from '../lib/types'
import { rAt, rMultiple, targetR, tradePnl } from '../lib/calc'
import { useTargetR } from '../lib/targetR'
import { px, qty, rMult, shortDate, signedMoney, tone } from '../lib/format'
import { useTradeDialog } from '../components/TradeDialog'
import { downloadTradesCsv } from './Settings'

const FILTERS: ('ALL' | TradeStatus)[] = ['ALL', 'CLOSED', 'OPEN', 'PLANNED', 'CANCELLED']

export default function Journal() {
  const { trades, deleteTrade } = useStore()
  const tr = useT()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [q, setQ] = useState('')
  const [dialog, openDialog] = useTradeDialog()
  const [target, setTarget] = useTargetR()

  const rows = trades
    .filter(t => filter === 'ALL' || t.status === filter)
    .filter(t => !q || t.symbol.includes(q.toUpperCase()) || (t.setup ?? '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.closed_at ?? b.opened_at ?? b.created_at).localeCompare(a.closed_at ?? a.opened_at ?? a.created_at))

  async function remove(t: Trade) {
    if (!confirm(tr('Permanently delete this {s} trade? This cannot be undone.', { s: t.symbol }))) return
    await deleteTrade(t.id).catch(() => {})
  }

  const count = (f: (typeof FILTERS)[number]) => (f === 'ALL' ? trades.length : trades.filter(t => t.status === f).length)

  return (
    <section className="card table-card">
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {FILTERS.map(f => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'ALL' ? tr('All') : tr(f)} · {count(f)}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <input className="search" placeholder={tr('Search symbol or setup')} value={q} onChange={e => setQ(e.target.value)} />
          <label className="target-select" title={tr('Target R: the target if the best price reached it, otherwise the end-of-day result')}>{tr('Target')}
            <select value={target} onChange={e => setTarget(Number(e.target.value))}>{[1, 1.5, 2, 2.5, 3, 4].map(x => <option key={x} value={x}>{x}R</option>)}</select>
          </label>
          <button className="btn secondary" onClick={() => downloadTradesCsv(trades)}>{tr('Export CSV')}</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{tr('No trades match.')}</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>{tr('Date')}</th><th>{tr('Instrument')}</th><th>{tr('Dir')}</th><th>{tr('Setup')}</th><th className="num">{tr('Entry')}</th><th className="num">{tr('Exit')}</th>
              <th className="num">{tr('Qty')}</th><th className="num">{tr('P&L')}</th><th className="num">R</th><th className="num" title={tr('How far the trade went in your favor')}>Max R</th><th className="num" title={tr('Where it stood at the end of the day')}>EOD R</th><th className="num" title={tr('Target R: the target if the best price reached it, otherwise the end-of-day result')}>{tr('Target R')} ({target})</th><th>{tr('Status')}</th><th>{tr('Notes')}</th><th className="num">{tr('Actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(t => {
                const p = tradePnl(t)
                return (
                  <tr key={t.id}>
                    <td>{shortDate(t.closed_at ?? t.opened_at ?? t.created_at)}</td>
                    <td><span className="ticker">{t.symbol}</span>{t.company && <span className="company">{t.company}</span>}</td>
                    <td>{tr(t.direction)}</td>
                    <td>{t.setup ?? '—'}</td>
                    <td className="num">{px(t.entry_price)}</td>
                    <td className="num">{px(t.exit_price)}</td>
                    <td className="num">{qty(t.quantity)}</td>
                    <td className={`num ${tone(p)}`}>{t.status === 'CLOSED' ? signedMoney(p) : '—'}</td>
                    <td className={`num ${tone(p)}`}>{rMult(rMultiple(t))}</td>
                    <td className="num">{rMult(rAt(t, t.best_price))}</td>
                    <td className="num">{rMult(rAt(t, t.eod_price))}</td>
                    {(() => { const x = targetR(t, target); return <td className={`num ${tone(x ?? 0)}`}>{rMult(x)}</td> })()}
                    <td><span className={`pill ${t.status}`}>{tr(t.status)}</span></td>
                    <td title={t.notes ?? ''} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes ?? '—'}</td>
                    <td>
                      <div className="row-actions">
                        {t.status === 'OPEN' && <button className="btn sm" onClick={() => openDialog(t, 'close')}>{tr('Close')}</button>}
                        <button className="btn sm secondary" onClick={() => openDialog(t, 'edit')}>{tr('Edit')}</button>
                        <button className="btn sm danger" onClick={() => remove(t)} aria-label={tr('Delete {s} trade', { s: t.symbol })}>{tr('Delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </section>
  )
}
