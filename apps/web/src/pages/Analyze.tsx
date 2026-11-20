import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT, type T } from '../lib/i18n'
import { useStore } from '../lib/store'
import { explainDataErrors, fetchMarketData, type CacheInfo, type Fundamentals, type MarketData } from '../lib/market'
import { planPosition } from '../lib/calc'
import { longScenario, sma, technicals, type Bar, type Bias, type Technicals } from '../lib/indicators'
import { compact, qty, money, num2, pct, signedPct, ratio, shortDate, tone } from '../lib/format'
import { normalizeSymbol } from '../lib/validate'
import AiAnalystCard from '../components/AiAnalystCard'

const SYMBOL_RE = /^[A-Z0-9.\-]{1,12}$/

function BiasPill({ bias, t }: { bias: Bias; t: T }) {
  const label = bias === 'bullish' ? t('Bullish') : bias === 'bearish' ? t('Bearish') : t('Neutral')
  return <span className={`bias ${bias}`}>{label}</span>
}

function PriceChart({ bars }: { bars: Bar[] }) {
  const t = useT()
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const W = 700, H = 240
  const closes = bars.map(b => b.close)
  const s50All = sma(closes, 50), s200All = sma(closes, 200)
  const n = Math.min(252, bars.length)
  const view = bars.slice(-n), s50 = s50All.slice(-n), s200 = s200All.slice(-n)
  const vals = [...view.map(b => b.close), ...s50.filter((v): v is number => v != null), ...s200.filter((v): v is number => v != null)]
  let lo = Math.min(...vals), hi = Math.max(...vals)
  const pad = (hi - lo) * 0.08 || 1
  lo -= pad; hi += pad
  const x = (i: number) => (i / Math.max(1, n - 1)) * W
  const y = (v: number) => (1 - (v - lo) / (hi - lo)) * H
  const path = (vs: (number | null)[]) => {
    let d = '', pen = false
    vs.forEach((v, i) => {
      if (v == null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const labels = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * (n - 1)))
  function onMove(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect()
    setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))))
  }
  return (
    <>
      <div className="chart-wrap" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('Price chart')}>
          <path className="chart-grid" d={`M0 1H${W} M0 ${H / 2}H${W} M0 ${H - 1}H${W}`} />
          <path className="chart-ma200" d={path(s200)} />
          <path className="chart-ma50" d={path(s50)} />
          <path className="chart-line" d={path(view.map(b => b.close))} />
        </svg>
        {hover != null && (
          <>
            <div className="chart-cursor" style={{ left: `${(hover / (n - 1)) * 100}%` }} />
            <div className="chart-tip" style={{ left: `${Math.min(85, Math.max(15, (hover / (n - 1)) * 100))}%` }}>
              {shortDate(view[hover].date)} · <b>{money(view[hover].close)}</b>
            </div>
          </>
        )}
      </div>
      <div className="chart-labels">{labels.map(i => <span key={i}>{shortDate(view[i].date)}</span>)}</div>
      <div className="legend">
        <span><i className="swatch price" />{t('Price')}</span>
        <span><i className="swatch ma50" />{t('50-day average')}</span>
        <span><i className="swatch ma200" />{t('200-day average')}</span>
      </div>
    </>
  )
}

function TechnicalCard({ tech, t }: { tech: Technicals; t: T }) {
  const rows: [string, string, string?][] = [
    [t('Trend'), tech.trend === 'up' ? t('Uptrend') : tech.trend === 'down' ? t('Downtrend') : t('Sideways')],
    [t('20-day average'), money(tech.sma20)],
    [t('50-day average'), money(tech.sma50)],
    [t('200-day average'), money(tech.sma200)],
    ['RSI (14)', num2(tech.rsi, 0)],
    ['MACD', tech.macd ? `\u2066${num2(tech.macd.macd)} / ${num2(tech.macd.signal)}\u2069` : '—', tech.macd ? tone(tech.macd.hist) : ''],
    [t('ATR (14) · daily range'), money(tech.atr)],
    [t('Nearest support'), money(tech.support)],
    [t('Nearest resistance'), money(tech.resistance)],
    [t('52-week range'), `\u2066${money(tech.low52)} – ${money(tech.high52)}\u2069`],
  ]
  const perf: [string, number | null][] = [[t('1M'), tech.perf.m1], [t('3M'), tech.perf.m3], [t('6M'), tech.perf.m6], [t('1Y'), tech.perf.y1]]
  return (
    <article className="card">
      <div className="card-head">
        <div><div className="card-title">{t('Technical analysis')}</div><div className="subtle">{t('Daily bars · computed from price history')}</div></div>
        <BiasPill bias={tech.bias} t={t} />
      </div>
      <div className="perf-row">
        {perf.map(([k, v]) => <div key={k}><span>{k}</span><b className={tone(v ?? 0)}>{v == null ? '—' : pct(v, 1)}</b></div>)}
      </div>
      <dl className="kv">{rows.map(([k, v, cls]) => <Fragment key={k}><dt>{k}</dt><dd className={cls}>{v}</dd></Fragment>)}</dl>
      <ul className="signals">
        {tech.signals.map((s, i) => <li key={i} className={s.bias}>{t(s.key, s.vars)}</li>)}
      </ul>
    </article>
  )
}

