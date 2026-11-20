import type { ReactNode } from 'react'
import { useStore } from '../lib/store'
import type { Trade } from '../lib/types'
import { plannedRR, tradeRisk } from '../lib/calc'
import { money, px, qty, ratio, shortDate } from '../lib/format'
import { useTradeDialog } from './TradeDialog'
import { useT } from '../lib/i18n'

export function openBlockReason(u: ReturnType<typeof useStore>['usage']): string | null {
  if (u.weeklyLocked) return 'Weekly loss limit reached'
  if (u.dailyLocked) return 'Daily loss limit reached'
  if (u.positionsFull) return 'Maximum open positions reached'
  return null
}

export default function PositionsTable({ title, subtitle, action, trades }: { title: string; subtitle: string; action?: ReactNode; trades: Trade[] }) {
  const { usage, updateTrade } = useStore()
  const t_ = useT()
  const [dialog, openDialog] = useTradeDialog()
  const reason = openBlockReason(usage)
  const block = reason && t_(reason)

  async function cancel(t: Trade) {
    if (!confirm(t_('Cancel the planned {s} trade?', { s: t.symbol }))) return
    await updateTrade(t.id, { status: 'CANCELLED' }).catch(() => {})
  }

  return (
    <section className="card table-card">
      <div className="card-head">
        <div><div className="card-title">{title}</div><div className="subtle">{subtitle}</div></div>
        {action}
      </div>
      {trades.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>{t_('No open or planned positions. Use the trade planner to size your next trade.')}</div>
      ) : (
        <div className="table-scroll" style={{ marginTop: 18 }}>
          <table>
            <thead><tr>
              <th>{t_('Instrument')}</th><th>{t_('Direction')}</th><th className="num">{t_('Entry')}</th><th className="num">{t_('Stop loss')}</th><th className="num">{t_('Take profit')}</th>
              <th className="num">{t_('Qty')}</th><th className="num">{t_('Risk')}</th><th className="num">{t_('R:R')}</th><th>{t_('Status')}</th><th className="num">{t_('Actions')}</th>
            </tr></thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id}>
                  <td><span className="ticker">{t.symbol}</span><span className="company">{t.company ?? (t.opened_at ? t_('Opened {d}', { d: shortDate(t.opened_at) }) : t_('Planned {d}', { d: shortDate(t.created_at) }))}</span></td>
                  <td>{t_(t.direction)}</td>
                  <td className="num">{px(t.entry_price)}</td>
                  <td className="num">{px(t.stop_loss)}</td>
                  <td className="num">{px(t.take_profit)}</td>
                  <td className="num">{qty(t.quantity)}</td>
                  <td className="num">{money(tradeRisk(t))}</td>
                  <td className="num">{ratio(plannedRR(t))}</td>
                  <td><span className={`pill ${t.status}`}>{t_(t.status)}</span></td>
                  <td>
                    <div className="row-actions">
                      {t.status === 'PLANNED' && <>
                        <button className="btn sm" disabled={!!block} title={block ?? t_('Record the fill')} onClick={() => openDialog(t, 'open')}>{t_('Open position')}</button>
                        <button className="btn sm secondary" onClick={() => openDialog(t, 'edit')}>{t_('Edit')}</button>
                        <button className="btn sm danger" onClick={() => cancel(t)}>{t_('Cancel')}</button>
                      </>}
                      {t.status === 'OPEN' && <>
                        <button className="btn sm" onClick={() => openDialog(t, 'close')}>{t_('Close')}</button>
                        <button className="btn sm secondary" onClick={() => openDialog(t, 'edit')}>{t_('Edit')}</button>
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
