import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import RiskPanel from '../components/RiskPanel'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { fetchMarketData, type MarketData, type CacheInfo } from '../lib/market'
import { backtest, portfolioStress, reviewJournal, type BacktestConfig, type BacktestResult } from '../lib/desk'
import { money, pct, qty, ratio } from '../lib/format'
import { normalizeSymbol } from '../lib/validate'
import Analyze from './Analyze'
import HotStocks from './HotStocks'

const SPECIALISTS = [
  { id: 'scout', title: 'Opportunity scout', detail: 'Scan and filter', icon: 'hot', method: 'Market screen' },
  { id: 'technical', title: 'Technical analyst', detail: 'Daily and weekly trends', icon: 'analyze', method: 'Calculated' },
  { id: 'news', title: 'News researcher', detail: 'Business, news and catalysts', icon: 'research', method: 'AI on demand' },
  { id: 'backtest', title: 'Strategy tester', detail: 'Test explicit trading rules', icon: 'analytics', method: 'Historical simulation' },
  { id: 'risk', title: 'Portfolio risk manager', detail: 'Exposure and a 20% stress test', icon: 'risk', method: 'Your saved portfolio' },
  { id: 'journal', title: 'Journal reviewer', detail: 'Learn from your last 20 trades', icon: 'journal', method: 'Your recorded trades' },
] as const

