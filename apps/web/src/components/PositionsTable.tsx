import type { ReactNode } from 'react'
import { useStore } from '../lib/store'
import type { Trade } from '../lib/types'
import { plannedRR, tradeRisk } from '../lib/calc'
import { money, px, qty, ratio, shortDate } from '../lib/format'
import { useTradeDialog } from './TradeDialog'

export function openBlockReason(u: ReturnType<typeof useStore>['usage']): string | null {
  if (u.weeklyLocked) return 'Weekly loss limit reached'
  if (u.dailyLocked) return 'Daily loss limit reached'
  if (u.positionsFull) return 'Maximum open positions reached'
  return null
}

export default function PositionsTable({ title, subtitle, action, trades }: { title: string; subtitle: string; action?: ReactNode; trades: Trade[] }) {
  const { usage, updateTrade } = useStore()
  const [dialog, openDialog] = useTradeDialog()
  const block = openBlockReason(usage)

  async function cancel(t: Trade) {
    if (!confirm(`Cancel the planned ${t.symbol} trade?`)) return
    await updateTrade(t.id, { status: 'CANCELLED' }).catch(() => {})
  }

  return (
    <section className="card table-card">
      <div className="card-head">
        <div><div className="card-title">{title}</div><div className="subtle">{subtitle}</div></div>
        {action}
      </div>
      {trades.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>No open or planned positions. Use the trade planner to size your next trade.</div>
      ) : (
        <div className="table-scroll" style={{ marginTop: 18 }}>
          <table>
            <thead><tr>
              <th>Instrument</th><th>Direction</th><th className="num">Entry</th><th className="num">Stop loss</th><th className="num">Take profit</th>
              <th className="num">Qty</th><th className="num">Risk</th><th className="num">R:R</th><th>Status</th><th className="num">Actions</th>
            </tr></thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id}>
                  <td><span className="ticker">{t.symbol}</span><span className="company">{t.company ?? (t.opened_at ? `Opened ${shortDate(t.opened_at)}` : `Planned ${shortDate(t.created_at)}`)}</span></td>
                  <td>{t.direction}</td>
                  <td className="num">{px(t.entry_price)}</td>
                  <td className="num">{px(t.stop_loss)}</td>
                  <td className="num">{px(t.take_profit)}</td>
                  <td className="num">{qty(t.quantity)}</td>
                  <td className="num">{money(tradeRisk(t))}</td>
                  <td className="num">{ratio(plannedRR(t))}</td>
                  <td><span className={`pill ${t.status}`}>{t.status}</span></td>
                  <td>
                    <div className="row-actions">
                      {t.status === 'PLANNED' && <>
                        <button className="btn sm" disabled={!!block} title={block ?? 'Record the fill'} onClick={() => openDialog(t, 'open')}>Open</button>
                        <button className="btn sm secondary" onClick={() => openDialog(t, 'edit')}>Edit</button>
                        <button className="btn sm danger" onClick={() => cancel(t)}>Cancel</button>
                      </>}
                      {t.status === 'OPEN' && <>
                        <button className="btn sm" onClick={() => openDialog(t, 'close')}>Close</button>
                        <button className="btn sm secondary" onClick={() => openDialog(t, 'edit')}>Edit</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </section>
  )
}
