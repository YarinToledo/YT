/**
 * "Stocks in play" momentum swing strategy, evaluated on daily bars after the close.
 *
 * Signal day: unusually high volume, close near the day's high, in an established uptrend, not over-extended.
 * Plan: buy-stop just above the signal day's high, stop under its low (capped at 2×ATR), target at the user's R:R.
 */
import { atr, rsi, sma, type Bar } from './indicators'

export interface ScanFilters {
  minPrice: number
  minAvgVolume: number // 50-day average shares
  minRelVolume: number // signal-day volume ÷ 50-day average
  minCloseLocation: number // 0 = closed at the low, 1 = at the high
  minChangePct: number // signal-day change, e.g. 0.01 = +1%
  maxExtension: number // max distance above the 20-day average, e.g. 0.25 = 25%
  requireUptrend: boolean // above 50- and 200-day averages
  hideLeveraged: boolean // drop leveraged/inverse ETFs (they mirror another stock's move)
}

export const DEFAULT_FILTERS: ScanFilters = {
  minPrice: 5,
  minAvgVolume: 500_000,
  minRelVolume: 2,
  minCloseLocation: 0.7,
  minChangePct: 0.01,
  maxExtension: 0.25,
  requireUptrend: true,
  hideLeveraged: false,
}

export interface Check { key: string; pass: boolean; value: string }

export interface Candidate {
  symbol: string
  name: string | null
  source: string[]
  date: string
  price: number
  changePct: number
  relVolume: number | null
  avgVolume: number | null
  closeLocation: number
  sma20: number | null; sma50: number | null; sma200: number | null
  extension: number | null
  rsi: number | null
  atr: number | null
  perf3m: number | null
  fromHigh52: number // 0 = at the 52-week high, 0.1 = 10% below it
  checks: Check[]
  pass: boolean
  score: number
  plan: { entry: number; stop: number; target: number; rr: number } | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function tradePlan(signal: Bar, atrValue: number | null, rr: number) {
  const entry = r2(signal.high + Math.max(0.01, signal.high * 0.001)) // buy-stop a tick above the high
  const a = atrValue ?? (signal.high - signal.low)
  let stop = signal.low - 0.1 * a
  if (entry - stop > 2 * a) stop = entry - 2 * a
  stop = r2(stop)
  if (!(stop > 0) || stop >= entry) return null
  return { entry, stop, target: r2(entry + rr * (entry - stop)), rr }
}

export function evaluate(symbol: string, name: string | null, source: string[], bars: Bar[], f: ScanFilters, rr: number): Candidate | null {
  if (bars.length < 60) return null
  const last = bars[bars.length - 1], prev = bars[bars.length - 2]
  const closes = bars.map(b => b.close)
  const vols = bars.map(b => b.volume)
  const at = <T,>(a: T[]) => a[a.length - 1]
  const s20 = at(sma(closes, 20)), s50 = at(sma(closes, 50)), s200 = at(sma(closes, 200))
  // Average volume of the 50 days BEFORE the signal day, so the spike doesn't inflate its own baseline.
  const avgVol = at(sma(vols.slice(0, -1), 50))
  const relVol = avgVol ? last.volume / avgVol : null
  const range = last.high - last.low
  const closeLoc = range > 0 ? (last.close - last.low) / range : 1
  const change = prev.close > 0 ? last.close / prev.close - 1 : 0
  const ext = s20 ? last.close / s20 - 1 : null
  const year = bars.slice(-252)
  const high52 = Math.max(...year.map(b => b.high))
  const atrV = atr(bars)
  const r = rsi(closes)
  const perf3m = bars.length > 63 ? last.close / bars[bars.length - 64].close - 1 : null

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const checks: Check[] = [
    { key: 'Price ≥ ${v}', pass: last.close >= f.minPrice, value: last.close.toFixed(2) },
    { key: 'Average volume ≥ {v}', pass: (avgVol ?? 0) >= f.minAvgVolume, value: avgVol ? Math.round(avgVol).toLocaleString() : '—' },
    { key: 'Relative volume ≥ {v}×', pass: (relVol ?? 0) >= f.minRelVolume, value: relVol ? `${relVol.toFixed(1)}×` : '—' },
    { key: 'Closed in the top of the range', pass: closeLoc >= f.minCloseLocation, value: pct(closeLoc) },
    { key: 'Up at least {v} on the day', pass: change >= f.minChangePct, value: pct(change) },
    { key: 'Not over-extended above the 20-day', pass: ext == null || ext <= f.maxExtension, value: ext == null ? '—' : pct(ext) },
  ]
  if (f.requireUptrend) checks.push({ key: 'Above the 50- and 200-day averages', pass: s50 != null && s200 != null && last.close > s50 && last.close > s200, value: s200 == null ? '—' : `${(last.close / s200 - 1 >= 0 ? '+' : '')}${pct(last.close / s200 - 1)}` })

  const pass = checks.every(c => c.pass)
  // Score: volume surge, strong close, trend strength and proximity to the 52-week high.
  const fromHigh = high52 > 0 ? 1 - last.close / high52 : 1
  const score = Math.round(
    Math.min(relVol ?? 0, 6) * 10 + closeLoc * 20 + Math.max(-10, Math.min(20, (perf3m ?? 0) * 50)) + Math.max(0, 15 - fromHigh * 100) - Math.max(0, (r ?? 50) - 80),
  )
  return {
    symbol, name, source, date: last.date, price: last.close, changePct: change, relVolume: relVol, avgVolume: avgVol,
    closeLocation: closeLoc, sma20: s20, sma50: s50, sma200: s200, extension: ext, rsi: r, atr: atrV, perf3m,
    fromHigh52: fromHigh, checks, pass, score, plan: tradePlan(last, atrV, rr),
  }
}

/** Raw scan row from the market-data function: [date, open, high, low, close, volume]. */
export type RawBar = [string, number, number, number, number, number]
export const toBars = (rows: RawBar[]): Bar[] =>
  rows.map(([date, open, high, low, close, volume]) => ({ date, open, high, low, close, volume }))
    .filter(b => [b.open, b.high, b.low, b.close].every(Number.isFinite))
