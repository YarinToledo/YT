/**
 * Leveraged and inverse ETFs: funds that aim for a multiple (2×, 3×, −1×…) of another stock's or index's DAILY move.
 *
 * They show up often in "hot stocks" lists because they move and trade a lot, but they behave differently:
 * the leverage resets every day, so over several choppy days they lose value even if the underlying ends flat.
 */

export interface Leverage {
  underlying: string // ticker or index the fund tracks
  factor: number // 2 = 2× long, -1 = 1× inverse, -3 = 3× inverse
}

/** Well-known funds, so detection works even when only the ticker is known (the IBKR snapshot has no names). */
const KNOWN: Record<string, Leverage> = {
  // Single-stock
  NVDL: { underlying: 'NVDA', factor: 2 }, NVDU: { underlying: 'NVDA', factor: 2 }, NVDX: { underlying: 'NVDA', factor: 2 },
  NVDD: { underlying: 'NVDA', factor: -1 }, NVDQ: { underlying: 'NVDA', factor: -2 },
  TSLL: { underlying: 'TSLA', factor: 2 }, TSLR: { underlying: 'TSLA', factor: 2 }, TSLT: { underlying: 'TSLA', factor: 2 },
  TSLQ: { underlying: 'TSLA', factor: -2 }, TSLS: { underlying: 'TSLA', factor: -1 }, TSLZ: { underlying: 'TSLA', factor: -2 },
  MSTU: { underlying: 'MSTR', factor: 2 }, MSTX: { underlying: 'MSTR', factor: 2 }, MSTZ: { underlying: 'MSTR', factor: -2 },
  CONL: { underlying: 'COIN', factor: 2 }, COIG: { underlying: 'COIN', factor: 2 },
  AAPU: { underlying: 'AAPL', factor: 2 }, AAPD: { underlying: 'AAPL', factor: -1 },
  AMZU: { underlying: 'AMZN', factor: 2 }, AMZD: { underlying: 'AMZN', factor: -1 },
  MSFU: { underlying: 'MSFT', factor: 2 }, MSFD: { underlying: 'MSFT', factor: -1 },
  GGLL: { underlying: 'GOOGL', factor: 2 }, GGLS: { underlying: 'GOOGL', factor: -1 },
  METU: { underlying: 'META', factor: 2 }, FBL: { underlying: 'META', factor: 2 },
  AMDL: { underlying: 'AMD', factor: 2 }, AMUU: { underlying: 'AMD', factor: 2 },
  PLTU: { underlying: 'PLTR', factor: 2 }, PTIR: { underlying: 'PLTR', factor: 2 },
  AVL: { underlying: 'AVGO', factor: 2 }, AVGX: { underlying: 'AVGO', factor: 2 },
  SMCX: { underlying: 'SMCI', factor: 2 }, ARMG: { underlying: 'ARM', factor: 2 },
  NFXL: { underlying: 'NFLX', factor: 2 }, HOOX: { underlying: 'HOOD', factor: 2 },
  // Index and sector
  TQQQ: { underlying: 'QQQ', factor: 3 }, SQQQ: { underlying: 'QQQ', factor: -3 }, QLD: { underlying: 'QQQ', factor: 2 }, QID: { underlying: 'QQQ', factor: -2 },
  UPRO: { underlying: 'SPY', factor: 3 }, SPXL: { underlying: 'SPY', factor: 3 }, SPXU: { underlying: 'SPY', factor: -3 }, SPXS: { underlying: 'SPY', factor: -3 },
  SSO: { underlying: 'SPY', factor: 2 }, SDS: { underlying: 'SPY', factor: -2 }, SH: { underlying: 'SPY', factor: -1 },
  TNA: { underlying: 'IWM', factor: 3 }, TZA: { underlying: 'IWM', factor: -3 },
  SOXL: { underlying: 'SOXX', factor: 3 }, SOXS: { underlying: 'SOXX', factor: -3 },
  TECL: { underlying: 'XLK', factor: 3 }, TECS: { underlying: 'XLK', factor: -3 },
  FAS: { underlying: 'XLF', factor: 3 }, FAZ: { underlying: 'XLF', factor: -3 },
  LABU: { underlying: 'XBI', factor: 3 }, LABD: { underlying: 'XBI', factor: -3 },
  FNGU: { underlying: 'FANG+', factor: 3 }, FNGD: { underlying: 'FANG+', factor: -3 },
  YINN: { underlying: 'FXI', factor: 3 }, YANG: { underlying: 'FXI', factor: -3 },
  NUGT: { underlying: 'GDX', factor: 2 }, DUST: { underlying: 'GDX', factor: -2 },
  BITX: { underlying: 'BTC', factor: 2 }, BITU: { underlying: 'BTC', factor: 2 }, SBIT: { underlying: 'BTC', factor: -2 },
  ETHU: { underlying: 'ETH', factor: 2 }, UVXY: { underlying: 'VIX', factor: 1.5 }, SVIX: { underlying: 'VIX', factor: -1 },
}

const NAME_HINT = /\b(daily|leveraged|inverse|ultra(pro|short)?|bull|bear|[0-9](\.[0-9]+)?\s*[x×])\b/i
const FACTOR = /\b(-?[0-9](?:\.[0-9]+)?)\s*[x×]\b/i
const NOT_TICKERS = new Set(['ETF', 'ETFS', 'TRUST', 'DAILY', 'SHARES', 'LONG', 'SHORT', 'BULL', 'BEAR', 'TARGET', 'FUND', 'INC', 'THE', 'AND', 'X', 'USD', 'II', 'III'])

/**
 * Detects a leveraged/inverse fund from its ticker and, when available, its name
 * (e.g. "Direxion Daily NVDA Bull 2X Shares", "T-Rex 2X Inverse Tesla Daily Target ETF").
 */
export function detectLeverage(symbol: string, name?: string | null): Leverage | null {
  const known = KNOWN[symbol.toUpperCase()]
  if (known) return known
  if (!name || !/\b(etf|etn|shares|fund|trust)\b/i.test(name) || !NAME_HINT.test(name)) return null
  const inverse = /\b(inverse|short|bear)\b/i.test(name)
  const f = name.match(FACTOR)
  const mag = f ? Math.abs(Number(f[1])) : (/ultrapro/i.test(name) ? 3 : /ultra/i.test(name) ? 2 : null)
  if (mag == null) return null
  // Underlying: the first ALL-CAPS token that looks like a ticker (not the fund's own ticker or boilerplate).
  const tok = name.match(/\b[A-Z]{1,5}\b/g)?.find(w => w !== symbol.toUpperCase() && !NOT_TICKERS.has(w))
  return { underlying: tok ?? '?', factor: inverse ? -mag : mag }
}

export function leverageLabel(l: Leverage): string {
  return `${l.factor < 0 ? '−' : ''}${Math.abs(l.factor)}×`
}
