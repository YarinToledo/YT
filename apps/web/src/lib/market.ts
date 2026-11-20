import type { RawBar } from './hotstocks'
import { isDemo, supabase } from './data'
import type { Bar } from './indicators'

/** Raw response of the market-data Edge Function: each FMP endpoint is either {data} or {error}. */
type Part = { data?: unknown; error?: string }
export interface MarketRaw {
  symbol: string
  fetchedAt: string
  profile: Part; history: Part; ratios: Part; metrics: Part; income: Part; peers: Part
}

export interface Profile {
  symbol: string; name: string; price: number | null; changePct: number | null; marketCap: number | null
  beta: number | null; sector: string | null; industry: string | null; country: string | null; exchange: string | null
  website: string | null; description: string | null; ceo: string | null; employees: number | null; image: string | null; currency: string | null
}
export interface Fundamentals {
  pe: number | null; ps: number | null; pb: number | null; evEbitda: number | null
  grossMargin: number | null; operatingMargin: number | null; netMargin: number | null
  roe: number | null; debtToEquity: number | null; currentRatio: number | null; dividendYield: number | null; fcfYield: number | null
}
export interface YearRow { year: string; revenue: number | null; netIncome: number | null; eps: number | null }
export interface Peer { symbol: string; name: string | null; price: number | null; marketCap: number | null }

export interface MarketData {
  symbol: string
  fetchedAt: string
  profile: Profile | null
  bars: Bar[]
  fundamentals: Fundamentals | null
  years: YearRow[]
  peers: Peer[]
  errors: Record<string, string>
}

type Obj = Record<string, unknown>
const first = (d: unknown): Obj | null => (Array.isArray(d) ? (d[0] as Obj) ?? null : d && typeof d === 'object' ? (d as Obj) : null)
/** First finite number among several possible field names (FMP renames fields between API versions). */
const num = (o: Obj | null, ...keys: string[]): number | null => {
  if (!o) return null
  for (const k of keys) {
    const v = o[k]
    const n = typeof v === 'string' ? Number(v) : v
    if (typeof n === 'number' && Number.isFinite(n)) return n
  }
  return null
}
const str = (o: Obj | null, ...keys: string[]): string | null => {
  if (!o) return null
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim()
  return null
}

export function normalize(raw: MarketRaw): MarketData {
  const errors: Record<string, string> = {}
  for (const k of ['profile', 'history', 'ratios', 'metrics', 'income', 'peers'] as const) if (raw[k]?.error) errors[k] = raw[k].error!

  const p = first(raw.profile?.data)
  const profile: Profile | null = p && {
    symbol: str(p, 'symbol') ?? raw.symbol,
    name: str(p, 'companyName', 'name') ?? raw.symbol,
    price: num(p, 'price'),
    changePct: num(p, 'changePercentage', 'changesPercentage'),
    marketCap: num(p, 'marketCap', 'mktCap'),
    beta: num(p, 'beta'),
    sector: str(p, 'sector'), industry: str(p, 'industry'), country: str(p, 'country'), exchange: str(p, 'exchange', 'exchangeShortName'),
    website: str(p, 'website'), description: str(p, 'description'), ceo: str(p, 'ceo'),
    employees: num(p, 'fullTimeEmployees'), image: str(p, 'image'), currency: str(p, 'currency'),
  }

  // History: stable API returns a flat array; legacy returned { historical: [...] }
  const h = raw.history?.data
  const rows = (Array.isArray(h) ? h : (h as Obj | null)?.historical ?? []) as Obj[]
  const bars: Bar[] = rows
    .map(r => ({
      date: String(r.date ?? ''),
      open: num(r, 'open', 'adjOpen') ?? NaN,
      high: num(r, 'high', 'adjHigh') ?? NaN,
      low: num(r, 'low', 'adjLow') ?? NaN,
      close: num(r, 'close', 'adjClose') ?? NaN,
      volume: num(r, 'volume') ?? 0,
    }))
    .filter(b => b.date && [b.open, b.high, b.low, b.close].every(Number.isFinite))
    .sort((a, b) => a.date.localeCompare(b.date))

  const r = first(raw.ratios?.data), m = first(raw.metrics?.data)
  const fundamentals: Fundamentals | null = r || m ? {
    pe: num(r, 'priceToEarningsRatioTTM', 'peRatioTTM') ?? num(m, 'peRatioTTM'),
    ps: num(r, 'priceToSalesRatioTTM') ?? num(m, 'priceToSalesRatioTTM'),
    pb: num(r, 'priceToBookRatioTTM', 'priceBookValueRatioTTM') ?? num(m, 'pbRatioTTM'),
    evEbitda: num(m, 'evToEBITDATTM', 'enterpriseValueOverEBITDATTM') ?? num(r, 'enterpriseValueMultipleTTM'),
    grossMargin: num(r, 'grossProfitMarginTTM'),
    operatingMargin: num(r, 'operatingProfitMarginTTM'),
    netMargin: num(r, 'netProfitMarginTTM'),
    roe: num(m, 'returnOnEquityTTM', 'roeTTM') ?? num(r, 'returnOnEquityTTM'),
    debtToEquity: num(r, 'debtToEquityRatioTTM', 'debtEquityRatioTTM') ?? num(m, 'debtToEquityTTM'),
    currentRatio: num(r, 'currentRatioTTM') ?? num(m, 'currentRatioTTM'),
    dividendYield: num(r, 'dividendYieldTTM') ?? num(m, 'dividendYieldTTM'),
    fcfYield: num(m, 'freeCashFlowYieldTTM'),
  } : null

  const inc = (Array.isArray(raw.income?.data) ? raw.income!.data : []) as Obj[]
  const years: YearRow[] = inc
    .map(o => ({ year: String(o.fiscalYear ?? o.calendarYear ?? String(o.date ?? '').slice(0, 4)), revenue: num(o, 'revenue'), netIncome: num(o, 'netIncome'), eps: num(o, 'epsDiluted', 'epsdiluted', 'eps') }))
    .sort((a, b) => a.year.localeCompare(b.year))

  const pd = raw.peers?.data
  let peers: Peer[] = []
  if (Array.isArray(pd)) {
    // stable: [{symbol, companyName, price, mktCap}]; legacy: [{symbol, peersList: [...]}]
    const legacy = (pd[0] as Obj | undefined)?.peersList
    peers = Array.isArray(legacy)
      ? (legacy as string[]).map(s => ({ symbol: s, name: null, price: null, marketCap: null }))
      : (pd as Obj[]).map(o => ({ symbol: String(o.symbol ?? ''), name: str(o, 'companyName', 'name'), price: num(o, 'price'), marketCap: num(o, 'mktCap', 'marketCap') }))
    peers = peers.filter(x => x.symbol && x.symbol !== raw.symbol).slice(0, 10)
  }

  return { symbol: raw.symbol, fetchedAt: raw.fetchedAt, profile, bars, fundamentals, years, peers, errors }
}

