import { useRef } from 'react'
import { useT } from '../lib/i18n'
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
  const t = useT()
  const s = tradeStats(trades)
  const ret = s.net / settings.starting_capital
  return (
    <section className="grid metrics">
      <article className="card"><div className="metric-label">{t('Portfolio equity')}</div><div className="metric-value">{money(usage.equity)}</div><div className="metric-foot">{t('Started at {v}', { v: money(settings.starting_capital) })}</div></article>
      <article className="card"><div className="metric-label">{t('Total P&L')}</div><div className={`metric-value ${tone(s.net)}`}>{signedMoney(s.net)}</div><div className="metric-foot">{t('{v} return · realized', { v: pct(ret) })}</div></article>
      <article className="card"><div className="metric-label">{t('Win rate')}</div><div className="metric-value">{pct(s.winRate, 0)}</div><div className="metric-foot">{t('{w}W · {l}L · {c} closed', { w: s.wins, l: s.losses, c: s.closed })}</div></article>
      <article className="card"><div className="metric-label">{t('Open positions')}</div><div className={`metric-value ${usage.positionsFull ? 'warn' : ''}`}>{String(usage.openCount).padStart(2, '0')}</div><div className="metric-foot">{t('Maximum {n} positions', { n: settings.max_open_positions })}</div></article>
    </section>
  )
}

export default function Overview() {
  const { trades } = useStore()
  const t = useT()
  const planner = useRef<HTMLElement>(null)
  const active = trades
    .filter(x => x.status === 'OPEN' || x.status === 'PLANNED')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'OPEN' ? -1 : 1))
  return (
    <>
      <MetricCards />
      <section className="grid main-grid">
        <EquityChart />
        <RiskPanel />
      </section>
      <PositionsTable
        title={t('Open Positions')}
        subtitle={t('Open and planned trades · manual entry')}
        trades={active}
        action={<button className="btn" onClick={() => planner.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{t('＋ New trade')}</button>}
      />
      <section className="grid bottom-grid">
        <TradePlanner ref={planner} />
        <ActivityFeed />
      </section>
    </>
  )
}
