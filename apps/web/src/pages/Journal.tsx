import { useState } from 'react'
import { useStore } from '../lib/store'
import type { Trade, TradeStatus } from '../lib/types'
import { rMultiple, tradePnl } from '../lib/calc'
import { px, qty, rMult, shortDate, signedMoney, tone } from '../lib/format'
import { useTradeDialog } from '../components/TradeDialog'
import { downloadTradesCsv } from './Settings'

const FILTERS: ('ALL' | TradeStatus)[] = ['ALL', 'CLOSED', 'OPEN', 'PLANNED', 'CANCELLED']

export default function Journal() {
  const { trades, deleteTrade } = useStore()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [q, setQ] = useState('')
  const [dialog, openDialog] = useTradeDialog()

  const rows = trades
    .filter(t => filter === 'ALL' || t.status === filter)
    .filter(t => !q || t.symbol.includes(q.toUpperCase()) || (t.setup ?? '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.closed_at ?? b.opened_at ?? b.created_at).localeCompare(a.closed_at ?? a.opened_at ?? a.created_at))

  async function remove(t: Trade) {
    if (!confirm(`Permanently delete this ${t.symbol} trade? This cannot be undone.`)) return
    await deleteTrade(t.id).catch(() => {})
  }

  const count = (f: (typeof FILTERS)[number]) => (f === 'ALL' ? trades.length : trades.filter(t => t.status === f).length)

  return (
    <section className="card table-card">
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {FILTERS.map(f => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase()} · {count(f)}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <input className="search" placeholder="Search symbol or setup" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn secondary" onClick={() => downloadTradesCsv(trades)}>Export CSV</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty">No trades match.</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Date</th><th>Instrument</th><th>Dir</th><th>Setup</th><th className="num">Entry</th><th className="num">Exit</th>
              <th className="num">Qty</th><th className="num">P&amp;L</th><th className="num">R</th><th>Status</th><th>Notes</th><th className="num">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map(t => {
                const p = tradePnl(t)
                return (
                  <tr key={t.id}>
                    <td>{shortDate(t.closed_at ?? t.opened_at ?? t.created_at)}</td>
                    <td><span className="ticker">{t.symbol}</span>{t.company && <span className="company">{t.company}</span>}</td>
                    <td>{t.direction}</td>
                    <td>{t.setup ?? '—'}</td>
                    <td className="num">{px(t.entry_price)}</td>
                    <td className="num">{px(t.exit_price)}</td>
                    <td className="num">{qty(t.quantity)}</td>
                    <td className={`num ${tone(p)}`}>{t.status === 'CLOSED' ? signedMoney(p) : '—'}</td>
                    <td className={`num ${tone(p)}`}>{rMult(rMultiple(t))}</td>
                    <td><span className={`pill ${t.status}`}>{t.status}</span></td>
                    <td title={t.notes ?? ''} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.notes ?? '—'}</td>
                    <td>
                      <div className="row-actions">
                        {t.status === 'OPEN' && <button className="btn sm" onClick={() => openDialog(t, 'close')}>Close</button>}
                        <button className="btn sm secondary" onClick={() => openDialog(t, 'edit')}>Edit</button>
                        <button className="btn sm danger" onClick={() => remove(t)} aria-label={`Delete ${t.symbol} trade`}>Delete</button>
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
