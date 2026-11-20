// Supabase Edge Function: market-data
// Proxies Financial Modeling Prep so the API key never reaches the browser.
// Secret required: FMP_API_KEY (Edge Functions → Secrets).
// Only signed-in users of this project can call it (the anon key alone is rejected).

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  if (!(await signedInUser(req))) return json({ error: 'Sign in required' }, 401)

  const key = Deno.env.get('FMP_API_KEY')
  if (!key) return json({ error: 'FMP_API_KEY secret is not set in Supabase' }, 500)

  const body = await req.json().catch(() => ({}))

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