// ---------------------------------------------------------------- local cache
// The free FMP plan allows 250 requests a day: one analysis costs 6, so results are kept in the browser.
const MD_PREFIX = 'tradepilot-md-'
const MD_TTL = 6 * 3600_000 // daily bars and fundamentals barely change within a session
const MD_KEEP = 20
const Q_KEY = 'tradepilot-quotes'
const Q_TTL = 10 * 60_000

function readCache<T>(key: string): { at: number; value: T } | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null }
}
function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })) } catch { pruneMarketCache(0); try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })) } catch { /* storage full */ } }
}
/** Keeps only the `keep` most recent analyses. */
function pruneMarketCache(keep = MD_KEEP) {
  try {
    const items: { k: string; at: number }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(MD_PREFIX)) items.push({ k, at: readCache(k)?.at ?? 0 })
    }
    items.sort((a, b) => b.at - a.at).slice(keep).forEach(x => localStorage.removeItem(x.k))
  } catch { /* storage blocked */ }
}

export interface CacheInfo { cached: boolean; stale: boolean; at: number }

/**
 * Market data for one symbol. Served from the browser cache for 6 hours unless `force`.
 * When FMP fails (e.g. the daily limit), an older cached copy is returned and marked stale.
 */
export async function fetchMarketData(symbol: string, force = false): Promise<MarketData & { cache: CacheInfo }> {
  const key = MD_PREFIX + symbol
  const hit = readCache<MarketRaw>(key)
  if (hit && !force && Date.now() - hit.at < MD_TTL) return { ...normalize(hit.value), cache: { cached: true, stale: false, at: hit.at } }
  if (isDemo || !supabase) throw new Error('Stock analysis needs the Supabase connection (it is not available in demo mode).')
  const { data, error } = await supabase.functions.invoke<MarketRaw & { error?: string }>('market-data', { body: { symbol } })
  if (error) {
    // Try to surface the function's own error message
    let msg = error.message
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error } catch { /* ignore */ }
    if (hit) return { ...normalize(hit.value), cache: { cached: true, stale: true, at: hit.at } }
    throw new Error(msg)
  }
  if (!data || data.error) {
    if (hit) return { ...normalize(hit.value), cache: { cached: true, stale: true, at: hit.at } }
    throw new Error(data?.error ?? 'Empty response')
  }
  const fresh = normalize(data)
  if (fresh.bars.length === 0 && hit) return { ...normalize(hit.value), cache: { cached: true, stale: true, at: hit.at } }
  if (fresh.bars.length > 0) { writeCache(key, data); pruneMarketCache() }
  return { ...fresh, cache: { cached: false, stale: false, at: Date.now() } }
}

