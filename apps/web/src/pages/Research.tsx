import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { compact, num2 } from '../lib/format'
import { useLang, useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import {
  applyCompany, assess, blankDraft, safeUrl, wouldReplace, DECISION_LABEL, DECISIONS,
  type Assessment, type DecisionKind, type Draft, type Fact, type Policy,
} from '../lib/research/engine'
import { loadCompany, parseBackup, researchApi, searchCompany, type CompanyHit, type Decision } from '../lib/research/api'
import { PRINCIPLES } from '../lib/research/principles'

type Tab = 'research' | 'decisions' | 'principles' | 'policy'
const TABS: { id: Tab; label: string }[] = [
  { id: 'research', label: 'Research' },
  { id: 'decisions', label: 'Decision log' },
  { id: 'principles', label: 'Principles' },
  { id: 'policy', label: 'Investment policy' },
]

const METRIC_LABEL: Record<string, string> = {
  revenue: 'Annual revenue', netIncome: 'Annual net income', operatingCash: 'Operating cash flow (annual)',
  cash: 'Cash and equivalents', assets: 'Total assets', liabilities: 'Total liabilities',
}

export default function Research() {
  const t = useT()
  const { settings, notify } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some(x => x.id === params.get('tab')) ? params.get('tab') : 'research') as Tab
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft())
  const [rules, setRules] = useState<Record<string, string>>({})
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error' | null>(null)
  const firstSave = useRef(true)

  useEffect(() => {
    researchApi.load()
      .then(s => {
        setDraft(s.draft); setRules(s.rules); setDecisions(s.decisions)
        // No saved policy yet: start the draft from the risk settings already used for trading.
        const fresh = s.policy.version === 1 && s.policy.status === 'draft' && !s.policy.updatedAt
        setPolicy(fresh ? { ...s.policy, risk: settings.risk_per_trade_pct, rr: settings.min_reward_risk, daily: settings.daily_loss_limit_pct, weekly: settings.weekly_loss_limit_pct, open: settings.max_open_positions } : s.policy)
        setLoaded(true)
      })
      .catch(e => setLoadError((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Draft and principle status save automatically to the signed-in account.
  useEffect(() => {
    if (!loaded) return
    if (firstSave.current) { firstSave.current = false; return }
    setSaveState('saving')
    const id = window.setTimeout(() => {
      researchApi.saveDraft(draft, rules).then(() => setSaveState('saved')).catch(() => setSaveState('error'))
    }, 800)
    return () => window.clearTimeout(id)
  }, [draft, rules, loaded])

  const openTab = (id: Tab) => setParams(id === 'research' ? {} : { tab: id })

  if (loadError) return <div className="risk-note danger">{t('Research data did not load: {msg}', { msg: t(loadError) })}</div>
  if (!loaded || !policy) return <div className="subtle">{t('Loading…')}</div>

  return (
    <div className="stack">
      <div className="research-top">
        <div className="tabs" role="tablist">
          {TABS.map(x => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'active' : ''} onClick={() => openTab(x.id)}>
              {t(x.label)}{x.id === 'decisions' && decisions.length > 0 ? ` · ${decisions.length}` : ''}
            </button>
          ))}
        </div>
        <span className="subtle">
          {t('Policy')}: <b>{policy.status === 'active' ? t('active · version {v}', { v: policy.version }) : t('draft')}</b>
          {saveState === 'saving' && ` · ${t('Saving…')}`}
          {saveState === 'saved' && ` · ${t('Saved to your account')}`}
          {saveState === 'error' && <span className="negative"> · {t('Not saved. Check the connection.')}</span>}
        </span>
      </div>

      {tab === 'research' && (
        <ResearchTab draft={draft} setDraft={setDraft} policy={policy}
          onSaved={d => { setDecisions(list => [d, ...list]); notify(t('Decision saved to the log')); openTab('decisions') }} />
      )}
      {tab === 'decisions' && <DecisionsTab decisions={decisions} setDecisions={setDecisions} onNew={() => openTab('research')} />}
      {tab === 'principles' && <PrinciplesTab rules={rules} setRules={setRules} />}
      {tab === 'policy' && <PolicyTab policy={policy} onSaved={p => { setPolicy(p); notify(p.status === 'active' ? t('New policy version activated') : t('Policy draft saved')) }} />}

      <BackupCard state={{ draft, rules, policy, decisions }} onImported={(d, list) => { setDraft(d.draft); setRules(d.rules); setDecisions(list) }} />
    </div>
  )
}

// ======================================================================== research tab

function ResearchTab({ draft, setDraft, policy, onSaved }: { draft: Draft; setDraft: (d: Draft) => void; policy: Policy; onSaved: (d: Decision) => void }) {
  const t = useT()
  const [result, setResult] = useState<Assessment | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Draft, v: string) => {
    const next = { ...draft, [k]: v }
    // Editing the identity drops the loaded company data; editing price/date drops the provider quote.
    if ((k === 'ticker' || k === 'company') && draft.companyData) { next.companyData = null; next.quote = null }
    if ((k === 'price' || k === 'asOf') && draft.quote?.available) next.quote = null
    setDraft(next); setResult(null)
  }
  const field = (k: keyof Draft, label: string, props: Record<string, unknown> = {}, full = false) => (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={`r-${k}`}>{t(label)}</label>
      <input id={`r-${k}`} value={String(draft[k] ?? '')} onChange={e => set(k, e.target.value)} {...props} />
    </div>
  )
  const area = (k: keyof Draft, label: string, placeholder: string, props: Record<string, unknown> = {}) => (
    <div className="field full">
      <label htmlFor={`r-${k}`}>{t(label)}</label>
      <textarea id={`r-${k}`} rows={3} value={String(draft[k] ?? '')} placeholder={t(placeholder)} onChange={e => set(k, e.target.value)} {...props} />
    </div>
  )
  const num = { type: 'number', inputMode: 'decimal', min: '0', step: 'any', dir: 'ltr' }

  function reset() {
    const hasWork = Object.entries(draft).some(([k, v]) => k !== 'mode' && typeof v === 'string' && v)
    if (hasWork && !confirm(t('Clear the research draft? Decisions already in the log stay.'))) return
    setDraft(blankDraft()); setResult(null)
  }

  return (
    <div className="research-grid">
      <article className="card">
        <div className="card-head">
          <div><div className="card-title">{t('What are we looking at?')}</div><div className="subtle">{t('Search a company to fill in its details and reported figures.')}</div></div>
          <button className="btn sm secondary" onClick={reset}>{t('Clear draft')}</button>
        </div>

        <CompanySearch draft={draft} onLoaded={(payload, replacing) => { setDraft(applyCompany(draft, payload, replacing)); setResult(null) }} />
        {draft.companyData && <CompanyFacts draft={draft} onRefresh={payload => setDraft(applyCompany(draft, payload, false))} />}

        <div className="tabs" style={{ margin: '16px 0' }} role="group" aria-label={t('Analysis type')}>
          {(['investment', 'trade'] as const).map(m => (
            <button key={m} aria-pressed={draft.mode === m} className={draft.mode === m ? 'active' : ''} onClick={() => { setDraft({ ...draft, mode: m }); setResult(null) }}>
              {m === 'investment' ? t('Long-term investment') : t('Short-term trade')}
            </button>
          ))}
        </div>

        <form className="form-grid" onSubmit={e => { e.preventDefault(); setResult(assess(draft, policy)) }} noValidate>
          {field('ticker', 'Symbol', { dir: 'ltr', maxLength: 20, placeholder: 'NVDA', autoCapitalize: 'characters' })}
          {field('company', 'Company name', { maxLength: 120 })}
          {field('horizon', 'Decision horizon', { placeholder: t('e.g. 5 years') })}
          {field('price', 'Price per share ($)', { ...num, placeholder: t('not entered') })}
          {field('asOf', 'Date of the price and data', { type: 'datetime-local', dir: 'ltr' })}
          {draft.mode === 'investment' ? (
            <>
              <div className="field full"><div className="ai-sub">{t('Your value estimate per share ($)')}</div></div>
              {field('bear', 'Conservative scenario', num)}
              {field('base', 'Base scenario', num)}
              {field('bull', 'Optimistic scenario', num)}
              {area('valuationNotes', 'Valuation method and assumptions', 'What justifies the value? Which growth, cash-flow and multiple assumptions are behind it?')}
            </>
          ) : (
            <>
              {field('stop', 'Planned stop ($)', num)}
              {field('target', 'Planned target ($)', num)}
              <div className="field full"><div className="hint">{t('Long trades only. A stop is a plan; the actual fill can differ.')}</div></div>
            </>
          )}
          {area('thesis', 'Thesis: why this business, and why now?', 'How does the company make money, and what supports it going forward?')}
          {area('counter', 'The counter-argument', 'What could make this decision a mistake?')}
          {area('invalidation', 'What would change our mind?', 'A business change, a reported figure, or a condition you can check')}
          {area('sources', 'Sources for the company data — one link per line', 'https://investor.company.com/...', { dir: 'ltr' })}
          <details className="field full filters">
            <summary>{t('Portfolio fit — optional')}</summary>
            <div className="form-grid" style={{ marginTop: 10 }}>
              {field('portfolio', 'Portfolio value ($)', num)}
              {field('holding', 'Existing direct holding ($)', num)}
              {field('budget', 'Amount considered ($)', num)}
            </div>
          </details>
          <div className="form-actions field full"><button className="btn" type="submit">{t('Check the decision framework')}</button></div>
        </form>
      </article>

      <AssessmentCard draft={draft} result={result} saving={saving} onSave={async (decision, reason, reviewDate) => {
        if (!result) return
        setSaving(true)
        try {
          const saved = await researchApi.addDecision({ decision, reason, reviewDate, data: structuredClone(draft), assessment: structuredClone(result), policy: structuredClone(policy), rules: {} })
          onSaved(saved)
        } finally { setSaving(false) }
      }} />
    </div>
  )
}

function CompanySearch({ draft, onLoaded }: { draft: Draft; onLoaded: (p: Awaited<ReturnType<typeof loadCompany>>, replacing: boolean) => void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<CompanyHit[]>([])
  const [status, setStatus] = useState<string>('US-listed companies · search by English name or symbol')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (!query) { setHits([]); setStatus('US-listed companies · search by English name or symbol'); return }
    const n = ++seq.current
    const id = window.setTimeout(() => {
      setStatus('Searching the official company list…')
      searchCompany(query)
        .then(r => { if (n !== seq.current) return; setHits(r); setStatus(r.length ? 'Select a company to fill in its data.' : 'No company found. Try a symbol or an English name.') })
        .catch(e => { if (n === seq.current) { setHits([]); setStatus((e as Error).message) } })
    }, 400)
    return () => window.clearTimeout(id)
  }, [q])

  async function choose(hit: CompanyHit) {
    const replacing = wouldReplace(draft, hit.ticker)
    if (replacing && !confirm(t('Switch to {name}? The current analysis will be replaced by a new draft for this company. Decisions in the log stay.', { name: hit.name }))) return
    const n = ++seq.current
    setHits([]); setBusy(true); setQ(`${hit.name} · ${hit.ticker}`)
    setStatus('Loading company details and reported data…')
    try {
      const payload = await loadCompany(hit)
      if (n !== seq.current) return
      onLoaded(payload, replacing)
      setStatus('Company details and available data were filled in. Each figure shows its period and source.')
    } catch (e) {
      if (n === seq.current) setStatus((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="company-search">
      <div className="field">
        <label htmlFor="company-search">{t('Search a company to auto-fill')}</label>
        <input id="company-search" type="search" autoComplete="off" value={q} disabled={busy} placeholder={t('NVIDIA, MSFT or פלנטיר')}
          onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setHits([]) }} aria-describedby="company-search-status" />
        <div id="company-search-status" className="hint" role="status">{t(status)}</div>
      </div>
      {hits.length > 0 && (
        <div className="company-results" role="listbox" aria-label={t('Company search results')}>
          {hits.map(h => (
            <button key={`${h.cik}-${h.ticker}`} type="button" role="option" aria-selected={false} className="company-option" onClick={() => choose(h)}>
              <span><b dir="ltr">{h.ticker}</b><small>{h.exchange}</small></span>
              <span dir="auto">{h.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function useDay() {
  const { lang } = useLang()
  return (v: string | null | undefined) => (v ? new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(v)) : '—')
}

function CompanyFacts({ draft, onRefresh }: { draft: Draft; onRefresh: (p: Awaited<ReturnType<typeof loadCompany>>) => void }) {
  const t = useT()
  const day = useDay()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const c = draft.companyData!
  const q = draft.quote
  return (
    <section className="company-facts" aria-label={t('Reported company data')}>
      <div className="card-head" style={{ padding: 0 }}>
        <div>
          <div className="eyebrow">{c.provider} · {t('reported data')}</div>
          <div className="card-title" dir="auto">{c.name} <span className="ticker" dir="ltr">{c.ticker}</span></div>
          <div className="subtle">{c.exchange}{c.industry ? ` · ${c.industry}` : ''}</div>
        </div>
        <button className="btn sm secondary" disabled={busy} onClick={async () => {
          setBusy(true); setErr(null)
          try { onRefresh(await loadCompany(c)) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
        }}>{busy ? t('Loading…') : t('Refresh data')}</button>
      </div>
      {err && <div className="risk-note danger">{t(err)} {t('Earlier data was not replaced.')}</div>}
      <div className="facts-grid">
        {Object.entries(c.metrics).map(([k, f]) => <FactBox key={k} label={METRIC_LABEL[k] ?? k} f={f} day={day} />)}
      </div>
      <div className="subtle facts-note">
        <p>{t('Retrieved from the filings source: {d}. Figures may refer to different periods; each shows its period and filing date. Liabilities are not necessarily financial debt.', { d: day(c.retrievedAt) })}</p>
        <p>
          {q?.available
            ? t('{kind} price from {p}: ${price} · {d}. Not real-time.', { kind: q.kind === 'end_of_day' ? t('Closing') : t('Delayed'), p: q.provider ?? '', price: q.price ?? '', d: new Date(q.asOf!).toLocaleString() })
            : t(q?.message || 'Share price is not part of SEC filings. Enter the price and its date manually.')}
        </p>
        {c.warnings.map(w => <p key={w} className="negative">{t(w)}</p>)}
      </div>
    </section>
  )
}

function FactBox({ label, f, day }: { label: string; f: Fact | null; day: (v: string | null) => string }) {
  const t = useT()
  const src = f?.source ? safeUrl(f.source) : null
  return (
    <div className="fact">
      <span>{t(label)}</span>
      <strong dir="ltr">{f && Number.isFinite(f.value) ? `$${compact(f.value)}` : t('Not available')}</strong>
      {f ? (
        <>
          <small>{f.kind === 'annual' ? t('Fiscal year ended {d}', { d: day(f.periodEnd) }) : t('As of {d}', { d: day(f.periodEnd) })}</small>
          <small>{t('Filed {d} · {form}', { d: day(f.filed), form: f.form })}</small>
          {src && <a href={src} target="_blank" rel="noopener noreferrer">{t('Open source')}</a>}
        </>
      ) : <small>{t('No matching USD filing found')}</small>}
    </div>
  )
}

function AssessmentCard({ draft, result, saving, onSave }: { draft: Draft; result: Assessment | null; saving: boolean; onSave: (d: DecisionKind, reason: string, reviewDate: string | null) => Promise<void> }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!result) {
    return (
      <aside className="card research-result">
        <div className="card-title">{t('Decision framework')}</div>
        <div className="empty" style={{ borderTop: 0 }}>
          <b>{t('The right question before the next action.')}</b>
          <p>{t('Enter your analysis and we will check completeness, the numbers, and the fit with the framework you chose.')}</p>
        </div>
        <div className="subtle">{t('Company details and financials load from SEC filings. Thesis, risks and value are your analysis.')}</div>
      </aside>
    )
  }
  const a = result
  return (
    <aside className="card research-result">
      <div className="card-head" style={{ padding: 0 }}>
        <div className="card-title">{t('Decision framework')}</div>
        <span className={`bias ${a.complete ? 'bullish' : 'neutral'}`}>{draft.isDemo ? t('Learning example') : a.complete ? t('Ready for review') : t('More information needed')}</span>
      </div>
      <div className="ticker" dir="ltr" style={{ fontSize: 22, marginTop: 10 }}>{draft.ticker || t('No symbol')}</div>
      <div className="subtle">{draft.company} · {draft.mode === 'trade' ? t('Short-term trade') : t('Long-term investment')}</div>
      {draft.mode === 'investment' ? (
        <div className="metric-feature">
          <small>{t('Margin vs. your conservative value')}</small>
          <strong dir="ltr" className={a.margin != null && a.margin < 0 ? 'negative' : ''}>{a.margin == null ? '—' : `${num2(a.margin, 1)}%`}</strong>
          <p>{t('(conservative − price) ÷ conservative')}</p>
        </div>
      ) : (
        <div className="metric-feature">
          <small>{t('Planned reward:risk')}</small>
          <strong dir="ltr">{a.rr == null ? '—' : `1 : ${num2(a.rr)}`}</strong>
          <p>{t('From the entry, stop and target you entered.')}</p>
        </div>
      )}
      <ul className="check-list">
        {a.checks.map(c => <li key={c.label}><span className={c.ok ? 'positive' : 'subtle'}>{c.ok ? '✓' : '○'}</span> {t(c.label)}</li>)}
      </ul>
      {a.exposure != null
        ? <p className="subtle">{t('Planned direct exposure: {p}% of the portfolio. Indirect exposure through funds is not included.', { p: num2(a.exposure, 1) })}</p>
        : <p className="subtle">{t('Portfolio fit not checked yet. You can fill in the portfolio figures in the form.')}</p>}
      {draft.mode === 'trade' && a.units != null && (
        <p className="subtle">{t('Size cap from your numbers: {n} whole shares. Planned risk to the stop: ${r}, before fees and slippage.', { n: a.units, r: num2(a.plannedRisk) })}</p>
      )}
      <p className="hint">{t('The checks test the data you entered; they do not verify the sources or the valuation. A margin against value is not a loss limit.')}</p>
      {!open ? <button className="btn" style={{ width: '100%' }} onClick={() => setOpen(true)}>{t('Record my decision')}</button>
        : <DecisionForm complete={a.complete} saving={saving} onCancel={() => setOpen(false)} onSave={async (d, r, rd) => { await onSave(d, r, rd); setOpen(false) }} />}
    </aside>
  )
}

function DecisionForm({ complete, saving, onSave, onCancel }: { complete: boolean; saving: boolean; onSave: (d: DecisionKind, r: string, rd: string | null) => Promise<void>; onCancel: () => void }) {
  const t = useT()
  const [decision, setDecision] = useState<DecisionKind>(complete ? 'watch' : 'more')
  const [reason, setReason] = useState('')
  const [reviewDate, setReviewDate] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <form className="form-grid" style={{ marginTop: 12 }} onSubmit={async e => {
      e.preventDefault()
      if (!reason.trim()) return setErr(t('Write the reason for the decision.'))
      setErr(null)
      try { await onSave(decision, reason.trim().slice(0, 16000), reviewDate || null) } catch (x) { setErr((x as Error).message) }
    }}>
      <div className="field full"><label>{t('My decision')}</label>
        <select value={decision} onChange={e => setDecision(e.target.value as DecisionKind)}>{DECISIONS.map(d => <option key={d} value={d}>{t(DECISION_LABEL[d])}</option>)}</select>
      </div>
      <div className="field full"><label>{t('My reason')}</label><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('Why did you choose this action?')} /></div>
      <div className="field full"><label>{t('Date to review again')}</label><input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} dir="ltr" /></div>
      <div className="field full hint">{t('A snapshot of the analysis and the policy is saved. This is a decision record; it does not place a trade.')}</div>
      {err && <div className="field full negative">{err}</div>}
      <div className="form-actions field full">
        <button type="button" className="btn secondary" onClick={onCancel}>{t('Cancel')}</button>
        <button className="btn" disabled={saving}>{saving ? t('Saving…') : t('Save to the log')}</button>
      </div>
    </form>
  )
}

// ======================================================================== decisions tab

function DecisionsTab({ decisions, setDecisions, onNew }: { decisions: Decision[]; setDecisions: (f: (d: Decision[]) => Decision[]) => void; onNew: () => void }) {
  const t = useT()
  const day = useDay()
  const [filter, setFilter] = useState<'all' | 'investment' | 'trade'>('all')
  const items = decisions.filter(d => filter === 'all' || d.data.mode === filter)
  return (
    <section className="stack">
      <div className="card-head" style={{ padding: 0 }}>
        <div className="tabs">
          {(['all', 'investment', 'trade'] as const).map(f => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>{t(f === 'all' ? 'All decisions' : f === 'investment' ? 'Investments' : 'Trades')}</button>
          ))}
        </div>
        <button className="btn sm" onClick={onNew}>{t('New analysis')}</button>
      </div>
      {items.length === 0 ? (
        <article className="card"><div className="empty" style={{ borderTop: 0 }}>{t("Today's thinking is tomorrow's lesson. After checking an analysis, save your decision and reason; it will appear here with the data you had.")}</div></article>
      ) : items.map(r => <DecisionCard key={r.id} r={r} day={day} onReview={rev => setDecisions(list => list.map(x => (x.id === r.id ? { ...x, reviews: [...x.reviews, rev] } : x)))} />)}
    </section>
  )
}

function DecisionCard({ r, day, onReview }: { r: Decision; day: (v: string | null) => string; onReview: (rev: Decision['reviews'][number]) => void }) {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const d = r.data, a = r.assessment
  const due = r.reviewDate && new Date(r.reviewDate) < new Date()
  return (
    <article className="card decision-card">
      <div className="card-head" style={{ padding: 0 }}>
        <div className="card-title"><span className="ticker" dir="ltr">{d.ticker || t('No symbol')}</span> <span className="company">{d.company}</span></div>
        <span className={`bias ${d.isDemo ? 'neutral' : ''}`}>{t(DECISION_LABEL[r.decision])}</span>
      </div>
      <div className="subtle">
        {day(r.createdAt)} · {d.mode === 'trade' ? t('Short-term trade') : t('Long-term investment')} · {t('policy v{v} ({s})', { v: r.policy.version, s: r.policy.status === 'active' ? t('active') : t('draft') })}
        {r.imported && ` · ${t('imported')}`}{d.isDemo && ` · ${t('fictional example')}`}
      </div>
      <p>{r.reason}</p>
      {r.reviewDate && <p className={due ? 'negative' : 'subtle'}>{t('Review date: {d}', { d: day(r.reviewDate) })}</p>}
      <details>
        <summary>{t('Snapshot at decision time')}</summary>
        <dl className="snapshot">
          <dt>{t('Price entered')}</dt><dd dir="ltr">{d.price ? `$${d.price}` : '—'}</dd>
          <dt>{t('Data date')}</dt><dd>{d.asOf ? new Date(d.asOf).toLocaleString() : '—'}</dd>
          <dt>{t('Decision horizon')}</dt><dd>{d.horizon || '—'}</dd>
          <dt>{t('Thesis')}</dt><dd>{d.thesis || '—'}</dd>
          <dt>{t('The counter-argument')}</dt><dd>{d.counter || '—'}</dd>
          <dt>{t('What would change our mind?')}</dt><dd>{d.invalidation || '—'}</dd>
          <dt>{d.mode === 'trade' ? t('Planned reward:risk') : t('Margin vs. your conservative value')}</dt>
          <dd dir="ltr">{d.mode === 'trade' ? (a.rr == null ? '—' : `1 : ${num2(a.rr)}`) : (a.margin == null ? '—' : `${num2(a.margin, 1)}%`)}</dd>
          <dt>{t('Valuation method and assumptions')}</dt><dd>{d.valuationNotes || '—'}</dd>
        </dl>
        <p className="subtle">{t('{ok} of {n} framework checks were complete at decision time.', { ok: a.checks.filter(x => x.ok).length, n: a.checks.length })}</p>
        {a.sources.length > 0 && <ul className="source-list">{a.sources.map(u => safeUrl(u)).filter(Boolean).map(u => <li key={u}><a href={u!} target="_blank" rel="noopener noreferrer" dir="ltr">{u}</a></li>)}</ul>}
      </details>
      {r.reviews.map(x => (
        <div key={x.id} className="review-item"><small className="subtle">{t('Later review · {d}', { d: day(x.createdAt) })}</small><p>{x.note}</p></div>
      ))}
      {!adding ? <button className="btn sm secondary" onClick={() => setAdding(true)}>{t('Add a review')}</button> : (
        <form className="form-grid" onSubmit={async e => {
          e.preventDefault()
          if (!note.trim()) return
          try { onReview(await researchApi.addReview(r.id, note.trim().slice(0, 16000))); setNote(''); setAdding(false) } catch (x) { setErr((x as Error).message) }
        }}>
          <div className="field full"><label>{t('What have we learned since?')}</label><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={t('What changed? Does the original reason still hold? What do we take forward?')} /></div>
          <div className="field full hint">{t('The review is added to the original decision; the original stays as it was.')}</div>
          {err && <div className="field full negative">{err}</div>}
          <div className="form-actions field full"><button type="button" className="btn secondary" onClick={() => setAdding(false)}>{t('Cancel')}</button><button className="btn">{t('Add review')}</button></div>
        </form>
      )}
    </article>
  )
}

// ======================================================================== principles & policy

function PrinciplesTab({ rules, setRules }: { rules: Record<string, string>; setRules: (r: Record<string, string>) => void }) {
  const t = useT()
  const { lang } = useLang()
  return (
    <section className="principles-grid">
      {PRINCIPLES.map(p => (
        <article className="card" key={p.id}>
          <div className="eyebrow">{t('From the reading')}</div>
          <div className="card-title" style={{ fontSize: 17, margin: '6px 0' }}>{p.title[lang]}</div>
          <p className="subtle">{p.body[lang]}</p>
          <div className="risk-note">{t('Proposed rule:')} {p.rule[lang]}</div>
          <div className="principle-foot">
            <small className="subtle">{t('The Intelligent Investor, pages {p} · our wording', { p: p.pages })}</small>
            <select value={rules[p.id] ?? 'idea'} aria-label={t('Rule status')} onChange={e => setRules({ ...rules, [p.id]: e.target.value })}>
              <option value="idea">{t('Idea')}</option><option value="discuss">{t('Under discussion')}</option><option value="active">{t('Active')}</option>
            </select>
          </div>
        </article>
      ))}
    </section>
  )
}

function PolicyTab({ policy, onSaved }: { policy: Policy; onSaved: (p: Policy) => void }) {
  const t = useT()
  const [form, setForm] = useState<Policy>(policy)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => setForm(policy), [policy])
  const set = (k: keyof Policy, v: string) => setForm(f => ({ ...f, [k]: k === 'goal' || k === 'horizon' ? v : v === '' ? '' : Number(v) }) as Policy)
  const n = (k: keyof Policy, label: string, extra: Record<string, unknown> = {}) => (
    <div className="field"><label>{t(label)}</label><input type="number" inputMode="decimal" step="any" dir="ltr" value={String(form[k] ?? '')} onChange={e => set(k, e.target.value)} {...extra} /></div>
  )
  async function save(active: boolean) {
    const next: Policy = { ...form, version: policy.version + (policy.updatedAt ? 1 : 0), status: active ? 'active' : 'draft', updatedAt: new Date().toISOString() }
    const ok = (['risk', 'daily', 'weekly'] as const).every(k => Number(next[k]) > 0 && Number(next[k]) <= 100) && Number(next.rr) > 0
      && Number.isInteger(Number(next.open)) && Number(next.open) >= 1 && (next.maxStock === '' || (Number(next.maxStock) > 0 && Number(next.maxStock) <= 100))
    if (!ok) return setErr(t('Check the policy values.'))
    setBusy(true); setErr(null)
    try { onSaved(await researchApi.addPolicy(next)) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <article className="card">
      <div className="card-head" style={{ padding: 0 }}>
        <div><div className="card-title">{t('Rules before action')}</div><div className="subtle">{t('Your personal framework. Every decision is saved with its policy version.')}</div></div>
        <span className="pill">{t('version {v} · {s}', { v: policy.version, s: policy.status === 'active' ? t('active') : t('draft') })}</span>
      </div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field full"><label>{t('Goal of the money')}</label><input value={form.goal} onChange={e => set('goal', e.target.value)} placeholder={t('e.g. building long-term wealth')} /></div>
        <div className="field"><label>{t('When the money is needed')}</label><input value={form.horizon} onChange={e => set('horizon', e.target.value)} /></div>
        {n('maxStock', 'Max direct exposure per stock (%)', { min: 0.1, max: 100 })}
        <div className="field full"><div className="ai-sub">{t('Short-term trading framework')}</div><div className="hint">{t('Started from your risk settings. Adjust before activating.')}</div></div>
        {n('risk', 'Planned risk per trade (%)')}
        {n('rr', 'Minimum reward:risk')}
        {n('open', 'Trades at the same time', { step: 1, min: 1 })}
        {n('daily', 'Daily loss limit (%)')}
        {n('weekly', 'Weekly loss limit (%)')}
        <div className="field full hint">{t('Saving creates a new version; earlier versions stay attached to the decisions made under them.')}</div>
        {err && <div className="field full negative">{err}</div>}
        <div className="form-actions field full">
          <button className="btn secondary" disabled={busy} onClick={() => save(false)}>{t('Save as draft')}</button>
          <button className="btn" disabled={busy} onClick={() => save(true)}>{t('Activate new version')}</button>
        </div>
      </div>
    </article>
  )
}

// ======================================================================== backup

function BackupCard({ state, onImported }: { state: { draft: Draft; rules: Record<string, string>; policy: Policy; decisions: Decision[] }; onImported: (d: { draft: Draft; rules: Record<string, string> }, list: Decision[]) => void }) {
  const t = useT()
  const [msg, setMsg] = useState<ReactNode>(null)
  const exportJson = useCallback(() => {
    const journal = state.decisions.map(d => ({ id: d.id, createdAt: d.createdAt, decision: d.decision, reason: d.reason, reviewDate: d.reviewDate ?? '', data: d.data, assessment: d.assessment, policy: d.policy, rules: d.rules, reviews: d.reviews.map(r => ({ createdAt: r.createdAt, note: r.note })) }))
    const blob = new Blob([JSON.stringify({ format: 'tradepilot-research', version: 1, exportedAt: new Date().toISOString(), state: { draft: state.draft, policy: state.policy, rules: state.rules, journal } }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `TradePilot_Research_Backup_${new Date().toISOString().slice(0, 10)}.json`; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [state])
  const existing = useMemo(() => new Set(state.decisions.map(d => `${d.createdAt}|${d.reason}`)), [state.decisions])

  async function importFile(file: File) {
    try {
      if (file.size > 5_000_000) throw new Error(t('The file is larger than 5MB.'))
      const b = parseBackup(await file.text())
      const fresh = b.decisions.filter(d => !existing.has(`${d.createdAt}|${d.reason}`))
      const keepDraft = !state.draft.ticker && !state.draft.thesis
      if (!confirm(t('Import {n} decisions from the backup into your account? {d}', { n: fresh.length, d: keepDraft ? t('The backup draft will also be loaded.') : t('Your current draft stays.') }))) return
      const n = await researchApi.importDecisions(fresh)
      const after = await researchApi.load()
      onImported({ draft: keepDraft ? b.draft : state.draft, rules: { ...b.rules, ...state.rules } }, after.decisions)
      setMsg(t('Imported {n} decisions. {skip}', { n, skip: b.decisions.length - fresh.length ? t('{k} already existed and were skipped.', { k: b.decisions.length - fresh.length }) : '' }))
    } catch (e) { setMsg(<span className="negative">{t('Import failed: {msg}', { msg: t((e as Error).message) })}</span>) }
  }

  return (
    <article className="card">
      <div className="card-head" style={{ padding: 0 }}>
        <div><div className="card-title">{t('Backup')}</div><div className="subtle">{t('Research is saved to your account. Move a backup from the standalone research app here, or export a copy.')}</div></div>
        <div className="btn-row">
          <label className="btn sm secondary" tabIndex={0}>{t('Import backup')}<input type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} /></label>
          <button className="btn sm secondary" onClick={exportJson}>{t('Export backup')}</button>
        </div>
      </div>
      {msg && <div className="subtle" style={{ marginTop: 10 }}>{msg}</div>}
    </article>
  )
}
