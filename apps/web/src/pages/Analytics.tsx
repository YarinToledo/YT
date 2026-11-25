import EquityChart from '../components/EquityChart'
import ExpectancyCard from '../components/ExpectancyCard'
import MonthlySummary from '../components/MonthlySummary'
import { useT } from '../lib/i18n'
import { tradeStats, type TradeStats } from '../lib/calc'
import { money, pct, rMult, signedMoney, tone } from '../lib/format'
import { useStore } from '../lib/store'
import type { Trade } from '../lib/types'

function Breakdown({ title, col, groups }: { title: string; col: string; groups: [string, TradeStats][] }) {
  const t = useT()
  return (
    <section className="card table-card">
      <div className="card-head"><div className="card-title">{title}</div></div>
      {groups.length === 0 ? <div className="empty" style={{ marginTop: 18 }}>{t('No closed trades yet.')}</div> : (
        <div className="table-scroll" style={{ marginTop: 18 }}>
          <table>
            <thead><tr><th>{col}</th><th className="num">{t('Trades')}</th><th className="num">{t('Win rate')}</th><th className="num">{t('Avg R')}</th><th className="num">{t('Net P&L')}</th></tr></thead>
            <tbody>
              {groups.map(([k, s]) => (
                <tr key={k}>
                  <td className="ticker">{t(k)}</td>
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
  const t = useT()
  const s = tradeStats(trades)
  const pf = s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)
  const cards: [string, string, string, string?][] = [
    [t('Net realized P&L'), signedMoney(s.net), t('{n} closed trades', { n: s.closed }), tone(s.net)],
    [t('Win rate'), pct(s.winRate, 0), t('{w} wins · {l} losses', { w: s.wins, l: s.losses })],
    [t('Profit factor'), pf, t('Gross profit ÷ gross loss')],
    [t('Expectancy'), s.expectancy == null ? '—' : signedMoney(s.expectancy), t('Average P&L per trade'), tone(s.expectancy ?? 0)],
    [t('Average R'), rMult(s.avgR), t('P&L ÷ initial risk'), tone(s.avgR ?? 0)],
    [t('Average win'), money(s.avgWin), t('Best {v}', { v: s.best == null ? '—' : signedMoney(s.best) }), 'positive'],
    [t('Average loss'), money(s.avgLoss), t('Worst {v}', { v: s.worst == null ? '—' : signedMoney(s.worst) }), 'negative'],
    [t('Gross profit / loss'), `${money(s.grossProfit)}`, t('Loss {v}', { v: money(s.grossLoss) })],
  ]
  return (
    <div className="stack">
      <section className="grid metrics" style={{ marginBottom: 0 }}>
        {cards.map(([label, value, foot, cls]) => (
          <article className="card" key={label}><div className="metric-label">{label}</div><div className={`metric-value ${cls ?? ''}`}>{value}</div><div className="metric-foot">{foot}</div></article>
        ))}
      </section>
      <EquityChart days={90} />
      <MonthlySummary />
      <ExpectancyCard />
      <section className="grid two-col">
        <Breakdown title={t('By symbol')} col={t('Symbol')} groups={groupBy(trades, x => x.symbol)} />
        <Breakdown title={t('By setup')} col={t('Setup')} groups={groupBy(trades, x => x.setup ?? 'Untagged')} />
      </section>
      <Breakdown title={t('By direction')} col={t('Direction')} groups={groupBy(trades, x => x.direction)} />
    </div>
  )
}
