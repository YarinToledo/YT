// Pure SEC EDGAR helpers shared by the `research` Edge Function and the web app's tests.
// No network, no Deno/Node APIs: input JSON in, normalized data out.

export interface CatalogEntry { cik: string; name: string; ticker: string; exchange: string }

export interface Fact {
  value: number
  currency: 'USD'
  periodStart: string | null
  periodEnd: string
  filed: string
  form: string
  accession: string | null
  tag: string
  kind: 'annual' | 'instant'
  source?: string
}

export interface CompanyData {
  cik: string
  ticker: string
  name: string
  exchange: string
  industry: string
  fiscalYearEnd: string
  metrics: Record<'revenue' | 'netIncome' | 'operatingCash' | 'cash' | 'assets' | 'liabilities', Fact | null>
  source: string
  factsSource: string
  retrievedAt: string
  provider: 'SEC EDGAR'
  warnings: string[]
}

export class DataError extends Error {
  constructor(message: string, public code = 'upstream_unavailable', public status = 502) { super(message) }
}

// deno-lint-ignore no-explicit-any
type Json = any

export function normalizeCatalog(json: Json): CatalogEntry[] {
  if (!Array.isArray(json?.fields) || !Array.isArray(json?.data)) throw new DataError('The SEC company list has an unexpected format.')
  const pos: Record<string, number> = Object.fromEntries(json.fields.map((x: string, i: number) => [x, i]))
  return json.data
    .map((r: unknown[]) => ({
      cik: String(r[pos.cik]).padStart(10, '0'),
      name: String(r[pos.name] ?? ''),
      ticker: String(r[pos.ticker] ?? ''),
      exchange: String(r[pos.exchange] ?? ''),
    }))
    .filter((r: CatalogEntry) => /^\d{10}$/.test(r.cik) && r.ticker)
}

/** Common Hebrew company names → ticker, so "נבידיה" finds NVDA. */
export const HEBREW_ALIASES: Record<string, string> = {
  'אנבידיה': 'NVDA', 'נבידיה': 'NVDA', 'אינבידיה': 'NVDA', 'מיקרוסופט': 'MSFT', 'פלנטיר': 'PLTR', 'פלאנטיר': 'PLTR',
  'אפל': 'AAPL', 'טסלה': 'TSLA', 'אמזון': 'AMZN', 'גוגל': 'GOOGL', 'אלפבית': 'GOOGL', 'מטא': 'META', 'פייסבוק': 'META',
  'נטפליקס': 'NFLX', 'אינטל': 'INTC', 'ברודקום': 'AVGO', 'טאיוואן סמיקונדקטור': 'TSM', 'קוקה קולה': 'KO',
}

/** Up to 8 matches: exact ticker, ticker prefix, name prefix, then name contains. */
export function searchCompanies(list: Pick<CatalogEntry, 'ticker' | 'name'>[], input: string) {
  const raw = input.trim()
  const q = (HEBREW_ALIASES[raw] ?? raw).toUpperCase()
  if (q.length < 1) return []
  return list
    .map(x => {
      const t = x.ticker.toUpperCase(), n = x.name.toUpperCase()
      return { x, score: t === q ? 0 : t.startsWith(q) ? 1 : n.startsWith(q) ? 2 : n.includes(q) ? 3 : 99 }
    })
    .filter(x => x.score < 99)
    .sort((a, b) => a.score - b.score || a.x.ticker.localeCompare(b.x.ticker))
    .slice(0, 8)
    .map(x => x.x)
}

const FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A', '40-F', '40-F/A'])
const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Latest USD fact for the first matching tags.
 * annual: only full-year periods (330–400 days), never a nine-month total.
 * instant: balance-sheet values only (no period start). A reported 0 is kept; nothing found returns null.
 */
