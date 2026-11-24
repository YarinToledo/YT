/**
 * Research decision framework: completeness checks, margin of safety, reward:risk, sizing and exposure.
 * Works only on what the user entered; it never invents a value. Labels are i18n keys.
 */
import type { CompanyData, Quote } from '../../../../../supabase/functions/_shared/sec'

export type { CompanyData, Fact, Quote } from '../../../../../supabase/functions/_shared/sec'

export type Mode = 'investment' | 'trade'

export interface Draft {
  mode: Mode
  ticker: string; company: string; horizon: string
  price: string; asOf: string
  bear: string; base: string; bull: string; valuationNotes: string
  stop: string; target: string
  thesis: string; counter: string; invalidation: string; sources: string
  shares: string
  portfolio: string; holding: string; budget: string
  companyData: CompanyData | null
  quote: Quote | null
  isDemo: boolean
}

export interface Policy {
  version: number
  status: 'draft' | 'active'
  goal: string; horizon: string
  maxStock: number | ''
  risk: number; rr: number; daily: number; weekly: number; open: number
  updatedAt?: string
}

export interface Check { label: string; ok: boolean }
export interface Assessment {
  checks: Check[]; complete: boolean
  margin: number | null; rr: number | null; units: number | null; plannedRisk: number | null; exposure: number | null
  /** Share count entered, its cost at the entered price, and the loss to the stop for that count (older records lack these). */
  shares?: number | null; cost?: number | null; sharesRisk?: number | null
  sources: string[]; scope: 'manual-framework-v1'
}

export const blankDraft = (): Draft => ({
  mode: 'investment', ticker: '', company: '', horizon: '', price: '', asOf: '', bear: '', base: '', bull: '', valuationNotes: '',
  stop: '', target: '', thesis: '', counter: '', invalidation: '', sources: '', shares: '', portfolio: '', holding: '', budget: '',
  companyData: null, quote: null, isDemo: false,
})

export const defaultPolicy = (): Policy => ({ version: 1, status: 'draft', goal: '', horizon: '', maxStock: '', risk: 1.5, rr: 3, daily: 3, weekly: 6, open: 2 })

export const positive = (v: unknown) => (v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null)
export const nonnegative = (v: unknown) => (v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null)
export function safeUrl(v: string): string | null {
  try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : null } catch { return null }
}

export function assess(d: Draft, policy: Policy, now = Date.now()): Assessment {
  const price = positive(d.price), bear = positive(d.bear), base = positive(d.base), bull = positive(d.bull)
  const stop = positive(d.stop), target = positive(d.target)
  const shares = positive(d.shares)
  const cost = shares != null && price != null ? shares * price : null
  // A share count sets the amount; otherwise the amount typed in the portfolio section is used.
  const portfolio = positive(d.portfolio), holding = nonnegative(d.holding), budget = cost ?? nonnegative(d.budget)
  const urls = String(d.sources || '').split(/\n/).map(x => x.trim()).filter(Boolean)
  const asOf = new Date(d.asOf).getTime()
  const checks: Check[] = [
    { label: 'Company and symbol are set', ok: !!d.company?.trim() && !!d.ticker?.trim() },
    { label: 'Decision horizon is set', ok: !!d.horizon?.trim() },
    { label: 'Positive price with a valid data date', ok: price != null && Number.isFinite(asOf) && asOf <= now + 300_000 },
    { label: 'Business thesis written', ok: !!d.thesis?.trim() },
    { label: 'Counter-argument written', ok: !!d.counter?.trim() },
    { label: 'Condition for re-checking is set', ok: !!d.invalidation?.trim() },
    { label: 'Valid source links attached', ok: urls.length > 0 && urls.every(u => safeUrl(u) != null) },
  ]
  let margin: number | null = null, rr: number | null = null, units: number | null = null, plannedRisk: number | null = null, sharesRisk: number | null = null
  if (d.mode === 'trade') {
    const validTrade = price != null && stop != null && target != null && stop < price && price < target
    checks.push({ label: 'Stop below entry and target above it', ok: validTrade })
    if (validTrade) rr = (target! - price!) / (price! - stop!)
    if (validTrade && shares != null) sharesRisk = shares * (price! - stop!)
    checks.push({ label: 'Trading policy is active', ok: policy.status === 'active' })
    if (policy.status === 'active' && rr != null) checks.push({ label: 'Reward:risk meets the policy', ok: rr >= policy.rr })
    if (validTrade && policy.status === 'active' && portfolio != null && budget != null && budget <= portfolio && positive(policy.risk)) {
      const riskLimit = (portfolio * policy.risk) / 100
      units = Math.floor(Math.min(riskLimit / (price! - stop!), shares != null ? Infinity : budget / price!))
      plannedRisk = units * (price! - stop!)
      if (shares != null) checks.push({ label: 'Share count is within the risk-based size cap', ok: shares <= units })
    }
  } else {
    const validRange = bear != null && base != null && bull != null && bear <= base && base <= bull
    checks.push({ label: 'Value range is positive and ordered', ok: validRange })
    checks.push({ label: 'Valuation method and assumptions explained', ok: !!d.valuationNotes?.trim() })
    if (validRange && price != null) margin = ((bear! - price) / bear!) * 100
  }
  let exposure: number | null = null
  const anyPortfolio = [d.portfolio, d.holding, shares != null ? '' : d.budget].some(v => v !== '' && v != null)
  const validPortfolio = portfolio != null && holding != null && budget != null && holding + budget <= portfolio
  if (anyPortfolio) checks.push({ label: 'Portfolio and budget figures are complete and consistent', ok: validPortfolio })
  if (validPortfolio) {
    exposure = ((holding! + budget!) / portfolio!) * 100
    if (policy.status === 'active' && positive(policy.maxStock)) checks.push({ label: 'Direct exposure after the action is within the policy', ok: exposure <= Number(policy.maxStock) })
  }
  return { checks, complete: checks.every(x => x.ok), margin, rr, units, plannedRisk, exposure, shares, cost, sharesRisk, sources: urls.map(safeUrl).filter((x): x is string => !!x), scope: 'manual-framework-v1' }
}

