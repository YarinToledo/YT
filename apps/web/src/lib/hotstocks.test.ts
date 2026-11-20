import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, evaluate, tradePlan } from './hotstocks'
import type { Bar } from './indicators'

/** 250 days of steady uptrend on ~1M shares, then a signal day as given. */
function series(signal: Partial<Bar> & { close: number }): Bar[] {
  const bars: Bar[] = []
  for (let i = 0; i < 250; i++) {
    const c = 50 + i * 0.1 + Math.sin(i / 4)
    bars.push({ date: `d${String(i).padStart(3, '0')}`, open: c, high: c + 0.8, low: c - 0.8, close: c, volume: 1_000_000 })
  }
  const prev = bars[bars.length - 1].close
  bars.push({ date: 'd250', open: prev, high: signal.close + 0.1, low: prev - 0.2, volume: 3_000_000, ...signal })
  return bars
}

describe('hot stocks strategy', () => {
  it('passes a high-volume breakout that closes near its high in an uptrend', () => {
    const bars = series({ close: 78 })
    const c = evaluate('ABC', null, ['gainers'], bars, DEFAULT_FILTERS, 3)!
    expect(c.relVolume).toBeCloseTo(3, 5)
    expect(c.checks.filter(x => !x.pass)).toEqual([])
    expect(c.pass).toBe(true)
    expect(c.plan!.entry).toBeGreaterThan(c.price)
    expect(c.plan!.stop).toBeLessThan(c.price)
    expect((c.plan!.target - c.plan!.entry) / (c.plan!.entry - c.plan!.stop)).toBeCloseTo(3, 1)
  })

  it('rejects a spike that closes at the low of the day', () => {
    const bars = series({ close: 75.2, high: 79, low: 75 })
    const c = evaluate('ABC', null, [], bars, DEFAULT_FILTERS, 3)!
    expect(c.pass).toBe(false)
    expect(c.checks.find(x => x.key === 'Closed in the top of the range')!.pass).toBe(false)
  })

  it('rejects normal volume', () => {
    const bars = series({ close: 78, volume: 1_100_000 })
    expect(evaluate('ABC', null, [], bars, DEFAULT_FILTERS, 3)!.pass).toBe(false)
  })

  it('rejects stocks below their 200-day average', () => {
    const down = series({ close: 40 }).map((b, i) => (i < 250 ? { ...b, close: 100 - i * 0.2, high: 100 - i * 0.2 + 0.8, low: 100 - i * 0.2 - 0.8 } : b))
    const c = evaluate('ABC', null, [], down, DEFAULT_FILTERS, 3)!
    expect(c.checks.find(x => x.key === 'Above the 50- and 200-day averages')!.pass).toBe(false)
  })

  it('caps the stop at 2×ATR for wide signal days', () => {
    const plan = tradePlan({ date: 'x', open: 100, high: 110, low: 90, close: 109, volume: 1 }, 2, 3)!
    expect(plan.entry - plan.stop).toBeCloseTo(4, 1)
  })

  it('needs at least 60 bars', () => {
    expect(evaluate('ABC', null, [], series({ close: 78 }).slice(-30), DEFAULT_FILTERS, 3)).toBeNull()
  })
})
