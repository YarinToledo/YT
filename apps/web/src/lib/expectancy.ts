/**
 * Expectancy in R (risk units), as in the risk-management lesson:
 *   expected R per trade = winRate × target − (1 − winRate) − costs
 * where losers lose 1R and `costs` is fees + slippage per trade expressed in R (the lesson uses 0.2R).
 */
import { rMultiple } from './calc'
import type { Trade } from './types'

export const WIN_RATES = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]
export const TARGETS = [1, 1.5, 2, 2.5, 3]
export const LESSON_COSTS_R = 0.2

export function expectancyR(winRate: number, target: number, costsR = 0): number {
  return winRate * target - (1 - winRate) - costsR
}

/** The zone the lesson recommends: 50–60% success with targets of 1.5R–2.5R. */
export const inRecommendedZone = (winRate: number, target: number) =>
  winRate >= 0.5 - 1e-9 && winRate <= 0.6 + 1e-9 && target >= 1.5 && target <= 2.5

export interface JournalR {
  /** Closed trades that have a usable initial risk (entry ≠ stop). */
  trades: number
  winRate: number | null
  /** Average R of winning trades — the target you actually realize. */
  avgWinR: number | null
  /** Average R of losing trades (≈ −1 when stops are respected). */
  avgLossR: number | null
  /** Average R over all trades: the real expectancy, after the fees recorded in the journal. */
  avgR: number | null
  /** Closed trades in the last 30 days. */
  last30: number
}

export function journalR(trades: Trade[], now = Date.now()): JournalR {
  const closed = trades.filter(t => t.status === 'CLOSED')
  const rs = closed.map(rMultiple).filter((r): r is number => r != null && Number.isFinite(r))
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r < 0)
  const decided = wins.length + losses.length
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const since = now - 30 * 86_400_000
  return {
    trades: rs.length,
    winRate: decided ? wins.length / decided : null,
    avgWinR: avg(wins),
    avgLossR: avg(losses),
    avgR: avg(rs),
    last30: closed.filter(t => t.closed_at && Date.parse(t.closed_at) >= since).length,
  }
}

/** Nearest table cell to the journal's win rate and average winning R. */
export function nearestCell(winRate: number, avgWinR: number): { winRate: number; target: number } {
  const near = (xs: number[], v: number) => xs.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), xs[0])
  return { winRate: near(WIN_RATES, winRate), target: near(TARGETS, avgWinR) }
}
