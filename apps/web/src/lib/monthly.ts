/** Monthly summary of closed trades, as at the top of the trade-journal sheet in the lesson. */
import { rAt, rMultiple, targetR, tradePnl } from './calc'
import type { Trade } from './types'

export interface MonthRow {
  key: string              // YYYY-MM (local time of closing)
  trades: number
  winRate: number | null
  /** Theoretical average R with a fixed target; only trades that have a best price recorded. */
  avgTargetR: number | null
  targetN: number
  /** Actual average R (after recorded fees). */
  avgR: number | null
  avgPnl: number | null
  sumTargetR: number
  net: number
}

const monthKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function summarize(key: string, ts: Trade[], target: number): MonthRow {
  const pnls = ts.map(tradePnl)
  const wins = pnls.filter(p => p > 0).length, losses = pnls.filter(p => p < 0).length
  const rs = ts.map(rMultiple).filter((r): r is number => r != null)
  const trs = ts.map(t => targetR(t, target)).filter((r): r is number => r != null)
  const net = pnls.reduce((a, b) => a + b, 0)
  return {
    key, trades: ts.length,
    winRate: wins + losses ? wins / (wins + losses) : null,
    avgTargetR: avg(trs), targetN: trs.length, avgR: avg(rs),
    avgPnl: ts.length ? net / ts.length : null,
    sumTargetR: trs.reduce((a, b) => a + b, 0), net,
  }
}

/** Newest month first, plus a total row. */
export function monthlySummary(trades: Trade[], target: number): { months: MonthRow[]; total: MonthRow } {
  const closed = trades.filter(t => t.status === 'CLOSED' && t.closed_at)
  const by = new Map<string, Trade[]>()
  for (const t of closed) { const k = monthKey(t.closed_at!); by.set(k, [...(by.get(k) ?? []), t]) }
  const months = [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, ts]) => summarize(k, ts, target))
  return { months, total: summarize('total', closed, target) }
}

/** Share of trades (with a best price) whose best point reached at least each R level. */
export function reachShare(trades: Trade[], levels = [1, 2, 3, 4, 5]): { n: number; shares: { level: number; share: number }[] } {
  const maxes = trades.filter(t => t.status === 'CLOSED').map(t => rAt(t, t.best_price)).filter((r): r is number => r != null)
  return { n: maxes.length, shares: levels.map(level => ({ level, share: maxes.length ? maxes.filter(m => m >= level - 1e-9).length / maxes.length : 0 })) }
}
