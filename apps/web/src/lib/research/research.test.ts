import { describe, expect, it } from 'vitest'
import { normalizeCompany, normalizeFmpQuote, pickFact, searchCompanies } from '../../../../../supabase/functions/_shared/sec'
import { applyCompany, assess, blankDraft, defaultPolicy, safeUrl, toLocalInput, validDraft, withDefaults, wouldReplace, type Draft, type Policy } from './engine'
import { memoryApi, parseBackup } from './api'

// ---------------------------------------------------------------- SEC data (ported from the module's tests)

describe('SEC facts', () => {
  it('annual facts exclude nine-month totals and prefer the latest restatement', () => {
    const f = { 'us-gaap': { Revenues: { units: { USD: [
      { start: '2025-01-01', end: '2025-12-31', filed: '2026-02-01', form: '10-K', val: 100 },
      { start: '2026-01-01', end: '2026-09-30', filed: '2026-11-01', form: '10-Q', val: 95 },
      { start: '2025-01-01', end: '2025-12-31', filed: '2026-03-01', form: '10-K/A', val: 98 },
    ] } } } }
    expect(pickFact(f, ['Revenues'], 'annual')?.value).toBe(98)
    expect(pickFact(f, ['Revenues'], 'annual')?.periodEnd).toBe('2025-12-31')
  })

  it('instant facts keep a reported zero and ignore durations; missing stays null', () => {
    const f = { 'us-gaap': { Cash: { units: { USD: [
      { end: '2026-09-30', filed: '2026-11-01', form: '10-Q', val: 0 },
      { start: '2026-01-01', end: '2026-10-01', filed: '2026-11-02', form: '10-Q', val: 100 },
    ] } } } }
    expect(pickFact(f, ['Cash'])?.value).toBe(0)
    expect(pickFact(f, ['Missing'])).toBeNull()
  })

  it('search puts the exact ticker first and understands Hebrew names', () => {
    const list = [{ ticker: 'NVDAX', name: 'Other' }, { ticker: 'NVDA', name: 'NVIDIA Corporation' }, { ticker: 'MSFT', name: 'Microsoft Corporation' }]
    expect(searchCompanies(list, 'נבידיה')[0].ticker).toBe('NVDA')
    expect(searchCompanies(list, 'micro')[0].ticker).toBe('MSFT')
    expect(searchCompanies(list, '   ')).toEqual([])
  })

  it('company identity must match; missing facts stay absent with a warning', () => {
    const data = normalizeCompany({ cik: '1045810', name: 'NVIDIA', exchanges: ['Nasdaq'] }, null, { cik: '0001045810', ticker: 'NVDA', name: 'NVIDIA' })
    expect(data.metrics.revenue).toBeNull()
    expect(data.warnings).toHaveLength(1)
    expect(() => normalizeCompany({ cik: '123' }, null, { cik: '0001045810', ticker: 'NVDA' })).toThrow()
  })

  it('quotes keep the provider timestamp, are never called real-time, and bad data is missing, not a price', () => {
    const now = Date.parse('2026-11-24T18:00:00Z')
    const live = normalizeFmpQuote('NVDA', { symbol: 'NVDA', price: 181.2, timestamp: now / 1000 - 600 }, now)
    expect(live).toMatchObject({ available: true, price: 181.2, kind: 'delayed', asOf: '2026-11-24T17:50:00.000Z' })
    expect(normalizeFmpQuote('NVDA', { symbol: 'NVDA', price: 181.2, timestamp: now / 1000 - 3 * 86400 }, now).kind).toBe('end_of_day')
    const bad = normalizeFmpQuote('NVDA', { symbol: 'AMD', price: 100, timestamp: now / 1000 }, now)
    expect(bad.available).toBe(false)
    expect(bad.price).toBeUndefined()
  })
})

// ---------------------------------------------------------------- decision framework (ported)

const policy: Policy = { ...defaultPolicy(), status: 'active', risk: 1.5, rr: 3, maxStock: 25 }
const input: Draft = {
  ...blankDraft(), mode: 'investment', company: 'Test', ticker: 'TEST', horizon: '5y', price: '60', asOf: '2026-11-24T10:00',
  bear: '80', base: '100', bull: '120', valuationNotes: 'Explicit assumption', thesis: 'Business', counter: 'Risk', invalidation: 'Event',
  sources: 'https://example.com/report', portfolio: '1000', holding: '0', budget: '100',
}
const now = new Date('2026-11-24T12:00').getTime()