function fundamentalNotes(f: Fundamentals, growth: number | null): { key: string; vars?: Record<string, string>; bias: Bias }[] {
  const out: { key: string; vars?: Record<string, string>; bias: Bias }[] = []
  if (f.pe != null) out.push(f.pe <= 0 ? { key: 'Negative earnings (no meaningful P/E)', bias: 'bearish' } : f.pe < 15 ? { key: 'P/E {v}: low valuation', vars: { v: f.pe.toFixed(1) }, bias: 'bullish' } : f.pe > 35 ? { key: 'P/E {v}: high valuation, needs strong growth', vars: { v: f.pe.toFixed(1) }, bias: 'bearish' } : { key: 'P/E {v}: moderate valuation', vars: { v: f.pe.toFixed(1) }, bias: 'neutral' })
  if (f.netMargin != null) out.push(f.netMargin >= 0.15 ? { key: 'Net margin {v}: highly profitable', vars: { v: pct(f.netMargin, 1) }, bias: 'bullish' } : f.netMargin < 0 ? { key: 'Net margin {v}: losing money', vars: { v: pct(f.netMargin, 1) }, bias: 'bearish' } : { key: 'Net margin {v}', vars: { v: pct(f.netMargin, 1) }, bias: 'neutral' })
  if (growth != null) out.push(growth >= 0.1 ? { key: 'Revenue grew {v} last year', vars: { v: pct(growth, 1) }, bias: 'bullish' } : growth < 0 ? { key: 'Revenue shrank {v} last year', vars: { v: pct(Math.abs(growth), 1) }, bias: 'bearish' } : { key: 'Revenue grew {v} last year', vars: { v: pct(growth, 1) }, bias: 'neutral' })
  if (f.roe != null) out.push(f.roe >= 0.15 ? { key: 'Return on equity {v}: efficient use of capital', vars: { v: pct(f.roe, 1) }, bias: 'bullish' } : { key: 'Return on equity {v}', vars: { v: pct(f.roe, 1) }, bias: f.roe < 0 ? 'bearish' : 'neutral' })
  if (f.debtToEquity != null && f.debtToEquity > 2) out.push({ key: 'Debt/equity {v}: heavily leveraged', vars: { v: f.debtToEquity.toFixed(2) }, bias: 'bearish' })
  if (f.currentRatio != null && f.currentRatio < 1) out.push({ key: 'Current ratio {v}: short-term liabilities exceed current assets', vars: { v: f.currentRatio.toFixed(2) }, bias: 'bearish' })
  return out
}

