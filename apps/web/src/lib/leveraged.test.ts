import { describe, expect, it } from 'vitest'
import { detectLeverage, leverageLabel } from './leveraged'

describe('detectLeverage', () => {
  it('knows common single-stock and index funds by ticker', () => {
    expect(detectLeverage('NVDL')).toEqual({ underlying: 'NVDA', factor: 2 })
    expect(detectLeverage('sqqq')).toEqual({ underlying: 'QQQ', factor: -3 })
  })

  it('reads the factor and underlying from the fund name', () => {
    expect(detectLeverage('ABCD', 'Direxion Daily RKLB Bull 2X Shares')).toEqual({ underlying: 'RKLB', factor: 2 })
    expect(detectLeverage('WXYZ', 'GraniteShares 1.5x Long IONQ Daily ETF')).toEqual({ underlying: 'IONQ', factor: 1.5 })
    expect(detectLeverage('QWER', 'Defiance Daily Target 2X Short OKLO ETF')).toEqual({ underlying: 'OKLO', factor: -2 })
  })

  it('leaves ordinary stocks and plain ETFs alone', () => {
    expect(detectLeverage('NVDA', 'NVIDIA Corporation')).toBeNull()
    expect(detectLeverage('SPY', 'SPDR S&P 500 ETF Trust')).toBeNull()
    expect(detectLeverage('BULL', 'Webull Corporation')).toBeNull()
  })

  it('labels inverse funds with a minus sign', () => {
    expect(leverageLabel({ underlying: 'QQQ', factor: -3 })).toBe('−3×')
    expect(leverageLabel({ underlying: 'NVDA', factor: 2 })).toBe('2×')
  })
})
