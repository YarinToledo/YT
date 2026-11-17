import { tradePnl } from '../lib/calc'
import { dateTime, money, qty, signedMoney, tone } from '../lib/format'
import { useStore } from '../lib/store'

interface Event { at: string; title: string; detail: string; value: string; cls: string }

export default function ActivityFeed({ limit = 6 }: { limit?: number }) {
  const { trades, settings } = useStore()
  const events: Event[] = []
  for (const t of trades) {
    const openedDirectly = t.opened_at != null && Math.abs(new Date(t.opened_at).getTime() - new Date(t.created_at).getTime()) < 60_000
    if (!openedDirectly) events.push({ at: t.created_at, title: `${t.symbol} ${t.direction.toLowerCase()} planned`, detail: `${qty(t.quantity)} @ ${money(t.entry_price)} · ${dateTime(t.created_at)}`, value: 'PLANNED', cls: '' })
    if (t.opened_at) events.push({ at: t.opened_at, title: `${t.symbol} position opened`, detail: `${qty(t.quantity)} @ ${money(t.entry_price)} · ${dateTime(t.opened_at)}`, value: 'OPEN', cls: 'positive' })
    if (t.status === 'CLOSED' && t.closed_at) {
      const p = tradePnl(t)
      events.push({ at: t.closed_at, title: `${t.symbol} closed`, detail: `Exit ${money(t.exit_price)} · ${dateTime(t.closed_at)}`, value: signedMoney(p), cls: tone(p) })
    }
    if (t.status === 'CANCELLED') events.push({ at: t.created_at, title: `${t.symbol} cancelled`, detail: dateTime(t.created_at), value: 'CANCELLED', cls: 'negative' })
  }
  events.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <article className="card">
      <div className="card-head"><div className="card-title">Recent Activity</div><span className="subtle">LATEST</span></div>
      <div className="activity">
        {events.slice(0, limit).map((e, i) => (
          <div className="activity-item" key={i}>
            <div>{e.title}<small>{e.detail}</small></div>
            <div className={`activity-val ${e.cls}`}>{e.value}</div>
          </div>
        ))}
        {events.length === 0 && (
          <div className="activity-item"><div>Portfolio initialized<small>Starting balance · {money(settings.starting_capital)}</small></div><div className="activity-val">—</div></div>
        )}
      </div>
    </article>
  )
}
