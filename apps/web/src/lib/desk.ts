import { sma, type Bar } from './indicators'
import { currentEquity, plannedRR, rMultiple, tradePnl, tradeRisk, tradeStats } from './calc'
import type { AccountSettings, Trade } from './types'

/** Reject malformed/duplicate candles rather than silently constructing a backtest from them. */
export function checkedBars(input: Bar[]): Bar[] {
  const bars = [...input].sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date)) ||
      new Date(b.date).toISOString().slice(0, 10) !== b.date ||
      ![b.open, b.high, b.low, b.close].every(v => Number.isFinite(v) && v > 0) ||
      b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close) ||
      (i > 0 && bars[i - 1].date === b.date)) throw new Error('Price history contains invalid or duplicate bars.')
  }
  return bars
}

/** Include a weekly candle only once its ISO week is over. Holiday-shortened weeks work too. */
export function weeklyBars(input: Bar[], now = new Date()): Bar[] {
  const weekOf = (date: string) => {
    const d = new Date(date + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
    return d.toISOString().slice(0, 10)
  }
  const todayNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const currentWeek = weekOf(todayNY)
  const groups = new Map<string, Bar>()
  for (const b of checkedBars(input)) {
    const key = weekOf(b.date)
    // Conservative: omit this week even on Friday; no partial week enters indicators.
    if (key >= currentWeek) continue
    const prev = groups.get(key)
    groups.set(key, prev ? { ...prev, date: b.date, high: Math.max(prev.high, b.high), low: Math.min(prev.low, b.low), close: b.close, volume: prev.volume + b.volume } : { ...b })
  }
  return [...groups.values()]
}

export interface BacktestConfig {
  strategy: 'cross' | 'breakout'
  fast: number; slow: number; stopPct: number; rewardRisk: number; maxHold: number
  capital: number; riskPct: number; feeBps: number; slippageBps: number; fractional: boolean
}
export interface SimTrade {
  signalDate: string; entryDate: string; exitDate: string; entry: number; exit: number
  stop: number; target: number; quantity: number; pnl: number; r: number
  reason: 'stop' | 'target' | 'signal' | 'time' | 'end'
}
export interface BacktestResult {
  trades: SimTrade[]; curve: { date: string; equity: number }[]; endEquity: number
  returnPct: number; winRate: number | null; profitFactor: number | null
  maxDrawdown: number; benchmarkReturn: number | null; start: string; end: string
}

/** Long-only, one position, no leverage. Yesterday's signal fills at today's open.
 * Stop wins ambiguous OHLC bars; stop gaps fill at open. Mark-to-market drawdown is EOD only.
 * Fee/slippage inputs apply to both legs. No parameter optimization or future candles in signals.
 */
export function backtest(input: Bar[], c: BacktestConfig): BacktestResult {
  const positive = [c.fast, c.stopPct, c.rewardRisk, c.maxHold, c.capital, c.riskPct, ...(c.strategy === 'cross' ? [c.slow] : [])]
  if (!positive.every(v => Number.isFinite(v) && v > 0) ||
    ![c.fast, c.maxHold].every(Number.isInteger) || c.fast > 250 ||
    (c.strategy === 'cross' && (!Number.isInteger(c.slow) || c.fast >= c.slow || c.slow > 250)) ||
    c.stopPct >= 100 || c.riskPct > 100 || c.maxHold > 252 ||
    ![c.feeBps, c.slippageBps].every(v => Number.isFinite(v) && v >= 0 && v <= 100)) {
    throw new Error('Check strategy periods, risk and transaction costs.')
  }
  const bars = checkedBars(input)
  const warmup = c.strategy === 'cross' ? c.slow + 1 : c.fast + 1
  if (bars.length <= warmup) throw new Error('Not enough price history for these strategy settings.')
  const fast = sma(bars.map(b => b.close), c.fast), slow = sma(bars.map(b => b.close), c.slow)
  const fee = c.feeBps / 10000, slip = c.slippageBps / 10000
  let cash = c.capital, peak = cash, maxDrawdown = 0
  let pos: { signalDate: string; entryDate: string; entry: number; stop: number; target: number; quantity: number; index: number; cost: number } | null = null
  const trades: SimTrade[] = [], curve: BacktestResult['curve'] = []
  const close = (raw: number, b: Bar, reason: SimTrade['reason']) => {
    const p = pos!
    // A target is a limit order: do not execute worse than its limit.
    const exit = reason === 'target' ? Math.max(p.target, raw * (1 - slip)) : raw * (1 - slip)
    const proceeds = exit * p.quantity * (1 - fee), pnl = proceeds - p.cost
    cash += proceeds
    trades.push({ ...p, exitDate: b.date, exit, pnl, r: pnl / ((p.entry - p.stop) * p.quantity), reason })
    pos = null
  }
  for (let i = warmup; i < bars.length; i++) {
    const b = bars[i], prev = i - 1, wasOpen = pos != null
    if (pos) {
      if (b.open <= pos.stop) close(b.open, b, 'stop')
      else if (b.open >= pos.target) close(b.open, b, 'target')
      else if (c.strategy === 'cross' && fast[prev] != null && slow[prev] != null && fast[prev]! < slow[prev]!) close(b.open, b, 'signal')
    }
    if (!pos && !wasOpen && i < bars.length - 1 && cash > 0) {
      const signal = c.strategy === 'cross'
        ? fast[prev] != null && slow[prev] != null && fast[prev - 1] != null && slow[prev - 1] != null &&
          fast[prev]! > slow[prev]! && fast[prev - 1]! <= slow[prev - 1]!
        : bars[prev].close > Math.max(...bars.slice(prev - c.fast, prev).map(x => x.high))
      if (signal) {
        const entry = b.open * (1 + slip), stop = entry * (1 - c.stopPct / 100)
        const target = entry + (entry - stop) * c.rewardRisk
        const estimatedLoss = entry * (1 + fee) - stop * (1 - slip) * (1 - fee)
        const raw = Math.min(cash * c.riskPct / 100 / estimatedLoss, cash / (entry * (1 + fee)))
        const unit = c.fractional ? 1000 : 1, quantity = Math.floor(raw * unit) / unit
        if (quantity > 0) {
          const cost = entry * quantity * (1 + fee)
          pos = { signalDate: bars[prev].date, entryDate: b.date, entry, stop, target, quantity, index: i, cost }
          cash -= cost
        }
      }
    }
    if (pos) {
      // Daily data cannot resolve which threshold was touched first. Assume the stop.
      if (b.low <= pos.stop) close(pos.stop, b, 'stop')
      else if (b.high >= pos.target) close(pos.target, b, 'target')
      else if (i - pos.index + 1 >= c.maxHold) close(b.close, b, 'time')
      else if (i === bars.length - 1) close(b.close, b, 'end')
    }
    const equity = cash + (pos ? pos.quantity * b.close * (1 - fee) : 0)
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak)
    curve.push({ date: b.date, equity })
  }
  const winners = trades.filter(t => t.pnl > 0), losers = trades.filter(t => t.pnl < 0)
  const profit = winners.reduce((s, t) => s + t.pnl, 0), loss = -losers.reduce((s, t) => s + t.pnl, 0)
  // Same first eligible session and both-sided costs; fractional buy-and-hold benchmark.
  const benchmarkReturn = bars[bars.length - 1].close * (1 - slip) * (1 - fee) /
    (bars[warmup].open * (1 + slip) * (1 + fee)) - 1
  return { trades, curve, endEquity: cash, returnPct: cash / c.capital - 1,
    winRate: trades.length ? winners.length / trades.length : null,
    profitFactor: loss > 0 ? profit / loss : profit > 0 ? Infinity : null,
    maxDrawdown, benchmarkReturn, start: bars[warmup].date, end: bars[bars.length - 1].date }
}

