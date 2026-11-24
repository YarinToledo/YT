import type { AccountSettings, Direction, Trade } from './types'

const sign = (d: Direction) => (d === 'LONG' ? 1 : -1)

/** Realized P&L of a closed trade, net of fees. 0 for anything not closed. */
export function tradePnl(t: Trade): number {
  if (t.status !== 'CLOSED' || t.exit_price == null) return 0
  return sign(t.direction) * (t.exit_price - t.entry_price) * t.quantity - t.fees
}

/** Dollars at risk between entry and stop. */
export function tradeRisk(t: Pick<Trade, 'entry_price' | 'stop_loss' | 'quantity'>): number {
  return Math.abs(t.entry_price - t.stop_loss) * t.quantity
}

/** Reward multiple of a closed trade (P&L / initial risk). */
export function rMultiple(t: Trade): number | null {
  const risk = tradeRisk(t)
  if (t.status !== 'CLOSED' || risk <= 0) return null
  return tradePnl(t) / risk
}

/** Planned reward:risk ratio from entry/stop/target. */
export function plannedRR(t: Pick<Trade, 'direction' | 'entry_price' | 'stop_loss' | 'take_profit'>): number | null {
  if (t.take_profit == null) return null
  const dist = Math.abs(t.entry_price - t.stop_loss)
  if (dist <= 0) return null
  return (sign(t.direction) * (t.take_profit - t.entry_price)) / dist
}

export function realizedPnl(trades: Trade[], since?: Date): number {
  return trades
    .filter(t => t.status === 'CLOSED' && t.closed_at && (!since || new Date(t.closed_at) >= since))
    .reduce((s, t) => s + tradePnl(t), 0)
}

export function currentEquity(settings: AccountSettings, trades: Trade[]): number {
  return settings.starting_capital + realizedPnl(trades)
}

export function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Monday 00:00 local time of the week containing d. */
export function startOfWeek(d = new Date()): Date {
  const s = startOfDay(d)
  const diff = (s.getDay() + 6) % 7
  s.setDate(s.getDate() - diff)
  return s
}

// ---------------------------------------------------------------------------
// Position sizing
// ---------------------------------------------------------------------------
export interface PlanInput {
  direction: Direction
  entry: number
  stop: number
  target: number
  equity: number
  riskPct: number
  /** Fixed amount to risk in dollars; when set it replaces riskPct ("risk unit" sizing). */
  riskDollars?: number
  fractional: boolean
}

export type PlanResult =
  | { ok: true; quantity: number; riskBudget: number; riskAmount: number; rewardAmount: number; rr: number; positionValue: number }
  | { ok: false; error: string }

