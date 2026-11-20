// Supabase Edge Function: market-data
// Proxies Financial Modeling Prep so the API key never reaches the browser, and runs the
// AI analyst (Claude) on the data the app already computed.
// Secrets: FMP_API_KEY (market data), ANTHROPIC_API_KEY (AI analyst, optional).
// Only signed-in users of this project can call it (the anon key alone is rejected).

import Anthropic from 'npm:@anthropic-ai/sdk@1.11.0'

const FMP = 'https://financialmodelingprep.com/stable'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function signedInUser(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!auth || !url || !anon) return false
  const r = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } })
  return r.ok
}

// ---------------------------------------------------------------------------
// AI analyst
// ---------------------------------------------------------------------------

const AI_SYSTEM = `You are a seasoned equity analyst helping a single retail swing trader review one US stock.
You receive JSON the app computed from market data: company profile, technical indicators and signals,
fundamental ratios, annual results, peers, and the trader's own risk settings (risk per trade %, reward:risk ratio, equity).

Your job:
1. Use web search (a few queries at most) for what the data cannot show: what the business does today, recent news,
   earnings, guidance, catalysts, and which stocks move with it (competitors, suppliers, customers, sector ETFs).
2. Weigh the technical picture, the fundamentals and the news together and give a clear view: enter a long now,
   wait for a better setup, or avoid. Say why, with the strongest reasons on both sides. Be candid when the evidence is mixed.
3. Propose a concrete trade plan. The trader only goes long. Use the trader's reward:risk ratio exactly:
   target = entry + ratio × (entry − stop). Put the stop at a level that invalidates the idea (under support, or ~2×ATR),
   not an arbitrary percentage. If the right call is to wait, give the entry trigger level to wait for (for example a
   breakout above resistance or a pullback to support) and still fill entry/stop/target for that trigger.
   If the right call is to avoid, set entry, stop and target to null.
4. List the key risks and upcoming catalysts.

Write every text field in Hebrew, plainly, for a trader who knows the basics. Keep tickers, numbers and indicator names
(RSI, MACD, P/E) as they are. Prices are in USD. This is decision support for the trader's own decision; do not hedge
every sentence, but do not overstate certainty either.

When you are done, call the submit_analysis tool exactly once with your final answer. Do not write the answer as text.`

const SUBMIT_TOOL = {
  name: 'submit_analysis',
  description: 'Submit the final analysis and trade recommendation for the stock. Call exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'confidence', 'headline', 'summary', 'reasons_for', 'reasons_against', 'business', 'news', 'related', 'trade', 'risks', 'catalysts'],
    properties: {
      verdict: { type: 'string', enum: ['enter', 'wait', 'avoid'], description: 'enter = go long now, wait = wait for the trigger in trade, avoid = no trade' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      headline: { type: 'string', description: 'One sentence, Hebrew: the recommendation and the main reason.' },
      summary: { type: 'string', description: 'Hebrew, 3-5 sentences: why this recommendation, combining technicals, fundamentals and news.' },
      reasons_for: { type: 'array', items: { type: 'string' }, description: 'Hebrew bullet points supporting a long.' },
      reasons_against: { type: 'array', items: { type: 'string' }, description: 'Hebrew bullet points against a long.' },
      business: { type: 'string', description: 'Hebrew, 2-4 sentences: what the company does, how it makes money, its position.' },
      news: { type: 'array', items: { type: 'string' }, description: 'Hebrew, recent relevant news items with approximate dates.' },
      related: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['symbol', 'relation'],
          properties: { symbol: { type: 'string' }, relation: { type: 'string', description: 'Hebrew: how it relates (competitor, supplier, customer, sector ETF) and how it tends to move with this stock.' } },
        },
      },
      trade: {
        type: 'object', additionalProperties: false, required: ['entry', 'stop', 'target', 'trigger', 'rationale'],
        properties: {
          entry: { type: ['number', 'null'] },
          stop: { type: ['number', 'null'] },
          target: { type: ['number', 'null'] },
          trigger: { type: 'string', description: 'Hebrew: the condition for entering (e.g. "close above 182").' },
          rationale: { type: 'string', description: 'Hebrew: why these levels.' },
        },
      },
      risks: { type: 'array', items: { type: 'string' } },
      catalysts: { type: 'array', items: { type: 'string' } },
    },
  },
}

