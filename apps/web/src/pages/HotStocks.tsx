import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { planPosition } from '../lib/calc'
import { compact, money, qty, ratio, signedPct, times } from '../lib/format'
import { DEFAULT_FILTERS, evaluate, toBars, type Candidate, type ScanFilters } from '../lib/hotstocks'
import { useT } from '../lib/i18n'
import { fetchRanking, fetchScan, type RankResult, type ScanRaw } from '../lib/market'
import { useStore } from '../lib/store'
import LiveSignals from '../components/LiveSignals'
import MiniChart from '../components/MiniChart'
import { detectLeverage, leverageLabel } from '../lib/leveraged'
import type { Bar } from '../lib/indicators'

const FILTERS_KEY = 'tradepilot-hot-filters'
const SCAN_KEY = 'tradepilot-hot-scan'
const RANK_KEY = 'tradepilot-hot-rank'

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback } catch { return fallback }
}
function loadRaw<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null } catch { return null }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage full or blocked */ }
}

const verdictBias = { enter: 'bullish', wait: 'neutral', avoid: 'bearish' } as const

export default function HotStocks() {
  const t = useT()
  const { settings, usage, watchlist, addWatch } = useStore()
  const [filters, setFilters] = useState<ScanFilters>(() => load(FILTERS_KEY, DEFAULT_FILTERS))
  const [scan, setScan] = useState<ScanRaw | null>(() => loadRaw(SCAN_KEY))
  const [rank, setRank] = useState<RankResult | null>(() => loadRaw(RANK_KEY))
  const [busy, setBusy] = useState<'scan' | 'rank' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRejected, setShowRejected] = useState(false)
  const rr = settings.min_reward_risk > 0 ? settings.min_reward_risk : 2

  const barsBySymbol = useMemo(() => {
    const m = new Map<string, Bar[]>()
    for (const c of scan?.candidates ?? []) if (c.bars && c.bars.length > 0) m.set(c.symbol, toBars(c.bars))
    return m
  }, [scan])
  const names = useMemo(() => new Map((scan?.candidates ?? []).map(c => [c.symbol, c.name])), [scan])
  const evaluated = useMemo(() => {
    if (!scan) return [] as Candidate[]
    return scan.candidates
      .filter(c => barsBySymbol.has(c.symbol))
      .filter(c => !(filters.hideLeveraged && detectLeverage(c.symbol, c.name)))
      .map(c => evaluate(c.symbol, c.name, c.source, barsBySymbol.get(c.symbol)!, filters, rr))
      .filter((c): c is Candidate => c != null)
      .sort((a, b) => Number(b.pass) - Number(a.pass) || b.score - a.score)
  }, [scan, barsBySymbol, filters, rr])
  const leveragedCount = useMemo(() => (scan?.candidates ?? []).filter(c => detectLeverage(c.symbol, c.name)).length, [scan])
  const passed = evaluated.filter(c => c.pass)
  const rejected = evaluated.filter(c => !c.pass)
  const picks = new Map((rank?.ranking.picks ?? []).map(p => [p.symbol, p]))
  // When a ranking exists, order the passing stocks by the AI's rank.
  const ordered = rank ? [...passed].sort((a, b) => (picks.get(a.symbol)?.rank ?? 99) - (picks.get(b.symbol)?.rank ?? 99)) : passed

  function setFilter<K extends keyof ScanFilters>(k: K, v: ScanFilters[K]) {
    const next = { ...filters, [k]: v }
    setFilters(next); save(FILTERS_KEY, next)
  }

  async function runScan() {
    setBusy('scan'); setError(null)
    try {
      const s = await fetchScan(watchlist.map(w => w.symbol))
      setScan(s); save(SCAN_KEY, s)
      setRank(null); try { localStorage.removeItem(RANK_KEY) } catch { /* ignore */ }
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function runRank() {
    if (passed.length === 0) return
    setBusy('rank'); setError(null)
    try {
      const candidates = passed.slice(0, 12).map(c => ({
        symbol: c.symbol, name: c.name, date: c.date, price: c.price, changePct: +(c.changePct * 100).toFixed(2),
        relVolume: c.relVolume && +c.relVolume.toFixed(2), closeLocation: +c.closeLocation.toFixed(2), rsi14: c.rsi && +c.rsi.toFixed(1),
        extensionAbove20d: c.extension && +(c.extension * 100).toFixed(1), perf3mPct: c.perf3m && +(c.perf3m * 100).toFixed(1),
        belowHigh52Pct: +(c.fromHigh52 * 100).toFixed(1), atr14: c.atr && +c.atr.toFixed(2), score: c.score, plan: c.plan,
      }))
      const trader = { equityUsd: +usage.equity.toFixed(2), riskPerTradePct: settings.risk_per_trade_pct, rewardRiskRatio: rr, maxOpenPositions: settings.max_open_positions, openPositions: usage.openCount, longOnly: true }
      const r = await fetchRanking(candidates, trader)
      setRank(r); save(RANK_KEY, r)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const filterFields: { k: keyof ScanFilters; label: string; step: string; scale?: number }[] = [
    { k: 'minPrice', label: t('Minimum price ($)'), step: '1' },
    { k: 'minAvgVolume', label: t('Minimum average volume'), step: '100000' },
    { k: 'minRelVolume', label: t('Minimum relative volume (×)'), step: '0.5' },
    { k: 'minCloseLocation', label: t('Close in top of range (%)'), step: '5', scale: 100 },
    { k: 'minChangePct', label: t('Minimum daily gain (%)'), step: '0.5', scale: 100 },
    { k: 'maxExtension', label: t('Max extension above 20-day (%)'), step: '5', scale: 100 },
  ]

  return (
    <div className="stack">
      <LiveSignals />

      <article className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{t('Strategy: momentum swing on stocks in play')}</div>
            <div className="subtle">{t('Run after the US close (23:00 Israel time). Uses end-of-day data.')}</div>
          </div>
          <div className="btn-row">
            <button className="btn" disabled={busy != null} onClick={runScan}>{busy === 'scan' ? t('Scanning…') : t('Run scan')}</button>
          </div>
        </div>
        <ul className="signals">
          <li className="bullish">{t('Unusual volume: at least {v}× the 50-day average, usually because of news', { v: filters.minRelVolume })}</li>
          <li className="bullish">{t('Closed near the high of the day and up on the day')}</li>
          <li className="bullish">{t('In an uptrend: above the 50- and 200-day averages, not over-extended')}</li>
          <li>{t('Entry: buy-stop just above the signal day high. Stop: under the signal day low (max 2×ATR). Target: your {rr} ratio. Size: {p}% risk.', { rr: ratio(rr), p: settings.risk_per_trade_pct })}</li>
        </ul>
        <details className="filters">
          <summary>{t('Filter settings')}</summary>
          <div className="form-grid" style={{ marginTop: 12 }}>
            {filterFields.map(f => (
              <div className="field" key={f.k}>
                <label>{f.label}</label>
                <input type="number" inputMode="decimal" step={f.step} min="0"
                  value={String(+((filters[f.k] as number) * (f.scale ?? 1)).toFixed(4))}
                  onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setFilter(f.k, (v / (f.scale ?? 1)) as never) }} />
              </div>
            ))}
            <label className="check"><input type="checkbox" checked={filters.requireUptrend} onChange={e => setFilter('requireUptrend', e.target.checked)} /> {t('Require uptrend (above 50- and 200-day)')}</label>
            <label className="check"><input type="checkbox" checked={filters.hideLeveraged} onChange={e => setFilter('hideLeveraged', e.target.checked)} /> {t('Hide leveraged and inverse ETFs')}</label>
            <div className="form-actions"><button type="button" className="btn secondary" onClick={() => { setFilters(DEFAULT_FILTERS); save(FILTERS_KEY, DEFAULT_FILTERS) }}>{t('Reset to defaults')}</button></div>
          </div>
        </details>
        {scan && <div className="subtle" style={{ marginTop: 10 }}>{t('Last scan {d} · {n} stocks checked · {p} passed', { d: new Date(scan.fetchedAt).toLocaleString(), n: evaluated.length, p: passed.length })}</div>}
        {scan && filters.hideLeveraged && leveragedCount > 0 && <div className="subtle">{t('{n} leveraged ETFs hidden', { n: leveragedCount })}</div>}
        {scan && Object.keys(scan.errors).length > 0 && <div className="subtle">{t('Some data was unavailable: {list}', { list: Object.entries(scan.errors).map(([k, v]) => `${k} (${v})`).join(', ') })}</div>}
      </article>

      {error && <div className="risk-note danger">{t(error)}</div>}

      {scan && (
        <section className="card table-card">
          <div className="card-head">
            <div><div className="card-title">{t('Hot stocks')}</div><div className="subtle">{t('Stocks that passed every rule, best first')}</div></div>
            <button className="btn" disabled={busy != null || passed.length === 0} onClick={runRank}>{busy === 'rank' ? t('Analyzing…') : rank ? t('Rank again with AI') : t('Rank with AI')}</button>
          </div>
          {busy === 'rank' && <div className="subtle" style={{ padding: '0 20px' }}>{t('The analyst is checking the news behind each move. This can take up to a minute.')}</div>}
          {rank && <div className="risk-note" style={{ margin: '14px 20px 0' }}>{rank.ranking.market_note}</div>}
          {ordered.length === 0 ? (
            <div className="empty" style={{ marginTop: 18 }}>{t('No stock passed all the rules today. That is normal on quiet days; you can loosen the filters.')}</div>
          ) : (
            <div className="hot-list">
              {ordered.map(c => {
                const ai = picks.get(c.symbol)
                const lev = detectLeverage(c.symbol, c.name)
                const levBase = lev && evaluated.find(x => x.symbol === lev.underlying)
                const levKids = evaluated.filter(x => x.symbol !== c.symbol && detectLeverage(x.symbol, names.get(x.symbol))?.underlying === c.symbol)
                const sized = c.plan ? planPosition({ direction: 'LONG', entry: c.plan.entry, stop: c.plan.stop, target: c.plan.target, equity: usage.equity, riskPct: settings.risk_per_trade_pct, fractional: settings.fractional_shares }) : null
                return (
                  <div className="hot-item" key={c.symbol}>
                    <div className="hot-top">
                      <div>
                        {ai && <span className="hot-rank">#{ai.rank}</span>}
                        <span className="ticker">{c.symbol}</span>
                        {c.name && <span className="company">{c.name}</span>}
                        {lev && <span className="lev-tag" title={t('Leveraged ETF')}>{t('{f} on {u}', { f: leverageLabel(lev), u: lev.underlying })}</span>}
                      </div>
                      <div className="hot-price">
                        <b>{money(c.price)}</b>
                        <span className={c.changePct >= 0 ? 'positive' : 'negative'}>{signedPct(c.changePct)}</span>
                      </div>
                      {ai && <span className={`bias ${verdictBias[ai.verdict]}`}>{ai.verdict === 'enter' ? t('Enter long') : ai.verdict === 'wait' ? t('Wait for a setup') : t('Avoid')}</span>}
                    </div>
                    <div className="hot-metrics">
                      <span>{t('Rel. volume')} <b>{times(c.relVolume)}</b></span>
                      <span>{t('Avg volume')} <b>{compact(c.avgVolume)}</b></span>
                      <span>RSI <b>{c.rsi?.toFixed(0) ?? '—'}</b></span>
                      <span>{t('3M')} <b>{signedPct(c.perf3m, 1)}</b></span>
                      <span>{t('From 52w high')} <b>{signedPct(-c.fromHigh52, 1)}</b></span>
                      <span>{t('Score')} <b>{c.score}</b></span>
                    </div>
                    {lev && (
                      <div className="lev-note">
                        {lev.factor < 0 ? t('Inverse ETF: it rises when {u} falls.', { u: lev.underlying }) + ' ' : ''}
                        {t('Leveraged ETF: it moves about {f} of {u} each day and resets daily, so it loses value when held through choppy days. Suited to short holds; trade the underlying for longer swings.', { f: leverageLabel(lev), u: lev.underlying })}
                        {levBase && ' ' + t('{u} itself is also in this scan, so this is the same move twice.', { u: lev.underlying })}
                      </div>
                    )}
                    {levKids.length > 0 && <div className="lev-note">{t('Also in this scan as a leveraged ETF: {list}', { list: levKids.map(x => x.symbol).join(', ') })}</div>}
                    {barsBySymbol.has(c.symbol) && <MiniChart bars={barsBySymbol.get(c.symbol)!} plan={c.plan} />}
                    {ai && (
                      <div className="hot-ai">
                        <div><b>{t('Why it moved:')}</b> {ai.why_moving}</div>
                        <div><b>{t('Assessment:')}</b> {ai.reason}</div>
                        <div className="negative"><b>{t('Main risk:')}</b> {ai.risk}</div>
                      </div>
                    )}
                    {c.plan && (
                      <div className="perf-row" style={{ marginTop: 10, marginBottom: 8 }}>
                        <div><span>{t('Entry (buy-stop)')}</span><b>{money(c.plan.entry)}</b></div>
                        <div><span>{t('Stop loss')}</span><b className="negative">{money(c.plan.stop)}</b></div>
                        <div><span>{t('Target')}</span><b className="positive">{money(c.plan.target)}</b></div>
                        {sized?.ok && <div><span>{t('Position size:')}</span><b>{t('{n} shares', { n: qty(sized.quantity) })}</b></div>}
                        {sized?.ok && <div><span>{t('Risk:')}</span><b className="negative">{money(sized.riskAmount)}</b></div>}
                      </div>
                    )}
                    <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                      {c.plan && <Link className="btn sm" style={{ textDecoration: 'none' }} to={`/?symbol=${c.symbol}&entry=${c.plan.entry}&stop=${c.plan.stop}&target=${c.plan.target}`}>{t('Send to trade planner')}</Link>}
                      <Link className="btn sm secondary" style={{ textDecoration: 'none' }} to={`/analyze?s=${c.symbol}`}>{t('Analyze')}</Link>
                      {!watchlist.some(w => w.symbol === c.symbol) && <button className="btn sm secondary" onClick={() => addWatch({ symbol: c.symbol, company: c.name, note: t('Hot stocks scan {d}', { d: c.date }) }).catch(() => {})}>{t('Add to watchlist')}</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {rank && rank.sources.length > 0 && (
            <div className="ai-sources" style={{ padding: '0 20px 16px' }}>
              <span className="subtle">{t('Sources:')}</span>
              {rank.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>)}
            </div>
          )}
        </section>
      )}

      {scan && rejected.length > 0 && (
        <section className="card table-card">
          <div className="card-head">
            <div><div className="card-title">{t('Did not pass')}</div><div className="subtle">{t('{n} stocks and the first rule each one failed', { n: rejected.length })}</div></div>
            <button className="btn sm secondary" onClick={() => setShowRejected(s => !s)}>{showRejected ? t('Hide') : t('Show')}</button>
          </div>
          {showRejected && (
            <div className="table-scroll" style={{ marginTop: 14 }}>
              <table>
                <thead><tr><th>{t('Instrument')}</th><th className="num">{t('Price')}</th><th className="num">{t('Today')}</th><th className="num">{t('Rel. volume')}</th><th>{t('Failed rule')}</th></tr></thead>
                <tbody>
                  {rejected.map(c => {
                    const fail = c.checks.find(x => !x.pass)!
                    return (
                      <tr key={c.symbol}>
                        <td><Link to={`/analyze?s=${c.symbol}`} className="ticker">{c.symbol}</Link>{(() => { const l = detectLeverage(c.symbol, c.name); return l ? <span className="lev-tag">{t('{f} on {u}', { f: leverageLabel(l), u: l.underlying })}</span> : null })()}</td>
                        <td className="num">{money(c.price)}</td>
                        <td className={`num ${c.changePct >= 0 ? 'positive' : 'negative'}`}>{signedPct(c.changePct)}</td>
                        <td className="num">{times(c.relVolume)}</td>
                        <td>{t(fail.key, { v: failValue(fail.key, filters) })} <span className="subtle">({fail.value})</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="subtle">{t('Automated screen based on historical patterns; most breakouts fail and past results do not guarantee future ones. This is decision support, not investment advice.')}</div>
    </div>
  )
}

function failValue(key: string, f: ScanFilters): string {
  if (key.startsWith('Price')) return String(f.minPrice)
  if (key.startsWith('Average volume')) return f.minAvgVolume.toLocaleString()
  if (key.startsWith('Relative volume')) return String(f.minRelVolume)
  if (key.startsWith('Up at least')) return `${(f.minChangePct * 100).toFixed(1)}%`
  return ''
}