describe('assess', () => {
  it('conservative margin, exposure and real completeness', () => {
    const a = assess(input, policy, now)
    expect(a.margin).toBe(25)
    expect(a.exposure).toBe(10)
    expect(a.complete).toBe(true)
  })
  it('negative margin and invalid valuation ordering', () => {
    expect(assess({ ...input, price: '90' }, policy, now).margin).toBe(-12.5)
    expect(assess({ ...input, bear: '110' }, policy, now).margin).toBeNull()
  })
  it('trade size is capped by both planned loss and purchase budget', () => {
    const a = assess({ ...input, mode: 'trade', price: '100', stop: '95', target: '115', budget: '1000' }, policy, now)
    expect(a.rr).toBe(3); expect(a.units).toBe(3); expect(a.plannedRisk).toBe(15)
    expect(assess({ ...input, mode: 'trade', price: '100', stop: '95', target: '115', budget: '200' }, policy, now).units).toBe(2)
  })
  it('draft policy, invalid stops and future timestamps cannot pass', () => {
    expect(assess({ ...input, mode: 'trade', stop: '55', target: '75' }, { ...policy, status: 'draft' }, now).units).toBeNull()
    expect(assess({ ...input, mode: 'trade', stop: '70', target: '75' }, policy, now).rr).toBeNull()
    expect(assess({ ...input, asOf: '2027-01-01' }, policy, now).complete).toBe(false)
  })
  it('share count sets the cost, the exposure and the loss to the stop', () => {
    const inv = assess({ ...input, shares: '1', budget: '' }, policy, now)
    expect(inv.cost).toBe(60); expect(inv.exposure).toBe(6)
    const trade = { ...input, mode: 'trade' as const, price: '100', stop: '95', target: '115' }
    const ok = assess({ ...trade, shares: '3' }, policy, now)
    expect(ok.sharesRisk).toBe(15); expect(ok.units).toBe(3)
    expect(ok.checks.find(c => c.label.startsWith('Share count'))?.ok).toBe(true)
    const big = assess({ ...trade, shares: '5', portfolio: '10000' }, policy, now)
    expect(big.units).toBe(30); expect(big.checks.find(c => c.label.startsWith('Share count'))?.ok).toBe(true)
    const over = assess({ ...trade, shares: '9' }, policy, now)
    expect(over.complete).toBe(false)
    expect(over.checks.find(c => c.label.startsWith('Share count'))?.ok).toBe(false)
  })
  it('older drafts without a share count still load', () => {
    const { shares: _drop, ...old } = blankDraft()
    expect(validDraft(old)).toBe(true)
    expect(withDefaults(old as Draft).shares).toBe('')
  })
  it('missing, zero and unsafe inputs cannot produce valid outputs', () => {
    expect(assess({ ...input, price: '0' }, policy, now).margin).toBeNull()
    expect(assess({ ...input, sources: 'javascript:alert(1)' }, policy, now).complete).toBe(false)
    expect(assess({ ...input, holding: '' }, policy, now).exposure).toBeNull()
    expect(assess({ ...input, budget: '2000' }, policy, now).exposure).toBeNull()
    expect(safeUrl('javascript:alert(1)')).toBeNull()
  })
})

// ---------------------------------------------------------------- integration: search → select → load → save

function fakeStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

/** Builds SEC-shaped payloads the way the Edge Function returns them. */
function secCompany(withFacts: boolean) {
  const facts = withFacts ? { cik: 1045810, facts: { 'us-gaap': {
    Revenues: { units: { USD: [{ start: '2025-01-27', end: '2026-01-25', filed: '2026-02-26', form: '10-K', val: 130_497_000_000, accn: '0001045810-26-000010' }] } },
    Liabilities: { units: { USD: [{ end: '2026-10-26', filed: '2026-11-19', form: '10-Q', val: 32_000_000_000 }] } },
  } } } : null
  return normalizeCompany({ cik: 1045810, name: 'NVIDIA CORP', exchanges: ['Nasdaq'], sicDescription: 'Semiconductors', filings: { recent: { accessionNumber: ['0001045810-26-000010'], primaryDocument: ['nvda-20260125.htm'] } } }, facts, { cik: '0001045810', ticker: 'NVDA', name: 'NVIDIA CORP', exchange: 'Nasdaq' })
}