/** One Claude request with web search plus a strict "submit" tool; returns the tool input or an error Response. */
// deno-lint-ignore no-explicit-any
async function callClaude(system: string, tool: any, userContent: string): Promise<Response | { input: unknown; model: string; sources: { title: string; url: string }[] }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY secret is not set in Supabase' }, 500)
  const client = new Anthropic({ apiKey })
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: 'user', content: userContent }]
  // deno-lint-ignore no-explicit-any
  let response: any = null
  for (let i = 0; i < 4; i++) {
    // deno-lint-ignore no-explicit-any
    response = await (client.beta.messages.create as any)({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // re-run on a fallback model if the request is declined
      output_config: { effort: 'medium' },
      system,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, tool],
      messages,
    })
    // Server-side search loop paused: resend with the partial turn and the API resumes.
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content })
      continue
    }
    break
  }
  if (response?.stop_reason === 'refusal') return json({ error: 'The AI declined this request' }, 502)
  // deno-lint-ignore no-explicit-any
  const call = response?.content?.find((b: any) => b.type === 'tool_use' && b.name === tool.name)
  if (!call) return json({ error: `The AI did not return an analysis (stop: ${response?.stop_reason ?? 'unknown'})` }, 502)
  // deno-lint-ignore no-explicit-any
  const sources = (response.content as any[])
    .filter(b => b.type === 'web_search_tool_result' && Array.isArray(b.content))
    // deno-lint-ignore no-explicit-any
    .flatMap(b => b.content.map((r: any) => ({ title: r.title, url: r.url })))
    .slice(0, 10)
  return { input: call.input, model: response.model, sources }
}

async function runAnalyst(symbol: string, context: unknown) {
  const ctx = JSON.stringify(context ?? {})
  if (ctx.length > 40_000) return json({ error: 'Context too large' }, 400)
  const r = await callClaude(AI_SYSTEM, SUBMIT_TOOL, `Analyze ${symbol}. Today is ${new Date().toISOString().slice(0, 10)}.\n\nData from the app (JSON):\n${ctx}`)
  if (r instanceof Response) return r
  return json({ symbol, model: r.model, generatedAt: new Date().toISOString(), analysis: r.input, sources: r.sources })
}

// ---------------------------------------------------------------------------
// Hot stocks: candidate scan (FMP) and AI ranking
// ---------------------------------------------------------------------------

const RANK_SYSTEM = `You are a swing-trading analyst reviewing tonight's "stocks in play" scan for one retail trader.
Strategy: momentum swing on US stocks. A candidate closed near its high on unusually high volume while in an uptrend
(above its 50- and 200-day averages). The plan is a buy-stop above the signal day's high, a stop under the signal day's low
(capped at 2×ATR), and a target at the trader's reward:risk ratio. Holding period is days to a few weeks. Long only.

For the candidates you receive (already filtered by these rules, with computed metrics and the plan levels):
1. Use web search to find WHY each stock moved (earnings, guidance, upgrade, contract, sector news, short squeeze, offering).
   Search efficiently: one or two broad searches can cover several tickers.
2. Judge the quality of each setup: a fundamental catalyst with follow-through potential beats a low-quality spike; flag
   dilution/offerings, binary events (earnings in the next few days, FDA), and moves that look exhausted.
3. Rank the candidates from best to worst and give each a verdict: enter (take the breakout trigger), wait (watch, needs
   more confirmation), or avoid.

Write all text in Hebrew, concise, for a trader who knows the basics. Keep tickers and numbers as they are.
This is decision support; the trader decides. When done, call submit_ranking exactly once. Do not write the answer as text.`

