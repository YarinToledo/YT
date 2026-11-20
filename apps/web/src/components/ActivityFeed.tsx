import { tradePnl } from '../lib/calc'
import { useT } from '../lib/i18n'
import { dateTime, money, qty, signedMoney, tone } from '../lib/format'
import { useStore } from '../lib/store'

interface Event { at: string; title: string; detail: string; value: string; cls: string }

export default function ActivityFeed({ limit = 6 }: { limit?: number }) {
  const { trades, settings } = useStore()
  const tr = useT()
  const events: Event[] = []
  for (const t of trades) {
    const openedDirectly = t.opened_at != null && Math.abs(new Date(t.opened_at).getTime() - new Date(t.created_at).getTime()) < 60_000
    if (!openedDirectly) events.push({ at: t.created_at, title: tr('{s} {d} planned', { s: t.symbol, d: tr(t.direction).toLowerCase() }), detail: `${qty(t.quantity)} @ ${money(t.entry_price)} · ${dateTime(t.created_at)}`, value: tr('PLANNED'), cls: '' })
    if (t.opened_at) events.push({ at: t.opened_at, title: tr('{s} position opened', { s: t.symbol }), detail: `${qty(t.quantity)} @ ${money(t.entry_price)} · ${dateTime(t.opened_at)}`, value: tr('OPEN'), cls: 'positive' })
    if (t.status === 'CLOSED' && t.closed_at) {
      const p = tradePnl(t)
      events.push({ at: t.closed_at, title: tr('{s} closed', { s: t.symbol }), detail: tr('Exit {v} · {d}', { v: money(t.exit_price), d: dateTime(t.closed_at) }), value: signedMoney(p), cls: tone(p) })
    }
    if (t.status === 'CANCELLED') events.push({ at: t.created_at, title: tr('{s} cancelled', { s: t.symbol }), detail: dateTime(t.created_at), value: tr('CANCELLED'), cls: 'negative' })
  }
  events.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <article className="card">
      <div className="card-head"><div className="card-title">{tr('Recent Activity')}</div><span className="subtle">{tr('LATEST')}</span></div>
      <div className="activity">
        {events.slice(0, limit).map((e, i) => (
          <div className="activity-item" key={i}>
            <div>{e.title}<small>{e.detail}</small></div>
            <div className={`activity-val ${e.cls}`}>{e.value}</div>
          </div>
        ))}
        {events.length === 0 && (
          <div className="activity-item"><div>{tr('Portfolio initialized')}<small>{tr('Starting balance · {v}', { v: money(settings.starting_capital) })}</small></div><div className="activity-val">—</div></div>
        )}
      </div>
    </article>
  )
}
