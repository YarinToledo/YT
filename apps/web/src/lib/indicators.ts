/** Technical indicator math. Input bars are sorted oldest → newest. */

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  values.forEach((v, i) => {
    sum += v
    if (i >= n) sum -= values[i - n]
    out.push(i >= n - 1 ? sum / n : null)
  })
  return out
}

export function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = []
  const k = 2 / (n + 1)
  let prev: number | null = null
  values.forEach((v, i) => {
    if (i < n - 1) return out.push(null)
    if (prev == null) prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n
    else prev = v * k + prev * (1 - k)
    out.push(prev)
  })
  return out
}

/** Wilder's RSI. */
export function rsi(values: number[], n = 14): number | null {
  if (values.length <= n) return null
  let gain = 0, loss = 0
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1]
    if (d > 0) gain += d; else loss -= d
  }
  gain /= n; loss /= n
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (n - 1) + Math.max(d, 0)) / n
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n
  }
  if (loss === 0) return 100
  return 100 - 100 / (1 + gain / loss)
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast), s = ema(values, slow)
  const line = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null))
  const valid = line.filter((x): x is number => x != null)
  if (valid.length < signal) return null
  const sig = ema(valid, signal)
  const m = valid[valid.length - 1], sg = sig[sig.length - 1]!
  const prevM = valid[valid.length - 2], prevS = sig[sig.length - 2]
  return { macd: m, signal: sg, hist: m - sg, crossedUp: prevS != null && prevM <= prevS && m > sg, crossedDown: prevS != null && prevM >= prevS && m < sg }
}

/** Average true range (simple average of the last n true ranges). */
export function atr(bars: Bar[], n = 14): number | null {
  if (bars.length <= n) return null
  const tr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1].close
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)))
  }
  const last = tr.slice(-n)
  return last.reduce((a, b) => a + b, 0) / last.length
}

/** Swing highs/lows: a bar whose high (low) is the extreme of `k` bars on each side. */
export function swingLevels(bars: Bar[], k = 5) {
  const highs: number[] = [], lows: number[] = []
  for (let i = k; i < bars.length - k; i++) {
    const win = bars.slice(i - k, i + k + 1)
    if (win.every(b => b.high <= bars[i].high)) highs.push(bars[i].high)
    if (win.every(b => b.low >= bars[i].low)) lows.push(bars[i].low)
  }
  return { highs, lows }
}

/** Nearest support below and resistance above price, from swing levels over the lookback window. */
export function supportResistance(bars: Bar[], lookback = 120) {
  const recent = bars.slice(-lookback)
  const price = recent[recent.length - 1]?.close
  if (price == null) return { support: null, resistance: null }
  const { highs, lows } = swingLevels(recent)
  const levels = [...highs, ...lows]
  const below = levels.filter(l => l < price).sort((a, b) => b - a)
  const above = levels.filter(l => l > price).sort((a, b) => a - b)
  return { support: below[0] ?? null, resistance: above[0] ?? null }
}

const change = (bars: Bar[], days: number) => {
  if (bars.length <= days) return null
  const a = bars[bars.length - 1 - days].close, b = bars[bars.length - 1].close
  return a > 0 ? b / a - 1 : null
}

export type Bias = 'bullish' | 'bearish' | 'neutral'
export interface Signal { key: string; vars?: Record<string, string | number>; bias: Bias }

export interface Technicals {
  price: number
  sma20: number | null; sma50: number | null; sma200: number | null
  rsi: number | null
  macd: ReturnType<typeof macd>
  atr: number | null
  high52: number; low52: number
  perf: { m1: number | null; m3: number | null; m6: number | null; y1: number | null }
  volRatio: number | null
  support: number | null; resistance: number | null
  trend: 'up' | 'down' | 'sideways'
  signals: Signal[]
  score: number
  bias: Bias
}

