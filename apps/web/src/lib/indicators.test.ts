import { describe, expect, it } from 'vitest'
import { atr, ema, longScenario, macd, rsi, sma, supportResistance, technicals, type Bar } from './indicators'

const bars = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }))

describe('moving averages', () => {
  it('sma', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })
  it('ema seeds with sma then smooths', () => {
    const e = ema([1, 2, 3, 4, 5], 3)
    expect(e.slice(0, 2)).toEqual([null, null])
    expect(e[2]).toBe(2)
    expect(e[3]).toBe(3) // 4*0.5 + 2*0.5
    expect(e[4]).toBe(4)
  })
})

describe('rsi', () => {
  it('is 100 for a straight rally and 0 for a straight decline', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i)
    expect(rsi(up)).toBe(100)
    expect(rsi(up.slice().reverse())).toBe(0)
  })
  it('is 50 for alternating equal moves', () => {
    const alt = Array.from({ length: 41 }, (_, i) => (i % 2 ? 101 : 100))
    const r = rsi(alt)!
    expect(r).toBeGreaterThan(45) // Wilder smoothing leans toward the last move
    expect(r).toBeLessThan(55)
  })
  it('needs more than n values', () => {
    expect(rsi([1, 2, 3], 14)).toBeNull()
  })
})

describe('macd / atr', () => {
  it('macd is positive in an accelerating rally', () => {
    const v = Array.from({ length: 80 }, (_, i) => 100 + i * i * 0.05)
    expect(macd(v)!.macd).toBeGreaterThan(0)
  })
  it('atr of constant-range bars equals the range', () => {
    expect(atr(bars(Array(30).fill(50)))).toBe(2)
  })
})

describe('support / resistance', () => {
  it('finds the nearest swing levels around price', () => {
    // up to 120, down to 90, back up to 110
    const path = [
      ...Array.from({ length: 20 }, (_, i) => 100 + i),
      ...Array.from({ length: 30 }, (_, i) => 119 - i),
      ...Array.from({ length: 21 }, (_, i) => 90 + i),
    ]
    const { support, resistance } = supportResistance(bars(path))
    expect(resistance).toBe(120) // swing high 119 + 1
    expect(support).toBe(89) // swing low 90 - 1
  })
})

describe('technicals + scenario', () => {
  it('reads a steady uptrend as bullish and builds a long scenario below price', () => {
    const up = Array.from({ length: 260 }, (_, i) => 50 + i * 0.2 + Math.sin(i / 3))
    const t = technicals(bars(up))!
    expect(t.trend).toBe('up')
    expect(t.bias).toBe('bullish')
    const s = longScenario(t)!
    expect(s.stop).toBeLessThan(s.entry)
    expect(s.target).toBeGreaterThan(s.entry)
    expect(s.rr).toBeGreaterThanOrEqual(2 - 1e-9)
  })
  it('reads a steady downtrend as bearish', () => {
    const down = Array.from({ length: 260 }, (_, i) => 150 - i * 0.2 + Math.sin(i / 3))
    const t = technicals(bars(down))!
    expect(t.trend).toBe('down')
    expect(t.bias).toBe('bearish')
  })
  it('needs at least 30 bars', () => {
    expect(technicals(bars([1, 2, 3]))).toBeNull()
  })
})