const RANK_TOOL = {
  name: 'submit_ranking',
  description: 'Submit the ranked candidates. Call exactly once, at the end.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['market_note', 'picks'],
    properties: {
      market_note: { type: 'string', description: 'Hebrew, 1-2 sentences on the overall market backdrop today.' },
      picks: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['symbol', 'rank', 'verdict', 'why_moving', 'reason', 'risk'],
          properties: {
            symbol: { type: 'string' },
            rank: { type: 'integer', description: '1 = best' },
            verdict: { type: 'string', enum: ['enter', 'wait', 'avoid'] },
            why_moving: { type: 'string', description: 'Hebrew: the catalyst behind the move.' },
            reason: { type: 'string', description: 'Hebrew: why this rank and verdict.' },
            risk: { type: 'string', description: 'Hebrew: the main risk (e.g. earnings date, offering, extended).' },
          },
        },
      },
    },
  },
}

async function runRanker(candidates: unknown, trader: unknown) {
  const payload = JSON.stringify({ candidates, trader })
  if (payload.length > 60_000) return json({ error: 'Context too large' }, 400)
  const r = await callClaude(RANK_SYSTEM, RANK_TOOL, `Today is ${new Date().toISOString().slice(0, 10)}. Rank tonight's candidates.\n\nData (JSON):\n${payload}`)
  if (r instanceof Response) return r
  return json({ model: r.model, generatedAt: new Date().toISOString(), ranking: r.input, sources: r.sources })
}