export function technicals(bars: Bar[]): Technicals | null {
  if (bars.length < 30) return null
  const closes = bars.map(b => b.close)
  const last = <T,>(a: T[]) => a[a.length - 1]
  const price = last(closes)
  const s20 = last(sma(closes, 20)), s50 = last(sma(closes, 50)), s200 = last(sma(closes, 200))
  const s50Prev = sma(closes, 50)[closes.length - 21] ?? null
  const r = rsi(closes)
  const m = macd(closes)
  const year = bars.slice(-252)
  const high52 = Math.max(...year.map(b => b.high))
  const low52 = Math.min(...year.map(b => b.low))
  const vols = bars.map(b => b.volume)
  const avgVol = last(sma(vols, 50))
  const vol5 = vols.slice(-5).reduce((a, b) => a + b, 0) / 5
  const { support, resistance } = supportResistance(bars)

  const signals: Signal[] = []
  if (s200 != null) signals.push(price > s200 ? { key: 'Price above the 200-day average (long-term uptrend)', bias: 'bullish' } : { key: 'Price below the 200-day average (long-term downtrend)', bias: 'bearish' })
  if (s50 != null) signals.push(price > s50 ? { key: 'Price above the 50-day average', bias: 'bullish' } : { key: 'Price below the 50-day average', bias: 'bearish' })
  if (s50 != null && s200 != null) signals.push(s50 > s200 ? { key: '50-day average above the 200-day (golden cross structure)', bias: 'bullish' } : { key: '50-day average below the 200-day (death cross structure)', bias: 'bearish' })
  if (s50 != null && s50Prev != null) signals.push(s50 > s50Prev ? { key: '50-day average is rising', bias: 'bullish' } : { key: '50-day average is falling', bias: 'bearish' })
  if (r != null) {
    if (r >= 70) signals.push({ key: 'RSI {v}: overbought, pullback risk', vars: { v: r.toFixed(0) }, bias: 'bearish' })
    else if (r <= 30) signals.push({ key: 'RSI {v}: oversold, bounce possible', vars: { v: r.toFixed(0) }, bias: 'bullish' })
    else signals.push({ key: 'RSI {v}: neutral momentum', vars: { v: r.toFixed(0) }, bias: r >= 50 ? 'bullish' : 'neutral' })
  }
  if (m) {
    if (m.crossedUp) signals.push({ key: 'MACD just crossed above its signal line', bias: 'bullish' })
    else if (m.crossedDown) signals.push({ key: 'MACD just crossed below its signal line', bias: 'bearish' })
    else signals.push(m.hist > 0 ? { key: 'MACD above its signal line (positive momentum)', bias: 'bullish' } : { key: 'MACD below its signal line (negative momentum)', bias: 'bearish' })
  }
  if (price >= high52 * 0.97) signals.push({ key: 'Trading near the 52-week high', bias: 'bullish' })
  else if (price <= low52 * 1.03) signals.push({ key: 'Trading near the 52-week low', bias: 'bearish' })
  const volRatio = avgVol ? vol5 / avgVol : null
  if (volRatio != null && volRatio > 1.5) signals.push({ key: 'Volume {v}× above average in the last 5 days', vars: { v: volRatio.toFixed(1) }, bias: 'neutral' })

  const score = signals.reduce((a, s) => a + (s.bias === 'bullish' ? 1 : s.bias === 'bearish' ? -1 : 0), 0)
  const bias: Bias = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral'
  const trend = s50 != null && s200 != null ? (price > s50 && s50 > s200 ? 'up' : price < s50 && s50 < s200 ? 'down' : 'sideways') : 'sideways'

  return {
    price, sma20: s20, sma50: s50, sma200: s200, rsi: r, macd: m, atr: atr(bars),
    high52, low52,
    perf: { m1: change(bars, 21), m3: change(bars, 63), m6: change(bars, 126), y1: change(bars, 252) },
    volRatio, support, resistance, trend, signals, score, bias,
  }
}

/**
 * A long-side scenario for the trade planner: entry at last price, stop below support
 * (or 2×ATR), target at resistance, but never less than 2R. Returns null if it can't be built.
 */
export function longScenario(t: Technicals) {
  const a = t.atr ?? t.price * 0.02
  const stopFromSupport = t.support != null ? t.support - 0.5 * a : null
  const stop = stopFromSupport != null && stopFromSupport < t.price && t.price - stopFromSupport <= 4 * a ? stopFromSupport : t.price - 2 * a
  const risk = t.price - stop
  if (!(risk > 0) || stop <= 0) return null
  const target = Math.max(t.resistance ?? 0, t.price + 2 * risk)
  const r2 = (n: number) => Math.round(n * 100) / 100
  return { entry: r2(t.price), stop: r2(stop), target: r2(target), rr: (target - t.price) / risk }
}
