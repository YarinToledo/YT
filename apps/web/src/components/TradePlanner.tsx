import { forwardRef, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { planPosition } from '../lib/calc'
import { money, qty, ratio } from '../lib/format'
import { useStore } from '../lib/store'
import type { Direction } from '../lib/types'
import { normalizeSymbol, parseNum } from '../lib/validate'
import { openBlockReason } from './PositionsTable'

const TradePlanner = forwardRef<HTMLElement>(function TradePlanner(_, ref) {
  const { settings, usage, watchlist, createTrade } = useStore()
  const [params, setParams] = useSearchParams()
  const [symbol, setSymbol] = useState(params.get('symbol') ?? 'NVDA')
  const [direction, setDirection] = useState<Direction>('LONG')
  const [entry, setEntry] = useState('100')
  const [stop, setStop] = useState('98')
  const [target, setTarget] = useState('106')
  const [setup, setSetup] = useState('')
  const [busy, setBusy] = useState(false)

  // Coming from Market Watch with ?symbol=XYZ
  useEffect(() => {
    const s = params.get('symbol')
    if (s) {
      setSymbol(s)
      params.delete('symbol')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const result = planPosition({
    direction,
    entry: parseNum(entry) ?? 0,
    stop: parseNum(stop) ?? 0,
    target: parseNum(target) ?? 0,
    equity: usage.equity,
    riskPct: settings.risk_per_trade_pct,
    fractional: settings.fractional_shares,
  })
  const sym = normalizeSymbol(symbol)
  const symOk = /^[A-Z0-9.\-]{1,12}$/.test(sym)
  const block = openBlockReason(usage)
  const lowRR = result.ok && result.rr + 1e-9 < settings.min_reward_risk

  async function save(status: 'PLANNED' | 'OPEN') {
    if (!result.ok || !symOk) return
    if (lowRR && !confirm(`R:R ${ratio(result.rr)} is below your ${ratio(settings.min_reward_risk)} minimum. Save anyway?`)) return
    setBusy(true)
    try {
      await createTrade({
        symbol: sym,
        company: watchlist.find(w => w.symbol === sym)?.company ?? null,
        direction, status,
        entry_price: parseNum(entry)!, stop_loss: parseNum(stop)!, take_profit: parseNum(target),
        quantity: result.quantity, exit_price: null, fees: 0,
        opened_at: status === 'OPEN' ? new Date().toISOString() : null, closed_at: null,
        setup: setup.trim() || null, notes: null,
      })
    } catch { /* toast already shown */ } finally { setBusy(false) }
  }

  return (
    <article className="card" ref={ref}>
      <div className="card-head">
        <div><div className="card-title">Trade Planner</div><div className="subtle">Position sizing · {settings.risk_per_trade_pct}% of {money(usage.equity)}</div></div>
        <span className="subtle">RISK-BASED</span>
      </div>
      <form className="trade-form" onSubmit={e => { e.preventDefault(); save('PLANNED') }}>
        <div className="field"><label>Symbol</label><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" list="watch-symbols" /></div>
        <datalist id="watch-symbols">{watchlist.map(w => <option key={w.symbol} value={w.symbol}>{w.company}</option>)}</datalist>
        <div className="field"><label>Direction</label><select value={direction} onChange={e => setDirection(e.target.value as Direction)}><option>LONG</option><option>SHORT</option></select></div>
        <div className="field"><label>Setup</label><input value={setup} onChange={e => setSetup(e.target.value)} placeholder="Optional" /></div>
        <div className="field"><label>Entry price ($)</label><input type="number" inputMode="decimal" min="0" step="any" value={entry} onChange={e => setEntry(e.target.value)} /></div>
        <div className="field"><label>Stop loss ($)</label><input type="number" inputMode="decimal" min="0" step="any" value={stop} onChange={e => setStop(e.target.value)} /></div>
        <div className="field"><label>Target price ($)</label><input type="number" inputMode="decimal" min="0" step="any" value={target} onChange={e => setTarget(e.target.value)} /></div>

        {result.ok ? (
          <div className="form-result" aria-live="polite">
            <span>Position size: <b>{qty(result.quantity)} shares</b></span>
            <span>Value: <b>{money(result.positionValue)}</b></span>
            <span>Risk: <b>{money(result.riskAmount)}</b></span>
            <span>Reward: <b>{money(result.rewardAmount)}</b></span>
            <span>R:R <b className={lowRR ? 'warn' : ''}>{ratio(result.rr)}</b></span>
          </div>
        ) : (
          <div className="form-result error" aria-live="polite">{result.error}</div>
        )}

        {(lowRR || block || (result.ok && result.positionValue > usage.equity) || !symOk) && (
          <div className="warnings">
            {!symOk && <div className="warning">Enter a valid symbol (letters, digits, dots, dashes).</div>}
            {lowRR && <div className="warning">R:R is below your {ratio(settings.min_reward_risk)} minimum.</div>}
            {result.ok && result.positionValue > usage.equity && <div className="warning">Position value exceeds account equity — this would need margin.</div>}
            {block && <div className="warning block">{block}. You can still save the trade as planned.</div>}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn secondary" disabled={!result.ok || !symOk || busy}>Save as planned</button>
          <button type="button" className="btn" disabled={!result.ok || !symOk || busy || !!block} title={block ?? undefined} onClick={() => save('OPEN')}>Open position now</button>
        </div>
      </form>
    </article>
  )
})

export default TradePlanner