export function pickFact(facts: Json, tags: string[], kind: 'annual' | 'instant' = 'instant'): Fact | null {
  const entries: Json[] = []
  tags.forEach((tag, priority) => {
    for (const f of facts?.['us-gaap']?.[tag]?.units?.USD ?? []) {
      if (!FORMS.has(f.form) || !Number.isFinite(f.val) || !DAY.test(f.end ?? '') || !DAY.test(f.filed ?? '')) continue
      const duration = f.start ? (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000 : null
      if (kind === 'annual' && !(duration != null && duration >= 330 && duration <= 400)) continue
      if (kind === 'instant' && f.start) continue
      entries.push({ ...f, tag, priority })
    }
  })
  entries.sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed) || a.priority - b.priority)
  const f = entries[0]
  return f ? { value: f.val, currency: 'USD', periodStart: f.start ?? null, periodEnd: f.end, filed: f.filed, form: f.form, accession: f.accn ?? null, tag: f.tag, kind } : null
}

export function normalizeCompany(entity: Json, facts: Json | null, chosen: { cik: string; ticker: string; name?: string; exchange?: string }): CompanyData {
  const cik = String(chosen.cik).padStart(10, '0')
  if (String(entity?.cik).padStart(10, '0') !== cik || (facts && String(facts.cik).padStart(10, '0') !== cik)) {
    throw new DataError('The company id does not match the data source.', 'identity_mismatch')
  }
  const source = `https://data.sec.gov/submissions/CIK${cik}.json`
  const factsSource = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`
  const f = facts?.facts
  const metrics: CompanyData['metrics'] = {
    revenue: pickFact(f, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet'], 'annual'),
    netIncome: pickFact(f, ['NetIncomeLoss', 'ProfitLoss'], 'annual'),
    operatingCash: pickFact(f, ['NetCashProvidedByUsedInOperatingActivities'], 'annual'),
    cash: pickFact(f, ['CashAndCashEquivalentsAtCarryingValue']),
    assets: pickFact(f, ['Assets']),
    // Total liabilities: NOT financial debt.
    liabilities: pickFact(f, ['Liabilities']),
  }
  const recent = entity.filings?.recent
  for (const m of Object.values(metrics)) {
    if (!m) continue
    m.source = factsSource
    const i = m.accession ? recent?.accessionNumber?.indexOf(m.accession) ?? -1 : -1
    const doc = i >= 0 ? recent?.primaryDocument?.[i] : null
    if (doc && /^[a-zA-Z0-9_.-]+$/.test(doc) && /^\d{10}-\d{2}-\d{6}$/.test(m.accession ?? '')) {
      m.source = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${m.accession!.split('-').join('')}/${doc}`
    }
  }
  return {
    cik, ticker: chosen.ticker, name: entity.name || chosen.name || chosen.ticker,
    exchange: chosen.exchange || entity.exchanges?.[0] || '', industry: entity.sicDescription || '', fiscalYearEnd: entity.fiscalYearEnd || '',
    metrics, source, factsSource, retrievedAt: new Date().toISOString(), provider: 'SEC EDGAR',
    warnings: facts ? [] : ['Company details loaded, but reported financial data is not available right now.'],
  }
}

export interface Quote {
  available: boolean
  reason?: string
  message?: string
  symbol?: string
  price?: number
  /** The provider's own timestamp for the price (ISO). */
  asOf?: string
  currency?: 'USD'
  /** 'delayed' intraday quote or 'end_of_day' close. Never claimed as real-time. */
  kind?: 'delayed' | 'end_of_day'
  provider?: string
  retrievedAt?: string
}

/** FMP /stable/quote row → Quote. Uses the provider's timestamp; rejects anything that isn't a clean positive price. */
export function normalizeFmpQuote(symbol: string, row: Json, now = Date.now()): Quote {
  const price = Number(row?.price)
  const ts = Number(row?.timestamp)
  if (row?.symbol !== symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(ts) || ts <= 0) {
    return { available: false, reason: 'quote_unavailable', message: 'No valid price was returned. The price source may be over its daily limit.' }
  }
  const at = new Date(ts * 1000)
  // A timestamp older than ~20 hours means the market is closed: it's the last close, not a live price.
  const kind: Quote['kind'] = now - at.getTime() > 20 * 3600_000 ? 'end_of_day' : 'delayed'
  return { available: true, symbol, price, asOf: at.toISOString(), currency: 'USD', kind, provider: 'Financial Modeling Prep', retrievedAt: new Date(now).toISOString() }
}