export interface Quote { symbol: string; price: number | null; change: number | null; changePct: number | null; error?: string }

/** Latest price and daily % change for a list of symbols. */
export async function fetchQuotes(symbols: string[], force = false): Promise<Record<string, Quote>> {
  if (isDemo || !supabase || symbols.length === 0) return {}
  const cache = readCache<Record<string, Quote & { at: number }>>(Q_KEY)?.value ?? {}
  const now = Date.now()
  const need = force ? symbols : symbols.filter(s => !cache[s] || now - cache[s].at > Q_TTL || cache[s].price == null)
  if (need.length > 0) {
    const { data, error } = await supabase.functions.invoke<{ quotes?: Quote[]; error?: string }>('market-data', { body: { symbols: need } })
    if (error) throw new Error(error.message)
    if (!data?.quotes) throw new Error(data?.error ?? 'Empty response')
    const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
    for (const q of data.quotes) {
      const price = toNum(q.price)
      // Keep the last good price when FMP fails for a symbol (e.g. daily limit reached).
      if (price == null && cache[q.symbol]?.price != null) continue
      cache[q.symbol] = { ...q, price, change: toNum(q.change), changePct: toNum(q.changePct), at: now }
    }
    writeCache(Q_KEY, cache)
  }
  return Object.fromEntries(symbols.filter(s => cache[s]).map(s => [s, cache[s]]))
}

export interface AiAnalysis {
  verdict: 'enter' | 'wait' | 'avoid'
  confidence: 'low' | 'medium' | 'high'
  headline: string
  summary: string
  reasons_for: string[]
  reasons_against: string[]
  business: string
  news: string[]
  related: { symbol: string; relation: string }[]
  trade: { entry: number | null; stop: number | null; target: number | null; trigger: string; rationale: string }
  risks: string[]
  catalysts: string[]
}
export interface AiResult { symbol: string; model: string; generatedAt: string; analysis: AiAnalysis; sources: { title: string; url: string }[] }

/** Ask the AI analyst (Claude, via the market-data function) for a recommendation. Costs a few cents per call. */
export async function fetchAiAnalysis(symbol: string, context: unknown): Promise<AiResult> {
  if (isDemo || !supabase) throw new Error('Stock analysis needs the Supabase connection (it is not available in demo mode).')
  const { data, error } = await supabase.functions.invoke<AiResult & { error?: string }>('market-data', { body: { ai: { symbol, context } } })
  if (error) {
    let msg = error.message
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (!data || data.error || !data.analysis) throw new Error(data?.error ?? 'Empty response')
  return data
}

// ---- Hot stocks ----

export interface ScanRaw { fetchedAt: string; candidates: { symbol: string; name: string | null; source: string[]; bars?: RawBar[]; error?: string }[]; errors: Record<string, string>; requests: number }
export interface RankPick { symbol: string; rank: number; verdict: 'enter' | 'wait' | 'avoid'; why_moving: string; reason: string; risk: string }
export interface RankResult { model: string; generatedAt: string; ranking: { market_note: string; picks: RankPick[] }; sources: { title: string; url: string }[] }

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (isDemo || !supabase) throw new Error('Stock analysis needs the Supabase connection (it is not available in demo mode).')
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('market-data', { body })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (!data || (data as { error?: string }).error) throw new Error((data as { error?: string } | null)?.error ?? 'Empty response')
  return data
}

/** Tonight's candidates (FMP gainers + most active + extra symbols) with daily bars. ~2 + N FMP requests. */
export const fetchScan = (extra: string[]) => invoke<ScanRaw>({ scan: { extra } })
/** Claude ranks the candidates that passed the strategy rules. Costs a few cents. */
export const fetchRanking = (candidates: unknown, trader: unknown) => invoke<RankResult>({ rank: { candidates, trader } })

/**
 * Turns FMP failures into one plain explanation. Returns null when nothing failed.
 * FMP answers 429 "Limit Reach" when the daily quota is used up (free plan: 250 requests/day),
 * 401 for a bad key, and 402/403 for endpoints the plan doesn't include.
 */
export function explainDataErrors(errors: Record<string, string>): string | null {
  const msgs = Object.values(errors)
  if (msgs.length === 0) return null
  const all = msgs.join(' | ')
  if (/\b429\b|limit reach/i.test(all)) return 'FMP daily request limit reached (free plan: 250 requests a day). It resets at midnight New York time; until then market data is unavailable.'
  if (/\b401\b|invalid api key/i.test(all)) return 'FMP rejected the API key. Check the FMP_API_KEY secret in Supabase.'
  if (/\b40[23]\b|premium|exclusive|subscription/i.test(all)) return 'This data is not included in the FMP free plan.'
  return msgs[0]
}

