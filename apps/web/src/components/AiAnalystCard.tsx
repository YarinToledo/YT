import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { planPosition } from '../lib/calc'
import { money, qty, ratio } from '../lib/format'
import { useT } from '../lib/i18n'
import { fetchAiAnalysis, type AiResult } from '../lib/market'
import { useStore } from '../lib/store'

const CACHE_KEY = 'tradepilot-ai-'

function readCache(symbol: string): AiResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY + symbol)
    return raw ? (JSON.parse(raw) as AiResult) : null
  } catch { return null }
}

/**
 * Asks the AI analyst for a recommendation on demand (each run costs money, so it never runs automatically).
 * `context` is the data the page already computed; the analyst adds web search for news and business context.
 */
export default function AiAnalystCard({ symbol, context, onAnalyze }: { symbol: string; context: unknown; onAnalyze(symbol: string): void }) {
  const t = useT()
  const { settings, usage } = useStore()
  const [result, setResult] = useState<AiResult | null>(() => readCache(symbol))
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })

  useEffect(() => { setResult(readCache(symbol)); setState({ loading: false, error: null }) }, [symbol])

  async function run() {
    setState({ loading: true, error: null })
    try {
      const r = await fetchAiAnalysis(symbol, context)
      setResult(r)
      try { sessionStorage.setItem(CACHE_KEY + symbol, JSON.stringify(r)) } catch { /* storage full or blocked */ }
      setState({ loading: false, error: null })
    } catch (e) {
      setState({ loading: false, error: (e as Error).message })
    }
  }

  const a = result?.analysis
  const tr = a?.trade
  const hasPlan = tr && tr.entry != null && tr.stop != null && tr.target != null && tr.entry > tr.stop
  const rr = hasPlan ? (tr!.target! - tr!.entry!) / (tr!.entry! - tr!.stop!) : null
  const sized = hasPlan
    ? planPosition({ direction: 'LONG', entry: tr!.entry!, stop: tr!.stop!, target: tr!.target!, equity: usage.equity, riskPct: settings.risk_per_trade_pct, fractional: settings.fractional_shares })
    : null
  const verdictLabel = { enter: t('Enter long'), wait: t('Wait for a setup'), avoid: t('Avoid') }
  const verdictBias = { enter: 'bullish', wait: 'neutral', avoid: 'bearish' } as const
  const confLabel = { low: t('Low confidence'), medium: t('Medium confidence'), high: t('High confidence') }

  return (
    <article className="card ai-card">
      <div className="card-head">
        <div>
          <div className="card-title">{t('AI analyst recommendation')}</div>
          <div className="subtle">{t('Claude reviews the data above plus recent news, then recommends using your risk settings')}</div>
        </div>
        <button className="btn" disabled={state.loading} onClick={run}>
          {state.loading ? t('Analyzing…') : result ? t('Run again') : t('Get AI recommendation')}
        </button>
      </div>

      {state.loading && <div className="subtle">{t('The analyst is reading the data and searching for news. This can take up to a minute.')}</div>}
      {state.error && <div className="risk-note danger">{t(state.error)}</div>}
      {!a && !state.loading && !state.error && <div className="subtle">{t('Each run costs a few cents on your Anthropic account.')}</div>}

      {a && (
        <div className="ai-body">
          <div className="ai-verdict">
            <span className={`bias ${verdictBias[a.verdict]}`}>{verdictLabel[a.verdict]}</span>
            <span className="subtle">{confLabel[a.confidence]}</span>
          </div>
          <p className="ai-headline">{a.headline}</p>
          <p className="ai-text">{a.summary}</p>

          <section className="grid two-col ai-grid">
            <div>
              <div className="ai-sub positive">{t('Reasons for')}</div>
              <ul className="signals">{a.reasons_for.map((x, i) => <li key={i} className="bullish">{x}</li>)}</ul>
            </div>
            <div>
              <div className="ai-sub negative">{t('Reasons against')}</div>
              <ul className="signals">{a.reasons_against.map((x, i) => <li key={i} className="bearish">{x}</li>)}</ul>
            </div>
          </section>

          <div className="ai-sub">{t('Recommended trade for you')}</div>
          {hasPlan ? (
            <>
              <div className="perf-row">
                <div><span>{t('Entry')}</span><b>{money(tr!.entry)}</b></div>
                <div><span>{t('Stop loss')}</span><b className="negative">{money(tr!.stop)}</b></div>
                <div><span>{t('Target')}</span><b className="positive">{money(tr!.target)}</b></div>
                <div><span>{t('R:R')}</span><b className={rr != null && rr + 0.05 < settings.min_reward_risk ? 'warn' : ''}>{ratio(rr)}</b></div>
                {sized?.ok && <div><span>{t('Position size:')}</span><b>{t('{n} shares', { n: qty(sized.quantity) })}</b></div>}
                {sized?.ok && <div><span>{t('Risk:')}</span><b className="negative">{money(sized.riskAmount)}</b></div>}
              </div>
              {tr!.trigger && <p className="ai-text"><b>{t('Entry trigger:')}</b> {tr!.trigger}</p>}
              <p className="ai-text">{tr!.rationale}</p>
              <div className="btn-row">
                <Link className="btn" style={{ textDecoration: 'none' }} to={`/?symbol=${encodeURIComponent(symbol)}&entry=${tr!.entry}&stop=${tr!.stop}&target=${tr!.target}`}>{t('Send to trade planner')}</Link>
              </div>
            </>
          ) : (
            <p className="ai-text">{tr?.rationale || t('The analyst does not recommend a trade right now.')}</p>
          )}

          <section className="grid two-col ai-grid">
            <div>
              <div className="ai-sub">{t('About the business')}</div>
              <p className="ai-text">{a.business}</p>
              {a.news.length > 0 && <>
                <div className="ai-sub">{t('Recent news')}</div>
                <ul className="signals">{a.news.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>}
            </div>
            <div>
              {a.related.length > 0 && <>
                <div className="ai-sub">{t('Related stocks')}</div>
                <ul className="ai-related">
                  {a.related.map(r => (
                    <li key={r.symbol}>
                      <button type="button" className="chip" onClick={() => onAnalyze(r.symbol)}>{r.symbol}</button>
                      <span>{r.relation}</span>
                    </li>
                  ))}
                </ul>
              </>}
              {a.risks.length > 0 && <>
                <div className="ai-sub">{t('Key risks')}</div>
                <ul className="signals">{a.risks.map((x, i) => <li key={i} className="bearish">{x}</li>)}</ul>
              </>}
              {a.catalysts.length > 0 && <>
                <div className="ai-sub">{t('Upcoming catalysts')}</div>
                <ul className="signals">{a.catalysts.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>}
            </div>
          </section>

          {result!.sources.length > 0 && (
            <div className="ai-sources">
              <span className="subtle">{t('Sources:')}</span>
              {result!.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || new URL(s.url).hostname}</a>)}
            </div>
          )}
          <div className="subtle" style={{ marginTop: 12 }}>
            {t('Generated {d} by {m}. AI can be wrong; this is decision support, not investment advice. The decision is yours.', { d: new Date(result!.generatedAt).toLocaleString(), m: result!.model })}
          </div>
        </div>
      )}
    </article>
  )
}