/** Gainers + most active + extra symbols, each with ~14 months of daily bars. */
async function runScan(key: string, extra: string[]) {
  const SYM = /^[A-Z]{1,5}$/ // common stocks only (skips warrants, units, foreign suffixes)
  const lists: Record<string, string> = { gainers: 'biggest-gainers', actives: 'most-actives' }
  const errors: Record<string, string> = {}
  const pool = new Map<string, { symbol: string; name: string | null; source: string[] }>()
  await Promise.all(Object.entries(lists).map(async ([name, path]) => {
    try {
      const r = await fetch(`${FMP}/${path}?apikey=${key}`)
      const d = await r.json().catch(() => null)
      if (!r.ok || !Array.isArray(d)) { errors[name] = `${r.status}: ${String((d as Record<string, unknown> | null)?.['Error Message'] ?? '').slice(0, 120)}`; return }
      // deno-lint-ignore no-explicit-any
      for (const q of d as any[]) {
        const sym = String(q.symbol ?? '').toUpperCase()
        const price = Number(q.price)
        if (!SYM.test(sym) || !(price >= 3)) continue
        const ex = String(q.exchange ?? '').toUpperCase()
        if (ex && !/NASDAQ|NYSE|AMEX/.test(ex)) continue
        const cur = pool.get(sym) ?? { symbol: sym, name: q.name ?? null, source: [] as string[] }
        cur.source.push(name)
        pool.set(sym, cur)
      }
    } catch (e) { errors[name] = String((e as Error).message ?? e) }
  }))
  for (const s of extra) {
    const sym = String(s).toUpperCase()
    if (!/^[A-Z0-9.\-]{1,12}$/.test(sym)) continue
    const cur = pool.get(sym) ?? { symbol: sym, name: null, source: [] as string[] }
    cur.source.push('watchlist')
    pool.set(sym, cur)
  }
  // Cap history requests to protect the free plan's daily quota.
  const picked = [...pool.values()].sort((a, b) => b.source.length - a.source.length).slice(0, 30)
  const from = new Date(Date.now() - 420 * 86_400_000).toISOString().slice(0, 10)
  const results = await Promise.all(picked.map(async c => {
    try {
      const r = await fetch(`${FMP}/historical-price-eod/full?symbol=${encodeURIComponent(c.symbol)}&from=${from}&apikey=${key}`)
      const d = await r.json().catch(() => null)
      // deno-lint-ignore no-explicit-any
      const rows: any[] = Array.isArray(d) ? d : (d?.historical ?? [])
      if (!r.ok || rows.length === 0) return { ...c, error: `${r.status}` }
      const bars = rows.map(x => [String(x.date), +x.open, +x.high, +x.low, +x.close, +x.volume]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      return { ...c, bars }
    } catch (e) { return { ...c, error: String((e as Error).message ?? e) } }
  }))
  return json({ fetchedAt: new Date().toISOString(), candidates: results, errors, requests: 2 + picked.length })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  if (!(await signedInUser(req))) return json({ error: 'Sign in required' }, 401)

  const body = await req.json().catch(() => ({}))

  // AI mode: { ai: { symbol, context } } → Claude's recommendation (does not use FMP).
  if (body?.ai) {
    const sym = String(body.ai.symbol ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9.\-]{1,12}$/.test(sym)) return json({ error: 'Invalid symbol' }, 400)
    try {
      return await runAnalyst(sym, body.ai.context)
    } catch (e) {
      const status = (e as { status?: number }).status
      return json({ error: `AI request failed${status ? ` (${status})` : ''}: ${String((e as Error).message ?? e).slice(0, 300)}` }, 502)
    }
  }

  // Ranking mode: { rank: { candidates, trader } } → Claude ranks tonight's scan.
  if (body?.rank) {
    try {
      return await runRanker(body.rank.candidates, body.rank.trader)
    } catch (e) {
      const status = (e as { status?: number }).status
      return json({ error: `AI request failed${status ? ` (${status})` : ''}: ${String((e as Error).message ?? e).slice(0, 300)}` }, 502)
    }
  }

  const key = Deno.env.get('FMP_API_KEY')
  if (!key) return json({ error: 'FMP_API_KEY secret is not set in Supabase' }, 500)

  // Scan mode: { scan: { extra: [...] } } → hot-stock candidates with daily bars.
  if (body?.scan) return await runScan(key, Array.isArray(body.scan.extra) ? body.scan.extra.slice(0, 20) : [])

  // Quotes mode: { symbols: [...] } → latest price and daily change for each (used by the watchlist).
  if (Array.isArray(body?.symbols)) {
    const symbols = [...new Set((body.symbols as unknown[]).map(x => String(x).trim().toUpperCase()))]
      .filter(x => /^[A-Z0-9.\-]{1,12}$/.test(x))
      .slice(0, 30)
    const quotes = await Promise.all(symbols.map(async sym => {
      try {
        const r = await fetch(`${FMP}/quote?symbol=${encodeURIComponent(sym)}&apikey=${key}`)
        const d = await r.json().catch(() => null)
        const q = Array.isArray(d) ? d[0] : null
        if (!r.ok || !q) return { symbol: sym, error: String(r.status) }
        return {
          symbol: sym,
          price: q.price ?? null,
          change: q.change ?? null,
          changePct: q.changePercentage ?? q.changesPercentage ?? null,
          timestamp: q.timestamp ?? null,
        }
      } catch (e) {
        return { symbol: sym, error: String((e as Error).message ?? e) }
      }
    }))
    return json({ quotes, fetchedAt: new Date().toISOString() })
  }

  const symbol = String(body?.symbol ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return json({ error: 'Invalid symbol' }, 400)

  const from = new Date(Date.now() - 420 * 86_400_000).toISOString().slice(0, 10)
  const s = encodeURIComponent(symbol)
  const endpoints: Record<string, string> = {
    profile: `profile?symbol=${s}`,
    history: `historical-price-eod/full?symbol=${s}&from=${from}`,
    ratios: `ratios-ttm?symbol=${s}`,
    metrics: `key-metrics-ttm?symbol=${s}`,
    income: `income-statement?symbol=${s}&limit=5`,
    peers: `stock-peers?symbol=${s}`,
  }

  const entries = await Promise.all(
    Object.entries(endpoints).map(async ([name, path]) => {
      try {
        const r = await fetch(`${FMP}/${path}&apikey=${key}`)
        const text = await r.text()
        let data: unknown = null
        try { data = JSON.parse(text) } catch { /* not JSON */ }
        const fmpError = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>)['Error Message'] : null
        if (!r.ok || fmpError || data == null) {
          const msg = String(fmpError ?? text).slice(0, 200).replaceAll(key, '***')
          return [name, { error: `${r.status}: ${msg}` }]
        }
        return [name, { data }]
      } catch (e) {
        return [name, { error: String((e as Error).message ?? e) }]
      }
    }),
  )

  return json({ symbol, fetchedAt: new Date().toISOString(), ...Object.fromEntries(entries) })
})