describe('research flow', () => {
  it('search, select, load data, keep missing data missing, survive a provider error, save a decision', async () => {
    // 1. Search: ambiguous input returns several candidates; nothing is auto-selected.
    const hits = searchCompanies([{ ticker: 'NVDA', name: 'NVIDIA CORP' }, { ticker: 'NVDL', name: 'GraniteShares 2x Long NVDA Daily ETF' }], 'NVD')
    expect(hits.map(h => h.ticker)).toEqual(['NVDA', 'NVDL'])

    // 2. Select + load: company fills the draft; the price comes with its own date, and sources are attached.
    const company = secCompany(true)
    const quote = normalizeFmpQuote('NVDA', { symbol: 'NVDA', price: 180, timestamp: Date.parse('2026-11-21T21:00:00Z') / 1000 }, Date.parse('2026-11-24T08:00:00Z'))
    let draft = applyCompany(blankDraft(), { company, quote }, false)
    expect(draft).toMatchObject({ ticker: 'NVDA', company: 'NVIDIA CORP', price: '180', asOf: toLocalInput('2026-11-21T21:00:00Z') })
    expect(quote.kind).toBe('end_of_day')
    expect(draft.sources.split('\n')).toEqual([company.source, company.factsSource])
    expect(company.metrics.revenue?.source).toContain('/Archives/edgar/data/1045810/000104581026000010/nvda-20260125.htm')

    // 3. Missing data stays missing: no net income reported → null, not zero; liabilities are not debt.
    expect(company.metrics.netIncome).toBeNull()
    expect(company.metrics.liabilities?.value).toBe(32_000_000_000)

    // 4. Provider error: facts unavailable and no price → warning, price left for manual entry.
    const partial = applyCompany(blankDraft(), { company: secCompany(false), quote: { available: false, reason: 'quota_exceeded', message: 'limit' } }, false)
    expect(partial.price).toBe('')
    expect(partial.companyData?.warnings.length).toBe(1)

    // Switching company is flagged so the UI asks first; switching keeps only neutral fields.
    draft = { ...draft, horizon: '3y', thesis: 'AI demand' }
    expect(wouldReplace(draft, 'MSFT')).toBe(true)
    expect(wouldReplace(draft, 'nvda')).toBe(false)
    const replaced = applyCompany(draft, { company: { ...company, ticker: 'MSFT', name: 'MICROSOFT' }, quote }, true)
    expect(replaced.thesis).toBe('')
    expect(replaced.horizon).toBe('3y')

    // 5. Save a decision with a frozen snapshot; a later review is appended, not rewritten.
    const api = memoryApi(fakeStorage())
    const filled = { ...draft, thesis: 'AI demand', counter: 'Cyclical capex', invalidation: 'Data-center revenue falls 2 quarters', bear: '150', base: '200', bull: '260', valuationNotes: 'EV/FCF' }
    const assessment = assess(filled, policy, Date.parse('2026-11-24T08:00:00Z'))
    const saved = await api.addDecision({ decision: 'watch', reason: 'Wait for a better price', reviewDate: '2027-01-15', data: filled, assessment, policy, rules: {} })
    filled.thesis = 'changed later'
    await api.addReview(saved.id, 'Price fell; thesis intact')
    const state = await api.load()
    expect(state.decisions).toHaveLength(1)
    expect(state.decisions[0].data.thesis).toBe('AI demand')
    expect(state.decisions[0].policy.version).toBe(policy.version)
    expect(state.decisions[0].reviews.map(r => r.note)).toEqual(['Price fell; thesis intact'])
    expect(state.decisions[0].reason).toBe('Wait for a better price')
  })

  it('imports a standalone-module backup and rejects anything else', () => {
    const rec = { id: 'a1', createdAt: '2026-11-20T10:00:00Z', decision: 'watch', reason: 'r', reviewDate: '', data: input, assessment: assess(input, policy, now), policy, rules: {}, reviews: [{ createdAt: '2026-11-21T10:00:00Z', note: 'n' }] }
    const ok = parseBackup(JSON.stringify({ format: 'tradepilot-research', version: 1, state: { draft: input, policy, rules: { margin: 'active' }, journal: [rec] } }))
    expect(ok.decisions).toHaveLength(1)
    expect(ok.decisions[0].imported).toBe(true)
    expect(ok.decisions[0].reviews[0].note).toBe('n')
    expect(() => parseBackup('{"format":"other"}')).toThrow()
    expect(() => parseBackup('not json')).toThrow()
    expect(() => parseBackup(JSON.stringify({ format: 'tradepilot-research', version: 1, state: { draft: input, policy, journal: [{ ...rec, decision: 'yolo' }] } }))).toThrow()
  })
})
