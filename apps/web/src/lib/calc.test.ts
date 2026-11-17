import { describe, expect, it } from 'vitest'
import { equityCurve, planPosition, riskUsage, tradePnl, tradeStats, rMultiple, startOfWeek } from './calc'
import { DEFAULT_SETTINGS, type Trade } from './types'

const base: Trade = {
  id: 'x', symbol: 'NVDA', company: null, direction: 'LONG', status: 'CLOSED',
  entry_price: 100, stop_loss: 98, take_profit: 106, quantity: 7.5, exit_price: 106,
  fees: 0, opened_at: '2026-11-10T14:00:00Z', closed_at: '2026-11-10T18:00:00Z',
  setup: null, notes: null, created_at: '2026-11-10T13:00:00Z',
}
const t = (o: Partial<Trade>): Trade => ({ ...base, ...o })

describe('planPosition', () => {
  const p = { direction: 'LONG' as const, entry: 100, stop: 98, target: 106, equity: 1000, riskPct: 1.5, fractional: true }

  it('matches the prototype example (7.5 shares, $15 risk, 1:3)', () => {
    const r = planPosition(p)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.quantity).toBe(7.5)
    expect(r.riskAmount).toBeCloseTo(15)
    expect(r.rr).toBeCloseTo(3)
  })

  it('rounds down to whole shares so risk never exceeds budget', () => {
    const r = planPosition({ ...p, fractional: false })
    expect(r.ok && r.quantity).toBe(7)
    expect(r.ok && r.riskAmount).toBeLessThanOrEqual(15)
  })

  it('rejects stops on the wrong side', () => {
    expect(planPosition({ ...p, stop: 101 }).ok).toBe(false)
    expect(planPosition({ ...p, direction: 'SHORT' }).ok).toBe(false)
  })

  it('sizes shorts', () => {
    const r = planPosition({ ...p, direction: 'SHORT', stop: 103, target: 91 })
    expect(r.ok && r.quantity).toBe(5)
    expect(r.ok && r.rr).toBeCloseTo(3)
  })

  it('reports when the budget cannot buy one whole share', () => {
    const r = planPosition({ ...p, stop: 50, fractional: false })
    expect(r.ok).toBe(false)
  })
})

describe('tradePnl / rMultiple', () => {
  it('long win', () => expect(tradePnl(base)).toBeCloseTo(45))
  it('short loss with fees', () =>
    expect(tradePnl(t({ direction: 'SHORT', stop_loss: 102, take_profit: 94, exit_price: 102, quantity: 5, fees: 1 }))).toBeCloseTo(-11))
  it('open trade has no realized pnl', () => expect(tradePnl(t({ status: 'OPEN', exit_price: null }))).toBe(0))
  it('R multiple', () => expect(rMultiple(base)).toBeCloseTo(3))
})

describe('tradeStats', () => {
  it('computes win rate and profit factor', () => {
    const s = tradeStats([base, t({ exit_price: 98 }), t({ status: 'OPEN', exit_price: null })])
    expect(s.closed).toBe(2)
    expect(s.winRate).toBe(0.5)
    expect(s.profitFactor).toBeCloseTo(45 / 15)
    expect(s.net).toBeCloseTo(30)
  })
  it('handles no trades', () => {
    const s = tradeStats([])
    expect(s.winRate).toBeNull()
    expect(s.profitFactor).toBeNull()
  })
})

describe('equityCurve', () => {
  it('steps up on the close date', () => {
    const pts = equityCurve(DEFAULT_SETTINGS, [base], 3, new Date(2026, 10, 11, 12))
    expect(pts.map(p => p.equity)).toEqual([1000, 1045, 1045])
  })
})

describe('riskUsage', () => {
  const now = new Date(2026, 10, 12, 15) // Thursday
  it('locks after daily loss limit', () => {
    const loss = t({ exit_price: 96, quantity: 8, closed_at: new Date(2026, 10, 12, 10).toISOString() }) // -32
    const u = riskUsage(DEFAULT_SETTINGS, [loss], now)
    expect(u.dailyLoss).toBeCloseTo(32)
    expect(u.dailyLocked).toBe(true)
  })
  it('counts open positions', () => {
    const u = riskUsage(DEFAULT_SETTINGS, [t({ status: 'OPEN', exit_price: null }), t({ status: 'OPEN', exit_price: null })], now)
    expect(u.positionsFull).toBe(true)
    expect(u.openRisk).toBeCloseTo(30)
  })
  it('week starts Monday', () => {
    expect(startOfWeek(new Date(2026, 10, 15)).getDate()).toBe(9) // Sunday Nov 15 -> Monday Nov 9
  })
})
