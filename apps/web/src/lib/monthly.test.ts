import { describe, expect, it } from 'vitest'
import { rAt, targetR } from './calc'
import { monthlySummary, reachShare } from './monthly'
import { validateTrade } from './validate'
import type { Trade } from './types'

// The three trades from the trade-journal lesson (same day, $10 risk per share-dollar as in the sheet).
const base = { id: '', company: null, status: 'CLOSED' as const, take_profit: null, fees: 0, opened_at: '2026-01-09T15:20:00Z', closed_at: '2026-01-09T21:00:00Z', setup: 'קפיץ', notes: null, created_at: '2026-01-09T15:00:00Z' }
const tsla: Trade = { ...base, id: 't', symbol: 'TSLA', direction: 'LONG', entry_price: 120, stop_loss: 118, quantity: 10, exit_price: 121, best_price: 123, eod_price: 121 }
const aapl: Trade = { ...base, id: 'a', symbol: 'AAPL', direction: 'LONG', entry_price: 100, stop_loss: 99, quantity: 10, exit_price: 102, best_price: 105, eod_price: 104.5 }
const meta: Trade = { ...base, id: 'm', symbol: 'META', direction: 'LONG', entry_price: 101, stop_loss: 100, quantity: 20, exit_price: 100, best_price: 101.5, eod_price: 100 }

describe('journal excursion (trade-journal lesson)', () => {
  it('max R, EOD R and target R match the sheet', () => {
    expect(rAt(tsla, tsla.best_price)).toBeCloseTo(1.5); expect(rAt(tsla, tsla.eod_price)).toBeCloseTo(0.5); expect(targetR(tsla, 2)).toBeCloseTo(0.5)
    expect(rAt(aapl, aapl.best_price)).toBeCloseTo(5); expect(rAt(aapl, aapl.eod_price)).toBeCloseTo(4.5); expect(targetR(aapl, 2)).toBe(2)
    expect(rAt(meta, meta.best_price)).toBeCloseTo(0.5); expect(targetR(meta, 2)).toBeCloseTo(-1)
  })

  it('short trades measure in the other direction', () => {
    const s: Trade = { ...tsla, direction: 'SHORT', entry_price: 60, stop_loss: 62, exit_price: 59, best_price: 56, eod_price: 59 }
    expect(rAt(s, 56)).toBeCloseTo(2); expect(targetR(s, 2)).toBe(2); expect(targetR(s, 2.5)).toBeCloseTo(0.5)
  })

  it('monthly summary: count, win rate, theoretical average and total', () => {
    const { months } = monthlySummary([tsla, aapl, meta], 2)
    expect(months).toHaveLength(1)
    const jan = months[0]
    expect(jan.trades).toBe(3)
    expect(jan.winRate).toBeCloseTo(2 / 3)
    expect(jan.avgTargetR).toBeCloseTo(0.5)   // (0.5 + 2 − 1) / 3, as in the sheet
    expect(jan.sumTargetR).toBeCloseTo(1.5)
    expect(jan.net).toBeCloseTo(10 + 20 - 20)
  })

  it('trades without a best price are left out of the theoretical columns', () => {
    const { total } = monthlySummary([tsla, { ...aapl, best_price: null }], 2)
    expect(total.targetN).toBe(1); expect(total.trades).toBe(2)
    expect(reachShare([tsla, aapl, meta]).shares.find(s => s.level === 2)?.share).toBeCloseTo(1 / 3)
  })

  it('a best price on the losing side is rejected', () => {
    expect(validateTrade({ ...tsla, best_price: 119 })).toMatch(/LONG/)
    expect(validateTrade({ ...tsla, best_price: 123 })).toBeNull()
  })
})
