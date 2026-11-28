import { describe, expect, it } from 'vitest'
import { backtest, checkedBars, portfolioStress, reviewJournal, weeklyBars, type BacktestConfig } from './desk'
import { DEFAULT_SETTINGS, type Trade } from './types'
import type { Bar } from './indicators'

const prices = (values: number[]): Bar[] => values.map((close, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), open: close, high: close + .1, low: close - .1, close, volume: 100 }))
const fixture = () => prices([10, 10, 9, 8, 12, 12, 13, 13, 13])
const cfg: BacktestConfig = { strategy: 'cross', fast: 2, slow: 3, stopPct: 10, rewardRisk: 2, maxHold: 20, capital: 1000, riskPct: 1.5, feeBps: 0, slippageBps: 0, fractional: true }
const trade = (p: Partial<Trade> = {}): Trade => ({ id: '1', symbol: 'GOOGL', company: null, direction: 'LONG', status: 'CLOSED', entry_price: 100, stop_loss: 95, take_profit: 115, quantity: 2, exit_price: 110, fees: 0, opened_at: '2026-01-01T15:00:00Z', closed_at: '2026-01-02T15:00:00Z', created_at: '2026-01-01T00:00:00Z', notes: null, setup: 'breakout', ...p })

describe('historical simulation execution', () => {
  it('uses the previous close signal and the next open, never the signal close', () => {
    const bars = fixture()
    bars[5] = { ...bars[5], open: 11.8, low: 11.7 }
    const r = backtest(bars, cfg)
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0]).toMatchObject({ signalDate: bars[4].date, entryDate: bars[5].date, entry: 11.8 })
    expect(r.trades[0].entryDate > r.trades[0].signalDate).toBe(true)
    expect(r.endEquity).toBeCloseTo(r.curve[r.curve.length - 1].equity)
  })

  it('does not let future prices change earlier entries or stop levels', () => {
    const a = fixture(), b = fixture()
    b[8] = { ...b[8], open: 40, high: 45, low: 39, close: 44 }
    const x = backtest(a, cfg).trades[0], y = backtest(b, cfg).trades[0]
    expect([x.entry, x.entryDate, x.stop, x.target, x.quantity]).toEqual([y.entry, y.entryDate, y.stop, y.target, y.quantity])
  })

  it('fills a gap below the stop at the opening price, allowing more than 1R loss', () => {
    const bars = fixture()
    bars[6] = { ...bars[6], open: 8, high: 8.5, low: 7.5, close: 8 }
    const tr = backtest(bars, cfg).trades[0]
    expect(tr.reason).toBe('stop')
    expect(tr.exit).toBe(8)
    expect(tr.r).toBeLessThan(-1)
  })

  it('assumes the stop first when both thresholds are reached in the entry bar', () => {
    const bars = fixture()
    bars[5] = { ...bars[5], high: 20, low: 8 }
    const tr = backtest(bars, cfg).trades[0]
    expect(tr.reason).toBe('stop')
    expect(tr.exit).toBeCloseTo(10.8)
    expect(tr.r).toBeCloseTo(-1)
  })

  it('caps both position cost and estimated stopped-out loss including costs', () => {
    const r = backtest(fixture(), { ...cfg, riskPct: 100, feeBps: 100, slippageBps: 50 })
    const tr = r.trades[0]
    expect(tr.quantity * tr.entry * 1.01).toBeLessThanOrEqual(1000)
    expect(tr.pnl).toBeLessThan(backtest(fixture(), { ...cfg, riskPct: 100 }).trades[0].pnl)
    const limited = backtest(fixture(), { ...cfg, feeBps: 10, slippageBps: 5 }).trades[0]
    const estimatedLoss = limited.quantity * (limited.entry * 1.001 - limited.stop * .9995 * .999)
    expect(estimatedLoss).toBeLessThanOrEqual(15)
  })

  it('can validly return zero trades while reporting net buy-and-hold on matching dates', () => {
    const bars = prices(Array(20).fill(10))
    const r = backtest(bars, { ...cfg, feeBps: 10, slippageBps: 5 })
    expect(r.trades).toEqual([])
    expect(r.returnPct).toBe(0)
    expect(r.winRate).toBeNull()
    expect(r.profitFactor).toBeNull()
    expect(r.benchmarkReturn).toBeLessThan(0)
    expect(r.start).toBe(bars[cfg.slow + 1].date)
  })

  it('breakout excludes the signal candle from its lookback and fills next day', () => {
    const bars = prices([10, 10, 10, 12, 12, 12, 12, 12])
    const r = backtest(bars, { ...cfg, strategy: 'breakout' })
    expect(r.trades[0]).toMatchObject({ signalDate: bars[3].date, entryDate: bars[4].date })
    expect(() => backtest(bars, { ...cfg, strategy: 'breakout', fast: 4, slow: 3 })).not.toThrow()
  })

  it('tracks mark-to-market drawdown rather than treating deployed cash as a loss', () => {
    const bars = fixture()
    const r = backtest(bars, cfg)
    expect(r.maxDrawdown).toBe(0)
    bars[6] = { ...bars[6], open: 11, high: 11.1, low: 10.9, close: 11 }
    expect(backtest(bars, cfg).maxDrawdown).toBeGreaterThan(0)
  })

  it('rejects impossible OHLC, duplicate dates, impossible dates and invalid settings', () => {
    expect(() => checkedBars([fixture()[0], fixture()[0]])).toThrow(/duplicate/)
    expect(() => checkedBars([{ ...fixture()[0], high: 1 }])).toThrow(/invalid/)
    expect(() => checkedBars([{ ...fixture()[0], date: '2026-02-31' }])).toThrow(/invalid/)
    expect(() => backtest(fixture(), { ...cfg, feeBps: NaN })).toThrow(/costs/)
    expect(() => backtest(fixture(), { ...cfg, fast: 3, slow: 2 })).toThrow(/periods/)
    expect(() => backtest(fixture().slice(0, 4), cfg)).toThrow(/enough/)
  })
})

