import { useRef } from 'react'
import EquityChart from '../components/EquityChart'
import RiskPanel from '../components/RiskPanel'
import PositionsTable from '../components/PositionsTable'
import TradePlanner from '../components/TradePlanner'
import ActivityFeed from '../components/ActivityFeed'
import { tradeStats } from '../lib/calc'
import { money, pct, signedMoney, tone } from '../lib/format'
import { useStore } from '../lib/store'

export function MetricCards() {
  const { settings, trades, usage } = useStore()
  const s = tradeStats(trades)
  const ret = s.net / settings.starting_capital
  return (
    <section className="grid metrics">
      <article className="card"><div className="metric-label">Portfolio equity</div><div className="metric-value">{money(usage.equity)}</div><div className="metric-foot">Started at {money(settings.starting_capital)}</div></article>
      <article className="card"><div className="metric-label">Total P&amp;L</div><div className={`metric-value ${tone(s.net)}`}>{signedMoney(s.net)}</div><div className="metric-foot">{pct(ret)} return · realized</div></article>
      <article className="card"><div className="metric-label">Win rate</div><div className="metric-value">{pct(s.winRate, 0)}</div><div className="metric-foot">{s.wins}W · {s.losses}L · {s.closed} closed</div></article>
      <article className="card"><div className="metric-label">Open positions</div><div className={`metric-value ${usage.positionsFull ? 'warn' : ''}`}>{String(usage.openCount).padStart(2, '0')}</div><div className="metric-foot">Maximum {settings.max_open_positions} positions</div></article>
    </section>
  )
}

export default function Overview() {
  const { trades } = useStore()
  const planner = useRef<HTMLElement>(null)
  const active = trades
    .filter(t => t.status === 'OPEN' || t.status === 'PLANNED')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'OPEN' ? -1 : 1))
  return (
    <>
      <MetricCards />
      <section className="grid main-grid">
        <EquityChart />
        <RiskPanel />
      </section>
      <PositionsTable
        title="Open Positions"
        subtitle="Open and planned trades · manual entry"
        trades={active}
        action={<button className="btn" onClick={() => planner.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>＋ New trade</button>}
      />
      <section className="grid bottom-grid">
        <TradePlanner ref={planner} />
        <ActivityFeed />
      </section>
    </>
  )
}
