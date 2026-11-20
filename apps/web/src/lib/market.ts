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

export async function fetchMarketData(symbol: string): Promise<MarketData> {
  if (isDemo || !supabase) throw new Error('Stock analysis needs the Supabase connection (it is not available in demo mode).')
  const { data, error } = await supabase.functions.invoke<MarketRaw & { error?: string }>('market-data', { body: { symbol } })
  if (error) {
    // Try to surface the function's own error message
    let msg = error.message
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (!data || data.error) throw new Error(data?.error ?? 'Empty response')
  return normalize(data)
}

export interface Quote { symbol: string; price: number | null; change: number | null; changePct: number | null; error?: string }

/** Latest price and daily % change for a list of symbols. */
export async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (isDemo || !supabase || symbols.length === 0) return {}
  const { data, error } = await supabase.functions.invoke<{ quotes?: Quote[]; error?: string }>('market-data', { body: { symbols } })
  if (error) throw new Error(error.message)
  if (!data?.quotes) throw new Error(data?.error ?? 'Empty response')
  const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
  return Object.fromEntries(data.quotes.map(q => [q.symbol, { ...q, price: toNum(q.price), change: toNum(q.change), changePct: toNum(q.changePct) }]))
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
