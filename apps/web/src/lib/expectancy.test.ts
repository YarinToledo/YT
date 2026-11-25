import { describe, expect, it } from 'vitest'
import { expectancyR, inRecommendedZone, journalR, nearestCell, LESSON_COSTS_R } from './expectancy'
import type { Trade } from './types'

describe('expectancy table', () => {
  it('matches the lesson tables before and after costs', () => {
    // before costs (first table in the video)
    expect(expectancyR(0.5, 2)).toBeCloseTo(0.5)
    expect(expectancyR(0.6, 1.5)).toBeCloseTo(0.5)
    expect(expectancyR(0.45, 2.5)).toBeCloseTo(0.575)
    expect(expectancyR(0.5, 1)).toBeCloseTo(0)
    // after costs of 0.2R (second table)
    expect(expectancyR(0.5, 2, LESSON_COSTS_R)).toBeCloseTo(0.3)
    expect(expectancyR(0.55, 2, LESSON_COSTS_R)).toBeCloseTo(0.45)
    expect(expectancyR(0.6, 2, LESSON_COSTS_R)).toBeCloseTo(0.6)
    expect(expectancyR(0.5, 2.5, LESSON_COSTS_R)).toBeCloseTo(0.55)
    expect(expectancyR(0.6, 1, LESSON_COSTS_R)).toBeCloseTo(0)
  })

  it('recommended zone and nearest cell', () => {
    expect(inRecommendedZone(0.55, 2)).toBe(true)
    expect(inRecommendedZone(0.65, 2)).toBe(false)
    expect(inRecommendedZone(0.5, 1)).toBe(false)
    expect(nearestCell(0.57, 1.8)).toEqual({ winRate: 0.55, target: 2 })
    expect(nearestCell(0.1, 9)).toEqual({ winRate: 0.3, target: 3 })
  })

  it('journal stats in R use only closed trades with a stop', () => {
    const base: Trade = { id: '', symbol: 'X', company: null, direction: 'LONG', status: 'CLOSED', entry_price: 100, stop_loss: 99, take_profit: 102, quantity: 10, exit_price: 102, fees: 0, opened_at: null, closed_at: '2026-11-20T15:00:00Z', setup: null, notes: null } as Trade
    const trades = [
      base,                                  // +2R
      { ...base, exit_price: 99 },           // −1R
      { ...base, exit_price: 101.5 },        // +1.5R
      { ...base, status: 'OPEN' as const },  // ignored
      { ...base, stop_loss: 100 },           // no risk → ignored
    ]
    const j = journalR(trades, Date.parse('2026-11-25T00:00:00Z'))
    expect(j.trades).toBe(3)
    expect(j.winRate).toBeCloseTo(2 / 3)
    expect(j.avgWinR).toBeCloseTo(1.75)
    expect(j.avgLossR).toBeCloseTo(-1)
    expect(j.avgR).toBeCloseTo(2.5 / 3)
    expect(j.last30).toBe(4)
  })
})