function useDeskData() {
  const [params, setParams] = useSearchParams()
  const symbol = params.get('s') ?? ''
  const [input, setInput] = useState(symbol)
  const [data, setData] = useState<(MarketData & { cache?: CacheInfo }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState<{ symbol: string; n: number } | null>(null)
  useEffect(() => {
    let alive = true
    setInput(symbol); setData(null); setError('')
    if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) { setLoading(false); return }
    setLoading(true)
    fetchMarketData(symbol, refresh?.symbol === symbol).then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError((e as Error).message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [symbol, refresh])
  function submit(e: FormEvent) {
    e.preventDefault()
    const s = normalizeSymbol(input)
    if (/^[A-Z0-9.\-]{1,12}$/.test(s)) {
      if (s === symbol) setRefresh(r => ({ symbol: s, n: (r?.n ?? 0) + 1 }))
      else setParams(p => { p.set('s', s); return p })
    }
  }
  return { symbol, input, setInput, data, loading, error, submit }
}

function StrategyTester() {
  const t = useT(), { settings } = useStore()
  const { symbol, input, setInput, data, loading, error, submit } = useDeskData()
  const [config, setConfig] = useState<BacktestConfig>({ strategy: 'cross', fast: 20, slow: 50, stopPct: 5,
    rewardRisk: settings.min_reward_risk, maxHold: 20, capital: settings.starting_capital,
    riskPct: settings.risk_per_trade_pct, feeBps: 10, slippageBps: 5, fractional: settings.fractional_shares })
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null), [failure, setFailure] = useState('')
  // Never show a result for a previously selected symbol or provider response.
  useEffect(() => { setResult(null); setFailure(''); setFrom(''); setTo('') }, [data, symbol])
  function update<K extends keyof BacktestConfig>(k: K, v: BacktestConfig[K]) { setConfig(c => ({ ...c, [k]: v })); setResult(null); setFailure('') }
  function run() {
    setFailure(''); setResult(null)
    try {
      if (!data) return
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      const sample = data.bars.filter(b => b.date < today && (!from || b.date >= from) && (!to || b.date <= to))
      setResult(backtest(sample, config))
    } catch (e) { setFailure((e as Error).message) }
  }
  const fields: { key: keyof Omit<BacktestConfig, 'strategy' | 'fractional'>; label: string; step?: number; min: number; max?: number }[] = [
    { key: 'fast', label: 'Fast average / breakout lookback', min: 2, max: 249, step: 1 },
    { key: 'slow', label: 'Slow average', min: 3, max: 250, step: 1 },
    { key: 'stopPct', label: 'Stop distance (%)', min: 0.1, max: 99 },
    { key: 'rewardRisk', label: 'Target in R', min: 0.1 },
    { key: 'maxHold', label: 'Maximum holding sessions', min: 1, max: 252, step: 1 },
    { key: 'capital', label: 'Simulation capital ($)', min: 1 },
    { key: 'riskPct', label: 'Risk per trade (%)', min: 0.1, max: 100 },
    { key: 'feeBps', label: 'Fee per side (bps)', min: 0, max: 100 },
    { key: 'slippageBps', label: 'Slippage per side (bps)', min: 0, max: 100 },
  ]
  const reasons = { stop: 'Stop loss', target: 'Take profit', signal: 'Average exit signal', time: 'Holding limit', end: 'End of sample' }
  return <section className="stack">
    <article className="card">
      <h2 className="card-title">{t('Strategy tester')}</h2>
      <p>{t('Choose explicit rules. Signals use completed daily bars and enter at the next session open.')}</p>
      <form className="analyze-form" onSubmit={submit}>
        <label className="desk-symbol">{t('Symbol')}<input className="search" value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="GOOGL" maxLength={12} /></label>
        <button className="btn" disabled={loading || !/^[A-Z0-9.\-]{1,12}$/.test(normalizeSymbol(input))}>{t(loading ? 'Loading…' : 'Load price history')}</button>
      </form>
      {error && <p className="risk-note danger" role="alert">{t(error)}</p>}
      {data && <>
        <p className="subtle">FMP · {t('Data as of {d}', { d: new Date(data.fetchedAt).toLocaleString() })} · {t('{n} daily bars loaded', { n: data.bars.length })}</p>
        {data.cache?.stale && <p className="warning">{t('Using a saved provider snapshot; this is historical analysis, not a current signal.')}</p>}
        <div className="form-grid desk-form">
          <div className="field"><label htmlFor="desk-strategy">{t('Strategy')}</label><select id="desk-strategy" value={config.strategy} onChange={e => update('strategy', e.target.value as BacktestConfig['strategy'])}>
            <option value="cross">{t('Moving-average crossover')}</option><option value="breakout">{t('Close above prior highs')}</option>
          </select></div>
          {fields.filter(f => config.strategy === 'cross' || f.key !== 'slow').map(f => <div className="field" key={f.key}><label htmlFor={`desk-${f.key}`}>{t(f.label)}</label><input id={`desk-${f.key}`} type="number" value={config[f.key]} min={f.min} max={f.max} step={f.step ?? 'any'} onChange={e => update(f.key, Number(e.target.value))} /></div>)}
          <div className="field"><label htmlFor="desk-from">{t('Sample from')}</label><input id="desk-from" type="date" value={from} onChange={e => { setFrom(e.target.value); setResult(null) }} /></div>
          <div className="field"><label htmlFor="desk-to">{t('Sample through')}</label><input id="desk-to" type="date" value={to} onChange={e => { setTo(e.target.value); setResult(null) }} /></div>
        </div>
        <p>{t(config.strategy === 'cross' ? 'Enter when the fast average crosses above the slow average; exit on the reverse signal, stop, target or holding limit.' : 'Enter after a close above the previous lookback highs; exit at the stop, target or holding limit.')}</p>
        <p className="subtle">{t('One position, cash capped, no leverage. Uses your fractional-share setting. 1 bp = 0.01%. Same-bar stop and target assumes the stop first; opening gaps can exceed planned risk.')}</p>
        <button className="btn" type="button" onClick={run}>{t('Run backtest')}</button>
      </>}
      {failure && <p className="risk-note danger" role="alert">{t(failure)}</p>}
    </article>
    {result && <article className="card" aria-live="polite">
      <h2 className="card-title">{symbol} · {t('Simulation results')}</h2>
      <p>{result.start} — {result.end} · {t('Warmup excluded. The current market date is excluded; the last position is closed at the sample end.')}</p>
      <div className="desk-metrics">
        <Metric label={t('Closed trades')} value={String(result.trades.length)} /><Metric label={t('Net return')} value={pct(result.returnPct)} />
        <Metric label={t('Win rate')} value={pct(result.winRate)} /><Metric label="Profit Factor" value={result.profitFactor === Infinity ? '∞' : result.profitFactor?.toFixed(2) ?? '—'} />
        <Metric label={t('Maximum EOD drawdown')} value={pct(result.maxDrawdown)} /><Metric label={t('Buy-and-hold return')} value={pct(result.benchmarkReturn)} />
      </div>
      {!result.trades.length && <p className="empty">{t('No trades matched these rules in this sample.')}</p>}
      <p className="warning">{t('In-sample results, not proof of an edge. Uses provider OHLC data; corporate-action adjustments are not independently verified. Drawdown measures daily closes, not intraday lows. Buy-and-hold uses the same test dates and costs.')}</p>
      {!!result.trades.length && <div className="table-scroll"><table><caption>{t('Most recent simulated trades (up to 20)')}</caption><thead><tr><th>{t('Entry')}</th><th>{t('Exit')}</th><th>{t('Reason')}</th><th className="num">{t('Qty')}</th><th className="num">{t('Net P&L')}</th><th className="num">R</th></tr></thead><tbody>
        {result.trades.slice(-20).map((tr, i) => <tr key={i}><td>{tr.entryDate}<small className="company">{money(tr.entry)}</small></td><td>{tr.exitDate}<small className="company">{money(tr.exit)}</small></td><td>{t(reasons[tr.reason])}</td><td className="num">{qty(tr.quantity)}</td><td className={`num ${tr.pnl >= 0 ? 'positive' : 'negative'}`}>{money(tr.pnl)}</td><td className="num">{tr.r.toFixed(2)}</td></tr>)}
      </tbody></table></div>}
    </article>}
  </section>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="desk-metric"><span>{label}</span><b dir="ltr">{value}</b></div>
}

function PortfolioRisk() {
  const t = useT(), { settings, trades } = useStore()
  const s = useMemo(() => portfolioStress(trades, settings), [trades, settings])
  return <section className="grid two-col">
    <article className="card">
      <h2 className="card-title">{t('Portfolio risk manager')}</h2>
      <p>{t('A simultaneous 20% price decline across recorded open positions. Uses entry costs and realized account equity, not live marks or measured correlations.')}</p>
      <div className="desk-metrics"><Metric label={t('Recorded gross exposure')} value={money(s.gross)} /><Metric label={t('Open stop risk')} value={money(s.openRisk)} /><Metric label={t('Stress P&L')} value={money(s.shock)} /><Metric label={t('Illustrative equity after shock')} value={money(s.stressedEquity)} /></div>
      {!s.allocations.length ? <p className="empty">{t('No recorded open positions to stress.')}</p> : <div className="table-scroll"><table><caption>{t('Concentration by symbol · entry cost')}</caption><thead><tr><th>{t('Symbol')}</th><th className="num">{t('Exposure')}</th><th className="num">{t('Share of gross exposure')}</th></tr></thead><tbody>{s.allocations.map(a => <tr key={a.symbol}><td className="ticker">{a.symbol}</td><td className="num">{money(a.value)}</td><td className="num">{pct(a.weight)}</td></tr>)}</tbody></table></div>}
      <p className="warning">{t('This scenario assumes no stop fills and no rebalancing. It is not a forecast or a maximum loss. Shared sector and AI exposure can remain across different tickers; the table does not measure that overlap.')}</p>
      <Link className="btn secondary" to="/risk">{t('Review account limits')}</Link>
    </article>
    <RiskPanel />
  </section>
}

function JournalReview() {
  const t = useT(), { trades, settings } = useStore()
  const r = useMemo(() => reviewJournal(trades, settings.min_reward_risk), [trades, settings.min_reward_risk])
  const rules = [
    r.noSetup ? 'Record a setup before the next entry; compare results by setup.' : 'Keep recording the setup before every entry.',
    r.belowRR || r.missingTarget ? 'Write the target and verify the current minimum R:R before entry.' : 'Keep validating the planned R:R before entry.',
    r.overStop ? 'Review losses beyond initial stop risk against fills, gaps and fees.' : 'Review actual losses and fees against initial stop risk after every close.',
  ]
  return <article className="card">
    <h2 className="card-title">{t('Journal reviewer')}</h2>
    <p>{t('Reviews up to 20 most recently closed, dated trades across your account. Observations use recorded prices and notes; emotions and missed opportunities cannot be inferred.')}</p>
    {!r.recent.length ? <div className="empty">{t('Close and record a trade to begin your journal review.')}</div> : <>
      <div className="desk-metrics"><Metric label={t('Closed trades')} value={String(r.stats.closed)} /><Metric label={t('Net P&L')} value={money(r.stats.net)} /><Metric label={t('Win rate')} value={pct(r.stats.winRate)} /><Metric label={t('Average R')} value={r.stats.avgR?.toFixed(2) ?? '—'} /></div>
      <dl className="kv"><dt>{t('Missing setup label')}</dt><dd>{r.noSetup}</dd><dt>{t('Below current minimum R:R ({rr})', { rr: ratio(settings.min_reward_risk) })}</dt><dd>{r.belowRR}</dd><dt>{t('Missing planned target')}</dt><dd>{r.missingTarget}</dd><dt>{t('Net loss beyond 1.05R')}</dt><dd>{r.overStop}</dd></dl>
      <p className="subtle">{t('The R:R comparison uses your current setting; it does not prove a rule was broken at the time. Losses beyond 1R can reflect fees, slippage or gaps.')}</p>
      <h3>{t('Three rules for your next trades')}</h3><ul className="signals">{rules.map(rule => <li key={rule}>{t(rule)}</li>)}</ul>
      <div className="table-scroll"><table><caption>{t('Observed results by recorded setup')}</caption><thead><tr><th>{t('Setup')}</th><th className="num">{t('Closed trades')}</th><th className="num">{t('Net P&L')}</th></tr></thead><tbody>{r.groups.map(g => <tr key={g.setup}><td>{t(g.setup)}</td><td className="num">{g.count}</td><td className="num">{money(g.pnl)}</td></tr>)}</tbody></table></div>
      <p className="subtle">{t('Small samples describe these trades only; they do not establish an advantage.')}</p>
    </>}
    {r.excluded > 0 && <p className="warning">{t('{n} records excluded because prices or fees were incomplete.', { n: r.excluded })}</p>}
    <Link className="btn secondary" to="/journal">{t('Open trade journal')}</Link>
  </article>
}

export default function Agents() {
  const t = useT(), [params, setParams] = useSearchParams()
  const selected = SPECIALISTS.find(s => s.id === params.get('tool')) ?? SPECIALISTS[1]
  return <div className="stack desk">
    <article className="card desk-intro">
      <div className="eyebrow">TRADEPILOT / RESEARCH DESK</div>
      <h2>{t('Six specialists. One trading process.')}</h2>
      <p>{t('Find candidates, examine the evidence, test your rules and learn from your trades.')}</p>
      <p className="subtle">{t('AI research runs only when requested. Market screens and calculations are identified separately; no brokerage orders are sent.')}</p>
      <div className="desk-specialists" aria-label={t('Choose a specialist')}>
        {SPECIALISTS.map(s => <button type="button" key={s.id} className={`desk-specialist${s.id === selected.id ? ' selected' : ''}`} aria-pressed={s.id === selected.id} onClick={() => setParams(p => { p.set('tool', s.id); return p })}>
          <span className="desk-specialist-top"><Icon name={s.icon} size={22} /><small>{t(s.method)}</small></span><b>{t(s.title)}</b><span>{t(s.detail)}</span>
        </button>)}
      </div>
    </article>
    <section className="stack" aria-label={t(selected.title)} key={selected.id}>
      {selected.id === 'scout' && <><p className="desk-context">{t('Candidates must pass your filters. Zero matches is a valid result; a passing screen is not a probability of profit.')}</p><HotStocks /></>}
      {selected.id === 'technical' && <Analyze focus="technical" />}
      {selected.id === 'news' && <><p className="desk-context">{t('Load a symbol, then request the AI review. Check retrieved sources and report dates before acting; AI confidence is not a measured success rate.')}</p><Analyze focus="news" /></>}
      {selected.id === 'backtest' && <StrategyTester />}
      {selected.id === 'risk' && <PortfolioRisk />}
      {selected.id === 'journal' && <JournalReview />}
    </section>
  </div>
}