describe('weekly candle boundaries', () => {
  it('aggregates OHLC and volume, including holiday-shortened weeks, and omits this week', () => {
    const data = [
      { ...fixture()[0], date: '2026-11-23', open: 10, high: 13, low: 9, close: 12 },
      { ...fixture()[0], date: '2026-11-25', open: 12, high: 14, low: 11, close: 13 },
      { ...fixture()[0], date: '2026-11-30', open: 13, high: 15, low: 12, close: 14 },
    ]
    const weeks = weeklyBars(data, new Date('2026-12-01T12:00:00Z'))
    expect(weeks).toEqual([{ date: '2026-11-25', open: 10, high: 14, low: 9, close: 13, volume: 200 }])
    expect(weeklyBars(data, new Date('2026-11-27T22:00:00Z'))).toEqual([])
  })
})

describe('portfolio stress and journal evidence', () => {
  it('nets long/short shock P&L but keeps gross concentration, excluding planned trades', () => {
    const s = portfolioStress([
      trade({ status: 'OPEN', closed_at: null }),
      trade({ id: '2', direction: 'SHORT', status: 'OPEN', closed_at: null, quantity: 1 }),
      trade({ id: '3', status: 'PLANNED', quantity: 1000 }),
    ], DEFAULT_SETTINGS)
    expect(s.shock).toBe(-20)
    expect(s.gross).toBe(300)
    expect(s.stressedEquity).toBe(980)
    expect(s.allocations).toEqual([{ symbol: 'GOOGL', value: 300, weight: 1 }])
  })

  it('uses only the latest 20 dated closed trades without mutating the account', () => {
    const data = Array.from({ length: 25 }, (_, i) => trade({ id: String(i), closed_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString() })).reverse()
    const order = data.map(t => t.id)
    const r = reviewJournal([...data, trade({ status: 'OPEN' }), trade({ closed_at: null })], 3)
    expect(r.recent).toHaveLength(20)
    expect(r.recent[0].id).toBe('5')
    expect(r.recent[19].id).toBe('24')
    expect(data.map(t => t.id)).toEqual(order)
  })

  it('counts recorded evidence, excludes missing outcomes and does not invent behavioral causes', () => {
    const r = reviewJournal([
      trade({ setup: '', take_profit: 105, exit_price: 94 }),
      trade({ id: '2', exit_price: null }),
      trade({ id: '3', take_profit: null }),
    ], 3)
    expect(r.excluded).toBe(1)
    expect(r.noSetup).toBe(1)
    expect(r.belowRR).toBe(1)
    expect(r.overStop).toBe(1)
    expect(r.missingTarget).toBe(1)
    expect(r.stats.closed).toBe(2)
  })
})
