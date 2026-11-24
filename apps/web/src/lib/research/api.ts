/**
 * Research data: company lookup (Edge Function `research`) and per-user persistence
 * (Supabase tables with row-level security; localStorage in demo mode).
 */
import { isDemo, supabase } from '../data'
import {
  blankDraft, defaultPolicy, validDraft, validPolicy, withDefaults, DECISIONS,
  type Assessment, type CompanyData, type DecisionKind, type Draft, type Policy, type Quote,
} from './engine'

export interface CompanyHit { cik: string; ticker: string; name: string; exchange: string }
export interface Review { id: string; createdAt: string; note: string }
export interface Decision {
  id: string
  createdAt: string
  decision: DecisionKind
  reason: string
  reviewDate: string | null
  data: Draft
  assessment: Assessment
  policy: Policy
  rules: Record<string, string>
  imported: boolean
  reviews: Review[]
}
export interface ResearchState { draft: Draft; rules: Record<string, string>; policy: Policy; decisions: Decision[] }
export type NewDecision = Omit<Decision, 'id' | 'createdAt' | 'reviews' | 'imported'>

export interface ResearchApi {
  load(): Promise<ResearchState>
  saveDraft(draft: Draft, rules: Record<string, string>): Promise<void>
  /** Saves a new policy version (versions are never edited). */
  addPolicy(p: Policy): Promise<Policy>
  addDecision(d: NewDecision): Promise<Decision>
  addReview(decisionId: string, note: string): Promise<Review>
  importDecisions(list: Decision[]): Promise<number>
}

// ---------------------------------------------------------------- company lookup

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (isDemo || !supabase) throw new Error('Company lookup needs the Supabase connection (it is not available in demo mode).')
  const { data, error } = await supabase.functions.invoke<T & { error?: string; message?: string }>('research', { body })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.message || b?.error) msg = b.message ?? b.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (!data) throw new Error('Empty response')
  if (data.error) throw new Error(data.message ?? data.error)
  return data
}

export const searchCompany = (q: string) => invoke<{ results: CompanyHit[] }>({ search: q.slice(0, 100) }).then(r => r.results)
export const loadCompany = (hit: Pick<CompanyHit, 'cik' | 'ticker'>) =>
  invoke<{ company: CompanyData; quote: Quote }>({ company: { cik: hit.cik, ticker: hit.ticker } })

// ---------------------------------------------------------------- persistence

const toDecision = (r: Record<string, any>, reviews: Review[] = []): Decision => ({
  id: r.id, createdAt: r.created_at, decision: r.decision, reason: r.reason, reviewDate: r.review_date ?? null,
  data: r.data, assessment: r.assessment, policy: r.policy, rules: r.rules ?? {}, imported: !!r.imported, reviews,
})

function supabaseApi(): ResearchApi {
  const sb = supabase!
  const ok = <T,>(res: { data: T | null; error: { message: string } | null }) => { if (res.error) throw new Error(res.error.message); return res.data as T }
  return {
    async load() {
      const [draftRow, policyRow, decisions, reviews] = await Promise.all([
        sb.from('research_drafts').select('draft,rules').maybeSingle().then(ok),
        sb.from('research_policies').select('data,version,status').order('version', { ascending: false }).limit(1).maybeSingle().then(ok),
        sb.from('research_decisions').select('*').order('created_at', { ascending: false }).limit(2000).then(ok),
        sb.from('research_reviews').select('id,decision_id,created_at,note').order('created_at').then(ok),
      ])
      const byDecision = new Map<string, Review[]>()
      for (const r of (reviews ?? []) as any[]) byDecision.set(r.decision_id, [...(byDecision.get(r.decision_id) ?? []), { id: r.id, createdAt: r.created_at, note: r.note }])
      const draft = (draftRow as any)?.draft
      const policy = policyRow ? { ...(policyRow as any).data, version: (policyRow as any).version, status: (policyRow as any).status } : null
      return {
        draft: validDraft(draft) ? withDefaults(draft) : blankDraft(),
        rules: (draftRow as any)?.rules ?? {},
        policy: validPolicy(policy) ? policy : defaultPolicy(),
        decisions: ((decisions ?? []) as any[]).map(r => toDecision(r, byDecision.get(r.id))),
      }
    },
    async saveDraft(draft, rules) {
      ok(await sb.from('research_drafts').upsert({ draft, rules, updated_at: new Date().toISOString() }))
    },
    async addPolicy(p) {
      const row = ok(await sb.from('research_policies').insert({ version: p.version, status: p.status, data: p }).select('data,version,status').single()) as any
      return { ...row.data, version: row.version, status: row.status }
    },
    async addDecision(d) {
      const row = ok(await sb.from('research_decisions').insert({
        decision: d.decision, reason: d.reason, review_date: d.reviewDate || null, data: d.data, assessment: d.assessment, policy: d.policy, rules: d.rules,
      }).select('*').single())
      return toDecision(row as any)
    },
    async addReview(decisionId, note) {
      const r = ok(await sb.from('research_reviews').insert({ decision_id: decisionId, note }).select('id,created_at,note').single()) as any
      return { id: r.id, createdAt: r.created_at, note: r.note }
    },
    async importDecisions(list) {
      let n = 0
      for (const d of list) {
        const row = ok(await sb.from('research_decisions').insert({
          created_at: d.createdAt, decision: d.decision, reason: d.reason, review_date: d.reviewDate || null,
          data: d.data, assessment: d.assessment, policy: d.policy, rules: d.rules, imported: true,
        }).select('id').single()) as any
        for (const r of d.reviews) ok(await sb.from('research_reviews').insert({ decision_id: row.id, note: r.note, created_at: r.createdAt }))
        n++
      }
      return n
    },
  }
}

