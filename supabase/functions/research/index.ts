// Supabase Edge Function: research
// Company search and reported financials from SEC EDGAR, plus an optional price from FMP.
// Only fixed, server-owned endpoints are called; the client sends a search string or a (cik, ticker) pair, never a URL.
// Secrets: FMP_API_KEY (optional; without it the price stays manual), SEC_USER_AGENT (optional; SEC asks for an identifying agent).
// Only signed-in users of this project can call it.

import { DataError, normalizeCatalog, normalizeCompany, normalizeFmpQuote, searchCompanies, type CatalogEntry, type Quote } from '../_shared/sec.ts'

const SEC_TICKERS = 'https://www.sec.gov/files/company_tickers_exchange.json'
const SEC_AGENT = Deno.env.get('SEC_USER_AGENT') || 'TradePilot/1.0 (personal financial research; https://yt-esuv.vercel.app)'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })

async function signedInUser(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!auth || !url || !anon) return false
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } })
  return r.ok
}

// ---------------------------------------------------------------- in-memory cache (per function instance)
const memory = new Map<string, { value: unknown; expires: number }>()
const pending = new Map<string, Promise<unknown>>()
async function cached<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  const old = memory.get(key)
  if (old && old.expires > Date.now()) return old.value as T
  if (pending.has(key)) return pending.get(key) as Promise<T>
  const task = loader()
    .then(value => {
      memory.set(key, { value, expires: Date.now() + ttl })
      if (memory.size > 80) memory.delete(memory.keys().next().value!)
      return value
    })
    .finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

async function secJson(url: string) {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': SEC_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(18_000) })
  } catch {
    throw new DataError('The SEC filings source cannot be reached right now. Try again later.')
  }
  if (!res.ok) throw new DataError(`The SEC filings source is unavailable right now (${res.status}). Earlier data was not replaced.`, 'sec_unavailable', res.status === 429 ? 429 : 502)
  try { return await res.json() } catch { throw new DataError('The SEC filings source returned unreadable data.') }
}

const catalog = () => cached<CatalogEntry[]>('catalog', 86_400_000, async () => normalizeCatalog(await secJson(SEC_TICKERS)))

async function company(cik: string, ticker: string) {
  const list = await catalog()
  const chosen = list.find(x => x.cik === cik && x.ticker === ticker)
  if (!chosen) throw new DataError('The selected company is not in the official list. Search and select it again.', 'not_found', 404)
  return cached(`company:${cik}:${ticker}`, 900_000, async () => {
    const entity = await secJson(`https://data.sec.gov/submissions/CIK${cik}.json`)
    let facts = null
    try { facts = await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`) } catch { /* company shown without financials, with a warning */ }
    return normalizeCompany(entity, facts, chosen)
  })
}

async function quote(symbol: string): Promise<Quote> {
  const key = Deno.env.get('FMP_API_KEY')
  if (!key) return { available: false, reason: 'price_source_required', message: 'Automatic price needs a price source. Enter the price and its date manually.' }
  return cached(`quote:${symbol}`, 600_000, async () => {
    let res: Response
    try {
      res = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`, { signal: AbortSignal.timeout(12_000) })
    } catch {
      return { available: false, reason: 'quote_unavailable', message: 'The price source is unavailable right now.' }
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const limit = res.status === 429 || /limit/i.test(JSON.stringify(data ?? ''))
      return { available: false, reason: limit ? 'quota_exceeded' : 'quote_unavailable', message: limit ? 'The price source daily limit was reached. Enter the price manually.' : 'The price source is unavailable right now.' }
    }
    return normalizeFmpQuote(symbol, Array.isArray(data) ? data[0] : null)
  })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Method not supported.' }, 405)
  if (!(await signedInUser(req))) return json({ error: 'Sign in required' }, 401)
  try {
    const body = await req.json().catch(() => null)
    if (typeof body?.search === 'string') {
      const q = body.search.trim()
      if (q.length < 1 || q.length > 100) return json({ results: [] })
      return json({ results: searchCompanies(await catalog(), q), provider: 'SEC EDGAR', source: SEC_TICKERS })
    }
    if (body?.company) {
      const cik = String(body.company.cik ?? '')
      const ticker = String(body.company.ticker ?? '').toUpperCase()
      if (!/^\d{10}$/.test(cik) || !/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return json({ error: 'invalid_input', message: 'The company selection is not valid.' }, 400)
      const data = await company(cik, ticker)
      let price: Quote
      try { price = await quote(ticker) } catch (e) { price = { available: false, reason: 'quote_unavailable', message: String((e as Error).message) } }
      return json({ company: data, quote: price })
    }
    return json({ error: 'invalid_input', message: 'Send { search } or { company: { cik, ticker } }.' }, 400)
  } catch (e) {
    const err = e instanceof DataError ? e : new DataError('The data did not load. Try again later.', 'data_error')
    return json({ error: err.code, message: err.message }, err.status)
  }
})
