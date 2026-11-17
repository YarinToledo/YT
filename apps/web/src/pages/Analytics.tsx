import EquityChart from '../components/EquityChart'
import { tradeStats, type TradeStats } from '../lib/calc'
import { money, pct, rMult, signedMoney, tone } from '../lib/format'
import { useStore } from '../lib/store'
import type { Trade } from '../lib/types'

function Breakdown({ title, groups }: { title: string; groups: [string, TradeStats][] }) {
  return (
    <section className="card table-card">
      <div className="card-head"><div className="card-title">{title}</div></div>
      {groups.length === 0 ? <div className="empty" style={{ marginTop: 18 }}>No closed trades yet.</div> : (
        <div className="table-scroll" style={{ marginTop: 18 }}>
          <table>
            <thead><tr><th>{title.replace('By ', '')}</th><th className="num">Trades</th><th className="num">Win rate</th><th className="num">Avg R</th><th className="num">Net P&amp;L</th></tr></thead>
            <tbody>
              {groups.map(([k, s]) => (
                <tr key={k}>
                  <td className="ticker">{k}</td>
                  <td className="num">{s.closed}</td>
                  <td className="num">{pct(s.winRate, 0)}</td>
                  <td className={`num ${tone(s.avgR ?? 0)}`}>{rMult(s.avgR)}</td>
                  <td className={`num ${tone(s.net)}`}>{signedMoney(s.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function groupBy(trades: Trade[], key: (t: Trade) => string): [string, TradeStats][] {
  const m = new Map<string, Trade[]>()
  for (const t of trades.filter(t => t.status === 'CLOSED')) {
    const k = key(t)
    m.set(k, [...(m.get(k) ?? []), t])
  }
  return [...m.entries()].map(([k, ts]) => [k, tradeStats(ts)] as [string, TradeStats]).sort((a, b) => b[1].net - a[1].net)
}

export default function Analytics() {
  const { trades } = useStore()
  const s = tradeStats(trades)
  const pf = s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)
  const cards: [string, string, string, string?][] = [
    ['Net realized P&L', signedMoney(s.net), `${s.closed} closed trades`, tone(s.net)],
    ['Win rate', pct(s.winRate, 0), `${s.wins} wins · ${s.losses} losses`],
    ['Profit factor', pf, 'Gross profit ÷ gross loss'],
    ['Expectancy', s.expectancy == null ? '—' : signedMoney(s.expectancy), 'Average P&L per trade', tone(s.expectancy ?? 0)],
    ['Average R', rMult(s.avgR), 'P&L ÷ initial risk', tone(s.avgR ?? 0)],
    ['Average win', money(s.avgWin), `Best ${s.best == null ? '—' : signedMoney(s.best)}`, 'positive'],
    ['Average loss', money(s.avgLoss), `Worst ${s.worst == null ? '—' : signedMoney(s.worst)}`, 'negative'],
    ['Gross profit / loss', `${money(s.grossProfit)}`, `Loss ${money(s.grossLoss)}`],
  ]
  return (
    <div className="stack">
      <section className="grid metrics" style={{ marginBottom: 0 }}>
        {cards.map(([label, value, foot, cls]) => (
          <article className="card" key={label}><div className="metric-label">{label}</div><div className={`metric-value ${cls ?? ''}`}>{value}</div><div className="metric-foot">{foot}</div></article>
        ))}
      </section>
      <EquityChart days={90} />
      <section className="grid two-col">
        <Breakdown title="By symbol" groups={groupBy(trades, t => t.symbol)} />
        <Breakdown title="By setup" groups={groupBy(trades, t => t.setup ?? 'Untagged')} />
      </section>
      <Breakdown title="By direction" groups={groupBy(trades, t => t.direction)} />
    </div>
  )
}
