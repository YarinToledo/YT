import { forwardRef, useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { useSearchParams } from 'react-router-dom'
import { planPosition } from '../lib/calc'
import { money, qty, ratio } from '../lib/format'
import { useStore } from '../lib/store'
import type { Direction } from '../lib/types'
import { normalizeSymbol, parseNum } from '../lib/validate'
import { openBlockReason } from './PositionsTable'

const TradePlanner = forwardRef<HTMLElement>(function TradePlanner(_, ref) {
  const { settings, usage, watchlist, createTrade } = useStore()
  const t = useT()
  const [params, setParams] = useSearchParams()
  const [symbol, setSymbol] = useState(params.get('symbol') ?? 'NVDA')
  const [direction, setDirection] = useState<Direction>('LONG')
  const [entry, setEntry] = useState('100')
  const [stop, setStop] = useState('98')
  const [target, setTarget] = useState('106')
  // Per-trade overrides; defaults come from Risk Management settings.
  const [riskPct, setRiskPct] = useState(String(settings.risk_per_trade_pct))
  const [rr, setRr] = useState(String(settings.min_reward_risk))
  useEffect(() => setRiskPct(String(settings.risk_per_trade_pct)), [settings.risk_per_trade_pct])
  // Risk as a percent of the account, or as a fixed dollar amount per trade (a "risk unit").
  const [riskUnit, setRiskUnitState] = useState<'pct' | 'usd'>(() => { try { return localStorage.getItem('tradepilot-risk-unit') === 'usd' ? 'usd' : 'pct' } catch { return 'pct' } })
  const [riskUsd, setRiskUsd] = useState(() => { try { return localStorage.getItem('tradepilot-risk-usd') ?? '' } catch { return '' } })
  const setRiskUnit = (u: 'pct' | 'usd') => {
    setRiskUnitState(u)
    // First switch to dollars: start from what the current percent means in dollars.
    if (u === 'usd' && !riskUsd) { const pct = parseNum(riskPct); if (pct != null && usage.equity > 0) setRiskUsd(String(Math.round((usage.equity * pct) / 100))) }
    try { localStorage.setItem('tradepilot-risk-unit', u) } catch { /* private mode */ }
  }
  useEffect(() => { try { localStorage.setItem('tradepilot-risk-usd', riskUsd) } catch { /* private mode */ } }, [riskUsd])
  const [setup, setSetup] = useState('')
  const [busy, setBusy] = useState(false)

  // Coming from Market Watch with ?symbol=XYZ
  useEffect(() => {
    const s = params.get('symbol')
    if (s) {
      setSymbol(s)
      const e = params.get('entry'), st = params.get('stop'), tg = params.get('target')
      if (e) { setEntry(e); setDirection('LONG') }
      if (st) setStop(st)
      if (tg) { setTarget(tg); setRr('') }
      for (const k of ['symbol', 'entry', 'stop', 'target']) params.delete(k)
      setParams(params, { replace: true })
      if (e) (ref as React.RefObject<HTMLElement> | null)?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [params, setParams, ref])

  // With an R:R set, the target is derived from entry and stop; typing a target switches to manual.
  const rrNum = parseNum(rr)
  const entryNum = parseNum(entry), stopNum = parseNum(stop)
  const autoTarget = rrNum != null && rrNum > 0 && entryNum != null && stopNum != null && entryNum !== stopNum
    ? Math.round((entryNum + (direction === 'LONG' ? 1 : -1) * rrNum * Math.abs(entryNum - stopNum)) * 10000) / 10000
    : null
  const targetValue = autoTarget != null ? String(autoTarget) : rrNum != null ? '' : target
  const usd = riskUnit === 'usd'
  const riskNum = parseNum(riskPct)
  const usdNum = parseNum(riskUsd)
  const riskOk = usd ? usdNum != null && usdNum > 0 : riskNum != null && riskNum > 0 && riskNum <= 100
  const defaultUsd = (usage.equity * settings.risk_per_trade_pct) / 100

  const result = planPosition({
    direction,
    entry: entryNum ?? 0,
    stop: stopNum ?? 0,
    target: parseNum(targetValue) ?? 0,
    equity: usage.equity,
    riskPct: !usd && riskOk ? riskNum! : 0,
    riskDollars: usd ? (riskOk ? usdNum! : 0) : undefined,
    fractional: settings.fractional_shares,
  })
  const sym = normalizeSymbol(symbol)
  const symOk = /^[A-Z0-9.\-]{1,12}$/.test(sym)
  const reason = openBlockReason(usage)
  const block = reason && t(reason)
  const overDefault = riskOk && (usd ? usage.equity > 0 && usdNum! > defaultUsd + 0.005 : riskNum! > settings.risk_per_trade_pct + 1e-9)
  const lowRR = result.ok && result.rr + 1e-9 < settings.min_reward_risk

  async function save(status: 'PLANNED' | 'OPEN') {
    if (!result.ok || !symOk || !riskOk) return
    if (lowRR && !confirm(t('R:R {v} is below your {m} minimum. Save anyway?', { v: ratio(result.rr), m: ratio(settings.min_reward_risk) }))) return
    setBusy(true)
    try {
      await createTrade({
        symbol: sym,
        company: watchlist.find(w => w.symbol === sym)?.company ?? null,
        direction, status,
        entry_price: parseNum(entry)!, stop_loss: parseNum(stop)!, take_profit: parseNum(targetValue),
        quantity: result.quantity, exit_price: null, fees: 0,
        opened_at: status === 'OPEN' ? new Date().toISOString() : null, closed_at: null,
        setup: setup.trim() || null, notes: null,
      })
    } catch { /* toast already shown */ } finally { setBusy(false) }
  }

  return (
    <article className="card" ref={ref}>
      <div className="card-head">
        <div><div className="card-title">{t('Trade Planner')}</div><div className="subtle">{usd ? t('Position sizing · fixed risk of {r} per trade', { r: riskOk ? money(usdNum!) : '—' }) : t('Position sizing · {p}% of {v}', { p: riskOk ? riskNum! : '—', v: money(usage.equity) })}</div></div>
        <span className="subtle">{t('RISK-BASED')}</span>
      </div>
      <form className="trade-form" onSubmit={e => { e.preventDefault(); save('PLANNED') }}>
        <div className="field"><label>{t('Symbol')}</label><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" list="watch-symbols" /></div>
        <datalist id="watch-symbols">{watchlist.map(w => <option key={w.symbol} value={w.symbol}>{w.company}</option>)}</datalist>
        <div className="field"><label>{t('Direction')}</label><select value={direction} onChange={e => setDirection(e.target.value as Direction)}><option value="LONG">{t('LONG')}</option><option value="SHORT">{t('SHORT')}</option></select></div>
        <div className="field"><label>{t('Setup')}</label><input value={setup} onChange={e => setSetup(e.target.value)} placeholder={t('Optional')} /></div>
        <div className="field"><label>{t('Entry price ($)')}</label><input type="number" inputMode="decimal" min="0" step="any" value={entry} onChange={e => setEntry(e.target.value)} /></div>
        <div className="field"><label>{t('Stop loss ($)')}</label><input type="number" inputMode="decimal" min="0" step="any" value={stop} onChange={e => setStop(e.target.value)} /></div>
        <div className="field"><label>{t('Target price ($)')}</label><input type="number" inputMode="decimal" min="0" step="any" value={targetValue} onChange={e => { setRr(''); setTarget(e.target.value) }} /></div>
        <div className="field">
          <label>{usd ? t('Risk per trade ($)') : t('Risk per trade (%)')}</label>
          <div className="input-unit">
            {usd
              ? <input type="number" inputMode="decimal" min="0" step="any" value={riskUsd} onChange={e => setRiskUsd(e.target.value)} aria-label={t('Risk per trade ($)')} />
              : <input type="number" inputMode="decimal" min="0" max="100" step="any" value={riskPct} onChange={e => setRiskPct(e.target.value)} aria-label={t('Risk per trade (%)')} />}
            <div className="unit-toggle" role="group" aria-label={t('Risk unit')}>
              <button type="button" aria-pressed={!usd} className={!usd ? 'active' : ''} onClick={() => setRiskUnit('pct')}>%</button>
              <button type="button" aria-pressed={usd} className={usd ? 'active' : ''} onClick={() => setRiskUnit('usd')}>$</button>
            </div>
          </div>
          <div className="hint">{usd ? (usage.equity > 0 ? t('{p}% of your account', { p: riskOk ? ((usdNum! / usage.equity) * 100).toFixed(2) : '—' }) : '') : t('Percent of account equity')}</div>
        </div>
        <div className="field"><label>{t('Reward : risk (1:X)')}</label><input type="number" inputMode="decimal" min="0" step="any" value={rr} onChange={e => setRr(e.target.value)} placeholder={t('Manual target')} /><div className="hint">{rrNum != null ? t('Target is calculated from this ratio') : t('Empty = enter target manually')}</div></div>

        {!riskOk ? (
          <div className="form-result error" aria-live="polite">{usd ? t('Risk amount must be more than $0.') : t('Risk per trade must be between 0 and 100%.')}</div>
        ) : result.ok ? (
          <div className="form-result" aria-live="polite">
            <span>{t('Position size:')} <b>{t('{n} shares', { n: qty(result.quantity) })}</b></span>
            <span>{t('Value:')} <b>{money(result.positionValue)}</b></span>
            <span>{t('Risk:')} <b>{money(result.riskAmount)}</b></span>
            <span>{t('Reward:')} <b>{money(result.rewardAmount)}</b></span>
            <span>{t('R:R')} <b className={lowRR ? 'warn' : ''}>{ratio(result.rr)}</b></span>
          </div>
        ) : (
          <div className="form-result error" aria-live="polite">{t(result.error)}</div>
        )}

        {(lowRR || block || overDefault || (result.ok && result.positionValue > usage.equity) || !symOk) && (
          <div className="warnings">
            {!symOk && <div className="warning">{t('Enter a valid symbol (letters, digits, dots, dashes).')}</div>}
            {overDefault && <div className="warning">{usd
              ? t('Risk {r} is above your default {d}% ({v}) for this trade.', { r: money(usdNum!), d: settings.risk_per_trade_pct, v: money(defaultUsd) })
              : t('Risk {p}% is above your default {d}% for this trade.', { p: riskNum!, d: settings.risk_per_trade_pct })}</div>}
            {lowRR && <div className="warning">{t('R:R is below your {m} minimum.', { m: ratio(settings.min_reward_risk) })}</div>}
            {result.ok && result.positionValue > usage.equity && <div className="warning">{t('Position value exceeds account equity — this would need margin.')}</div>}
            {block && <div className="warning block">{t('{reason}. You can still save the trade as planned.', { reason: block ?? '' })}</div>}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn secondary" disabled={!result.ok || !symOk || !riskOk || busy}>{t('Save as planned')}</button>
          <button type="button" className="btn" disabled={!result.ok || !symOk || !riskOk || busy || !!block} title={block ?? undefined} onClick={() => save('OPEN')}>{t('Open position now')}</button>
        </div>
      </form>
    </article>
  )
})

export default TradePlanner