export function planPosition(p: PlanInput): PlanResult {
  const { direction, entry, stop, target } = p
  if (!(entry > 0) || !(stop > 0) || !(target > 0)) return { ok: false, error: 'Enter entry, stop and target prices.' }
  if (direction === 'LONG' && stop >= entry) return { ok: false, error: 'For a LONG, the stop must be below entry.' }
  if (direction === 'SHORT' && stop <= entry) return { ok: false, error: 'For a SHORT, the stop must be above entry.' }
  if (direction === 'LONG' && target <= entry) return { ok: false, error: 'For a LONG, the target must be above entry.' }
  if (direction === 'SHORT' && target >= entry) return { ok: false, error: 'For a SHORT, the target must be below entry.' }
  if (p.riskDollars == null && !(p.equity > 0)) return { ok: false, error: 'Account equity is zero or negative.' }
  if (p.riskDollars != null && !(p.riskDollars > 0)) return { ok: false, error: 'Risk amount must be more than $0.' }

  const dist = Math.abs(entry - stop)
  const riskBudget = p.riskDollars ?? (p.equity * p.riskPct) / 100
  const raw = riskBudget / dist
  // Always round down so the actual risk never exceeds the budget.
  const quantity = p.fractional ? Math.floor(raw * 1000) / 1000 : Math.floor(raw)
  if (quantity <= 0) return { ok: false, error: `Risk budget ($${riskBudget.toFixed(2)}) is too small for one share at this stop distance.` }

  const reward = Math.abs(target - entry)
  return {
    ok: true,
    quantity,
    riskBudget,
    riskAmount: quantity * dist,
    rewardAmount: quantity * reward,
    rr: reward / dist,
    positionValue: quantity * entry,
  }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
export interface TradeStats {
  closed: number
  wins: number
  losses: number
  winRate: number | null
  grossProfit: number
  grossLoss: number
  profitFactor: number | null
  avgWin: number | null
  avgLoss: number | null
  expectancy: number | null
  avgR: number | null
  best: number | null
  worst: number | null
  net: number
}

export function tradeStats(trades: Trade[]): TradeStats {
  const closed = trades.filter(t => t.status === 'CLOSED')
  const pnls = closed.map(tradePnl)
  const wins = pnls.filter(p => p > 0)
  const losses = pnls.filter(p => p < 0)
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = -losses.reduce((a, b) => a + b, 0)
  const rs = closed.map(rMultiple).filter((r): r is number => r != null)
  const net = pnls.reduce((a, b) => a + b, 0)
  const decided = wins.length + losses.length
  return {
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: decided ? wins.length / decided : null,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    expectancy: closed.length ? net / closed.length : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    best: pnls.length ? Math.max(...pnls) : null,
    worst: pnls.length ? Math.min(...pnls) : null,
    net,
  }
}

/** End-of-day equity for each of the last `days` days, ending today. */
export function equityCurve(settings: AccountSettings, trades: Trade[], days = 30, today = new Date()) {
  const closed = trades
    .filter(t => t.status === 'CLOSED' && t.closed_at)
    .map(t => ({ at: new Date(t.closed_at!).getTime(), pnl: tradePnl(t) }))
  const points: { date: Date; equity: number }[] = []
  const end = startOfDay(today)
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end)
    day.setDate(end.getDate() - i)
    const cutoff = new Date(day)
    cutoff.setDate(day.getDate() + 1)
    const equity = settings.starting_capital + closed.filter(c => c.at < cutoff.getTime()).reduce((s, c) => s + c.pnl, 0)
    points.push({ date: day, equity })
  }
  return points
}

export interface RiskUsage {
  equity: number
  riskPerTrade: number
  dailyLimit: number
  weeklyLimit: number
  dailyLoss: number
  weeklyLoss: number
  openRisk: number
  openCount: number
  dailyLocked: boolean
  weeklyLocked: boolean
  positionsFull: boolean
}

export function riskUsage(settings: AccountSettings, trades: Trade[], now = new Date()): RiskUsage {
  const equity = currentEquity(settings, trades)
  const open = trades.filter(t => t.status === 'OPEN')
  // Limits are measured against the starting capital of the period, i.e. current equity minus the period's P&L.
  const dayPnl = realizedPnl(trades, startOfDay(now))
  const weekPnl = realizedPnl(trades, startOfWeek(now))
  const dailyLimit = ((equity - dayPnl) * settings.daily_loss_limit_pct) / 100
  const weeklyLimit = ((equity - weekPnl) * settings.weekly_loss_limit_pct) / 100
  const dailyLoss = Math.max(0, -dayPnl)
  const weeklyLoss = Math.max(0, -weekPnl)
  return {
    equity,
    riskPerTrade: (equity * settings.risk_per_trade_pct) / 100,
    dailyLimit,
    weeklyLimit,
    dailyLoss,
    weeklyLoss,
    openRisk: open.reduce((s, t) => s + tradeRisk(t), 0),
    openCount: open.length,
    dailyLocked: dailyLoss >= dailyLimit && dailyLimit > 0,
    weeklyLocked: weeklyLoss >= weeklyLimit && weeklyLimit > 0,
    positionsFull: open.length >= settings.max_open_positions,
  }
}