function FundamentalCard({ data, t }: { data: MarketData; t: T }) {
  const f = data.fundamentals
  const ys = data.years
  const growth = ys.length >= 2 && ys[ys.length - 2].revenue ? ys[ys.length - 1].revenue! / ys[ys.length - 2].revenue! - 1 : null
  if (!f && ys.length === 0) return <article className="card"><div className="card-title">{t('Fundamental analysis')}</div><div className="empty">{t('No fundamental data available for this symbol.')}</div></article>
  const notes = f ? fundamentalNotes(f, growth) : []
  const score = notes.reduce((a, n) => a + (n.bias === 'bullish' ? 1 : n.bias === 'bearish' ? -1 : 0), 0)
  const bias: Bias = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral'
  const rows: [string, string][] = f ? [
    ['P/E', num2(f.pe, 1)], ['P/S', num2(f.ps, 1)], ['P/B', num2(f.pb, 1)], ['EV/EBITDA', num2(f.evEbitda, 1)],
    [t('Gross margin'), pct(f.grossMargin, 1)], [t('Operating margin'), pct(f.operatingMargin, 1)], [t('Net margin'), pct(f.netMargin, 1)],
    [t('Return on equity'), pct(f.roe, 1)], [t('Debt / equity'), num2(f.debtToEquity)], [t('Current ratio'), num2(f.currentRatio)],
    [t('Dividend yield'), pct(f.dividendYield, 2)], [t('Free cash flow yield'), pct(f.fcfYield, 2)],
  ] : []
  return (
    <article className="card">
      <div className="card-head">
        <div><div className="card-title">{t('Fundamental analysis')}</div><div className="subtle">{t('Trailing twelve months · annual reports')}</div></div>
        {notes.length > 0 && <BiasPill bias={bias} t={t} />}
      </div>
      {rows.length > 0 && <dl className="kv">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>}
      {notes.length > 0 && <ul className="signals">{notes.map((n, i) => <li key={i} className={n.bias}>{t(n.key, n.vars)}</li>)}</ul>}
      {ys.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>{t('Year')}</th><th className="num">{t('Revenue')}</th><th className="num">{t('Net income')}</th><th className="num">EPS</th></tr></thead>
            <tbody>{ys.map(y => <tr key={y.year}><td>{y.year}</td><td className="num">{compact(y.revenue)}</td><td className={`num ${tone(y.netIncome ?? 0)}`}>{compact(y.netIncome)}</td><td className="num">{num2(y.eps)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </article>
  )
}

export default function Analyze() {
  const t = useT()
  const { watchlist, addWatch, settings, usage } = useStore()
  const [params, setParams] = useSearchParams()
  const current = params.get('s')
  const [input, setInput] = useState(current ?? '')
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: (MarketData & { cache?: CacheInfo }) | null }>({ loading: false, error: null, data: null })

  // A refresh press forces a new fetch for that symbol only (switching symbols uses the cache).
  const [reload, setReload] = useState<{ s: string; n: number } | null>(null)
  const force = reload != null && reload.s === current
  useEffect(() => {
    if (!current) return
    setInput(current)
    let alive = true
    setState(s => ({ loading: true, error: null, data: force ? s.data : null }))
    fetchMarketData(current, force)
      .then(data => alive && setState({ loading: false, error: null, data }))
      .catch(e => alive && setState({ loading: false, error: (e as Error).message, data: null }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, reload])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const s = normalizeSymbol(input)
    if (SYMBOL_RE.test(s)) setParams({ s })
  }

  const data = state.data
  const tech = useMemo(() => (data ? technicals(data.bars) : null), [data])
  const scenario = tech ? longScenario(tech, settings.min_reward_risk > 0 ? settings.min_reward_risk : 2) : null
  const sized = scenario ? planPosition({ direction: 'LONG', entry: scenario.entry, stop: scenario.stop, target: scenario.target, equity: usage.equity, riskPct: settings.risk_per_trade_pct, fractional: settings.fractional_shares }) : null
  const p = data?.profile
  const price = p?.price ?? tech?.price ?? null
  // Compact, rounded snapshot of everything above, sent to the AI analyst.
  const aiContext = useMemo(() => {
    if (!data) return null
    const r = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d)
    const lastBars = data.bars.slice(-30).map(b => ({ d: b.date, c: r(b.close), v: Math.round(b.volume) }))
    return {
      profile: data.profile && { ...data.profile, description: data.profile.description?.slice(0, 1500) ?? null, image: undefined },
      technicals: tech && {
        price: r(tech.price), sma20: r(tech.sma20), sma50: r(tech.sma50), sma200: r(tech.sma200), rsi14: r(tech.rsi, 1),
        macd: tech.macd && { macd: r(tech.macd.macd, 3), signal: r(tech.macd.signal, 3), crossedUp: tech.macd.crossedUp, crossedDown: tech.macd.crossedDown },
        atr14: r(tech.atr), high52: r(tech.high52), low52: r(tech.low52), support: r(tech.support), resistance: r(tech.resistance),
        perf: { m1: r(tech.perf.m1, 4), m3: r(tech.perf.m3, 4), m6: r(tech.perf.m6, 4), y1: r(tech.perf.y1, 4) },
        trend: tech.trend, volumeVs50dAvg: r(tech.volRatio), signals: tech.signals.map(s => ({ signal: s.key, vars: s.vars, bias: s.bias })), bias: tech.bias,
      },
      last30Days: lastBars,
      fundamentals: data.fundamentals,
      annual: data.years,
      peers: data.peers,
      appScenario: scenario,
      trader: {
        equityUsd: r(usage.equity), riskPerTradePct: settings.risk_per_trade_pct, rewardRiskRatio: settings.min_reward_risk,
        riskBudgetUsd: r(usage.riskPerTrade), fractionalShares: settings.fractional_shares, longOnly: true,
      },
    }
  }, [data, tech, scenario, settings, usage])
  const inWatchlist = data ? watchlist.some(w => w.symbol === data.symbol) : false

  return (
    <div className="stack">
      <article className="card">
        <form className="analyze-form" onSubmit={submit}>
          <input className="search" value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder={t('Symbol, e.g. NVDA')} maxLength={12} autoCapitalize="characters" list="watch-symbols-a" aria-label={t('Symbol')} />
          <datalist id="watch-symbols-a">{watchlist.map(w => <option key={w.symbol} value={w.symbol}>{w.company}</option>)}</datalist>
          <button className="btn" disabled={state.loading || !SYMBOL_RE.test(normalizeSymbol(input))}>{state.loading ? t('Analyzing…') : t('Analyze')}</button>
        </form>
        {watchlist.length > 0 && (
          <div className="chips">{watchlist.map(w => <button key={w.symbol} type="button" className="chip" onClick={() => setParams({ s: w.symbol })}>{w.symbol}</button>)}</div>
        )}
        <div className="subtle" style={{ marginTop: 12 }}>{t('Technical and fundamental data from Financial Modeling Prep. This is automated analysis for learning and planning, not investment advice.')}</div>
      </article>

      {state.error && <div className="risk-note danger">{t('Could not analyze {s}: {msg}', { s: current ?? '', msg: t(state.error) })}</div>}
      {state.loading && <div className="subtle">{t('Loading market data…')}</div>}

      {data?.cache?.stale && (
        <div className="risk-note">{t('FMP is not answering right now (usually the daily limit), so this is the saved analysis from {d}.', { d: new Date(data.cache.at).toLocaleString() })}</div>
      )}
      {data && data.bars.length === 0 && Object.keys(data.errors).length > 0 && (
        <div className="risk-note danger">{t('No market data for {s}: {msg}', { s: data.symbol, msg: t(explainDataErrors(data.errors) ?? '') })}</div>
      )}
      {data && (
        <>
          <article className="card">
            <div className="stock-head">
              {p?.image && <img src={p.image} alt="" className="stock-logo" onError={e => (e.currentTarget.style.display = 'none')} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="stock-name"><span className="ticker">{data.symbol}</span> {p?.name !== data.symbol && p?.name}</div>
                <div className="subtle">{[p?.exchange, p?.sector, p?.industry].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="stock-price">
                <div className="metric-value">{money(price)}</div>
                {p?.changePct != null && <div className={tone(p.changePct)}>{signedPct(p.changePct / 100)}</div>}
              </div>
            </div>
            <div className="perf-row" style={{ marginTop: 14 }}>
              <div><span>{t('Market cap')}</span><b>{compact(p?.marketCap)}</b></div>
              <div><span>{t('Beta')}</span><b>{num2(p?.beta)}</b></div>
              <div><span>{t('52-week range')}</span><b>{tech ? `\u2066${money(tech.low52)} – ${money(tech.high52)}\u2069` : '—'}</b></div>
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              {!inWatchlist && <button className="btn secondary" onClick={() => addWatch({ symbol: data.symbol, company: p?.name ?? null, note: null }).catch(() => {})}>{t('Add to watchlist')}</button>}
            </div>
            {data.bars.length > 1 ? <div style={{ marginTop: 16 }}><PriceChart bars={data.bars} /></div> : <div className="empty">{t('No price history available.')}</div>}
          </article>

          <AiAnalystCard symbol={data.symbol} context={aiContext} onAnalyze={s => setParams({ s })} />

          <section className="grid two-col">
            {tech ? <TechnicalCard tech={tech} t={t} /> : <article className="card"><div className="card-title">{t('Technical analysis')}</div><div className="empty">{t('Not enough price history for technical analysis.')}</div></article>}
            <FundamentalCard data={data} t={t} />
          </section>

          {scenario && tech && (
            <article className="card">
              <div className="card-head">
                <div><div className="card-title">{t('Trade scenario (long)')}</div><div className="subtle">{t('Stop under nearest support (or 2×ATR) · target at your {rr} ratio · risk {p}% of equity', { rr: ratio(scenario.rr), p: settings.risk_per_trade_pct })}</div></div>
              </div>
              <div className="perf-row">
                <div><span>{t('Entry')}</span><b>{money(scenario.entry)}</b></div>
                <div><span>{t('Stop loss')}</span><b className="negative">{money(scenario.stop)}</b></div>
                <div><span>{t('Target')}</span><b className="positive">{money(scenario.target)}</b></div>
                <div><span>{t('R:R')}</span><b>{ratio(scenario.rr)}</b></div>
                {sized?.ok && <div><span>{t('Position size:')}</span><b>{t('{n} shares', { n: qty(sized.quantity) })}</b></div>}
                {sized?.ok && <div><span>{t('Risk:')}</span><b className="negative">{money(sized.riskAmount)}</b></div>}
              </div>
              {scenario.resistanceInWay != null && <div className="warning" style={{ marginTop: 12 }}>{t('Resistance at {v} sits before the target; price has to break it.', { v: money(scenario.resistanceInWay) })}</div>}
              {tech.bias === 'bearish' && <div className="warning" style={{ marginTop: 12 }}>{t('The technical picture is bearish. A long trade here goes against the trend.')}</div>}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <Link className="btn" style={{ textDecoration: 'none' }} to={`/?symbol=${encodeURIComponent(data.symbol)}&entry=${scenario.entry}&stop=${scenario.stop}&target=${scenario.target}`}>{t('Send to trade planner')}</Link>
              </div>
            </article>
          )}

          <section className="grid two-col">
            <article className="card">
              <div className="card-head"><div className="card-title">{t('About the business')}</div></div>
              <dl className="kv">
                <dt>{t('Sector')}</dt><dd>{p?.sector ?? '—'}</dd>
                <dt>{t('Industry')}</dt><dd>{p?.industry ?? '—'}</dd>
                <dt>{t('Country')}</dt><dd>{p?.country ?? '—'}</dd>
                <dt>CEO</dt><dd>{p?.ceo ?? '—'}</dd>
                <dt>{t('Employees')}</dt><dd>{p?.employees != null ? p.employees.toLocaleString() : '—'}</dd>
                <dt>{t('Website')}</dt><dd>{p?.website ? <a href={p.website} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, '')}</a> : '—'}</dd>
              </dl>
              {p?.description && <p className="description" dir="ltr">{p.description}</p>}
            </article>

            <article className="card table-card">
              <div className="card-head"><div><div className="card-title">{t('Related stocks')}</div><div className="subtle">{t('Peers in the same sector and industry')}</div></div></div>
              {data.peers.length === 0 ? <div className="empty" style={{ marginTop: 18 }}>{t('No peer data available.')}</div> : (
                <div className="table-scroll" style={{ marginTop: 18 }}>
                  <table>
                    <thead><tr><th>{t('Instrument')}</th><th className="num">{t('Price')}</th><th className="num">{t('Market cap')}</th><th className="num">{t('Actions')}</th></tr></thead>
                    <tbody>
                      {data.peers.map(peer => (
                        <tr key={peer.symbol}>
                          <td><span className="ticker">{peer.symbol}</span>{peer.name && <span className="company">{peer.name}</span>}</td>
                          <td className="num">{money(peer.price)}</td>
                          <td className="num">{compact(peer.marketCap)}</td>
                          <td><div className="row-actions"><button className="btn sm secondary" onClick={() => setParams({ s: peer.symbol })}>{t('Analyze')}</button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          {Object.keys(data.errors).length > 0 && (
            <div className="subtle">{t('Some data was unavailable: {list}', { list: Object.keys(data.errors).join(', ') })} · {t(explainDataErrors(data.errors) ?? '')}</div>
          )}
          <div className="subtle">
            {t('Data as of {d}', { d: new Date(data.fetchedAt).toLocaleString() })}
            {data.cache?.cached && !data.cache.stale && ' · ' + t('saved copy, refreshes after 6 hours')}
            {' '}<button type="button" className="btn sm secondary" disabled={state.loading} onClick={() => setReload(r => ({ s: data.symbol, n: (r?.n ?? 0) + 1 }))}>{t('Refresh data')}</button>
          </div>
        </>
      )}
    </div>
  )
}