/** Demo mode / tests: the same API over a key-value store. */
export function memoryApi(storage: Pick<Storage, 'getItem' | 'setItem'>, key = 'tradepilot-research-demo'): ResearchApi {
  const read = (): ResearchState => {
    try { const s = JSON.parse(storage.getItem(key) ?? 'null'); if (s?.draft) return s } catch { /* fall through */ }
    return { draft: blankDraft(), rules: {}, policy: defaultPolicy(), decisions: [] }
  }
  const write = (s: ResearchState) => storage.setItem(key, JSON.stringify(s))
  const id = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  return {
    async load() { return read() },
    async saveDraft(draft, rules) { const s = read(); write({ ...s, draft, rules }) },
    async addPolicy(p) { const s = read(); write({ ...s, policy: p }); return p },
    async addDecision(d) {
      const s = read()
      const rec: Decision = { ...structuredClone(d), id: id(), createdAt: new Date().toISOString(), imported: false, reviews: [] }
      write({ ...s, decisions: [rec, ...s.decisions] })
      return rec
    },
    async addReview(decisionId, note) {
      const s = read()
      const r: Review = { id: id(), createdAt: new Date().toISOString(), note }
      write({ ...s, decisions: s.decisions.map(d => (d.id === decisionId ? { ...d, reviews: [...d.reviews, r] } : d)) })
      return r
    },
    async importDecisions(list) {
      const s = read()
      write({ ...s, decisions: [...list.map(d => ({ ...d, imported: true })), ...s.decisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
      return list.length
    },
  }
}

export const researchApi: ResearchApi = isDemo || !supabase
  ? memoryApi(typeof window !== 'undefined' ? window.localStorage : { getItem: () => null, setItem: () => {} })
  : supabaseApi()

// ---------------------------------------------------------------- backup from the standalone research module

export interface ParsedBackup { draft: Draft; rules: Record<string, string>; policy: Policy; decisions: Decision[] }

/**
 * Validates an export of the standalone module ({ format: 'tradepilot-research', version: 1, state }).
 * Throws with a readable reason when the file isn't one.
 */
export function parseBackup(text: string): ParsedBackup {
  let payload: any
  try { payload = JSON.parse(text) } catch { throw new Error('The file is not valid JSON.') }
  if (payload?.format !== 'tradepilot-research' || payload?.version !== 1 || !payload.state) throw new Error('This is not a TradePilot Research backup.')
  const s = payload.state
  if (!validDraft(s.draft) || !validPolicy(s.policy) || !Array.isArray(s.journal) || s.journal.length > 2000) throw new Error('The backup structure is not valid.')
  const rules = s.rules && typeof s.rules === 'object' && !Array.isArray(s.rules) ? s.rules : {}
  const decisions: Decision[] = s.journal.map((r: any) => {
    if (typeof r?.id !== 'string' || !validDraft(r.data) || !validPolicy(r.policy) || typeof r.reason !== 'string'
      || !DECISIONS.includes(r.decision) || !Array.isArray(r.reviews) || !Array.isArray(r.assessment?.checks)) throw new Error('A journal entry in the backup is not valid.')
    return {
      id: r.id, createdAt: String(r.createdAt), decision: r.decision, reason: r.reason.slice(0, 16000), reviewDate: r.reviewDate || null,
      data: r.data, assessment: r.assessment, policy: r.policy, rules: r.rules ?? {}, imported: true,
      reviews: r.reviews.filter((x: any) => typeof x?.note === 'string').map((x: any, i: number) => ({ id: `${r.id}-${i}`, createdAt: String(x.createdAt), note: x.note.slice(0, 16000) })),
    }
  })
  return { draft: withDefaults(s.draft), rules, policy: s.policy, decisions }
}