/**
 * Applies a loaded company to the draft. When switching to a different company the analysis starts fresh
 * (keeping mode, horizon, portfolio and budget); the caller must confirm that with the user first.
 */
export function applyCompany(draft: Draft, payload: { company: CompanyData; quote: Quote }, replacing: boolean): Draft {
  const d: Draft = replacing
    ? { ...blankDraft(), mode: draft.mode, horizon: draft.horizon, portfolio: draft.portfolio, budget: draft.budget }
    : { ...draft }
  d.ticker = payload.company.ticker
  d.company = payload.company.name
  d.companyData = payload.company
  d.quote = payload.quote
  d.isDemo = false
  const links = new Set(String(d.sources || '').split('\n').filter(Boolean))
  links.add(payload.company.source)
  links.add(payload.company.factsSource)
  d.sources = [...links].join('\n')
  if (payload.quote?.available && payload.quote.price != null && payload.quote.asOf) {
    d.price = String(payload.quote.price)
    d.asOf = toLocalInput(payload.quote.asOf)
  }
  return d
}

/** ISO timestamp → value for a datetime-local input, in the viewer's time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** True when picking `ticker` would replace research on a different company. */
export const wouldReplace = (draft: Draft, ticker: string) => !!draft.ticker && draft.ticker.toUpperCase() !== ticker.toUpperCase()

export const DECISIONS = ['watch', 'consider', 'hold', 'reduce', 'pass', 'more'] as const
export type DecisionKind = (typeof DECISIONS)[number]
export const DECISION_LABEL: Record<DecisionKind, string> = {
  watch: 'Watch and wait', consider: 'Consider buying', hold: 'Hold', reduce: 'Consider reducing', pass: 'Pass', more: 'Gather more information',
}

export function validPolicy(p: unknown): p is Policy {
  const x = p as Policy
  return !!x && ['draft', 'active'].includes(x.status) && Number.isInteger(x.version) && x.version >= 1
    && (['risk', 'daily', 'weekly'] as const).every(k => Number.isFinite(Number(x[k])) && Number(x[k]) > 0 && Number(x[k]) <= 100)
    && Number(x.rr) > 0 && Number.isInteger(Number(x.open)) && Number(x.open) > 0 && Number(x.open) <= 100
    && (x.maxStock === '' || x.maxStock == null || (Number(x.maxStock) > 0 && Number(x.maxStock) <= 100))
}

/** Older drafts and backups may lack `shares`; callers fill it with withDefaults(). */
export const withDefaults = (d: Draft): Draft => ({ ...blankDraft(), ...d })

export function validDraft(d: unknown): d is Draft {
  const x = d as Record<string, unknown>
  return !!x && ['investment', 'trade'].includes(x.mode as string) && Object.keys(blankDraft()).every(k =>
    (k === 'shares' && x[k] == null) ? true
    : k === 'isDemo' ? typeof x[k] === 'boolean'
      : k === 'companyData' || k === 'quote' ? x[k] == null || (typeof x[k] === 'object' && !Array.isArray(x[k]))
        : typeof x[k] === 'string' && (x[k] as string).length <= 16000)
}