/** Entry-cost stress, explicitly not a live valuation or an estimated correlation matrix. */
export function portfolioStress(trades: Trade[], settings: AccountSettings, shockPct = 20) {
  const open = trades.filter(t => t.status === 'OPEN')
  const equity = currentEquity(settings, trades)
  const gross = open.reduce((s, t) => s + Math.abs(t.entry_price * t.quantity), 0)
  const shock = open.reduce((s, t) => s + t.entry_price * t.quantity * shockPct / 100 * (t.direction === 'LONG' ? -1 : 1), 0)
  const concentration = new Map<string, number>()
  for (const t of open) concentration.set(t.symbol, (concentration.get(t.symbol) ?? 0) + Math.abs(t.entry_price * t.quantity))
  return { equity, gross, shock, stressedEquity: equity + shock,
    openRisk: open.reduce((s, t) => s + tradeRisk(t), 0),
    allocations: [...concentration].map(([symbol, value]) => ({ symbol, value, weight: gross > 0 ? value / gross : 0 })).sort((a, b) => b.value - a.value) }
}

export function reviewJournal(trades: Trade[], minRR: number) {
  const recent = trades.filter(t => t.status === 'CLOSED' && t.closed_at && Number.isFinite(Date.parse(t.closed_at)))
    .sort((a, b) => Date.parse(a.closed_at!) - Date.parse(b.closed_at!)).slice(-20)
  const valid = recent.filter(t => [t.entry_price, t.stop_loss, t.quantity].every(n => Number.isFinite(n) && n > 0) &&
    t.exit_price != null && Number.isFinite(t.exit_price) && t.exit_price > 0 && Number.isFinite(t.fees) && t.fees >= 0 && tradeRisk(t) > 0)
  const noSetup = valid.filter(t => !t.setup?.trim()).length
  const belowRR = valid.filter(t => { const rr = plannedRR(t); return rr != null && rr < minRR }).length
  const missingTarget = valid.filter(t => t.take_profit == null).length
  const overStop = valid.filter(t => { const r = rMultiple(t); return r != null && r < -1.05 }).length
  const groups = new Map<string, { count: number; pnl: number }>()
  for (const tr of valid) {
    const key = tr.setup?.trim() || 'Unlabelled setup', g = groups.get(key) ?? { count: 0, pnl: 0 }
    groups.set(key, { count: g.count + 1, pnl: g.pnl + tradePnl(tr) })
  }
  return { recent: valid, excluded: recent.length - valid.length, stats: tradeStats(valid), noSetup, belowRR, missingTarget, overStop,
    groups: [...groups].map(([setup, g]) => ({ setup, ...g })).sort((a, b) => b.pnl - a.pnl) }
}
