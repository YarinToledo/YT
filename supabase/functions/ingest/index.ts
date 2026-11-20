// Supabase Edge Function: ingest
// Receives signals from the IBKR worker running on your cloud server and stores them in `market_signals`.
// The worker authenticates with a shared secret (INGEST_SECRET) in the `x-ingest-secret` header,
// plus the project's anon key as Authorization (so the default JWT check passes).
// Secrets: INGEST_SECRET (you create it). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Constant-time string comparison. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const KINDS = new Set(['orb', 'hot_snapshot', 'heartbeat'])

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  const secret = Deno.env.get('INGEST_SECRET')
  if (!secret || secret.length < 24) return json({ error: 'INGEST_SECRET is not set (min 24 chars)' }, 500)
  if (!safeEqual(req.headers.get('x-ingest-secret') ?? '', secret)) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => null)
  const rows = Array.isArray(body?.rows) ? body.rows : null
  if (!rows || rows.length === 0 || rows.length > 200) return json({ error: 'Expected 1-200 rows' }, 400)

  const clean = []
  for (const r of rows) {
    const kind = String(r?.kind ?? '')
    const day = String(r?.trading_day ?? '')
    const symbol = r?.symbol == null ? null : String(r.symbol).toUpperCase()
    if (!KINDS.has(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'Invalid row' }, 400)
    if (symbol != null && !/^[A-Z0-9.\- ]{1,12}$/.test(symbol)) return json({ error: 'Invalid symbol' }, 400)
    const payload = r?.payload ?? {}
    if (JSON.stringify(payload).length > 50_000) return json({ error: 'Payload too large' }, 400)
    clean.push({ kind, trading_day: day, symbol, payload })
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

  // ORB rows upsert on (kind, trading_day, symbol); everything else is appended.
  const orb = clean.filter(r => r.kind === 'orb')
  const rest = clean.filter(r => r.kind !== 'orb')
  for (const [list, prefer, qs] of [
    [orb, 'resolution=merge-duplicates,return=minimal', '?on_conflict=kind,trading_day,symbol'],
    [rest, 'return=minimal', ''],
  ] as const) {
    if (list.length === 0) continue
    const r = await fetch(`${url}/rest/v1/market_signals${qs}`, { method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(list) })
    if (!r.ok) return json({ error: `DB ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502)
  }

  // Keep the table small: drop snapshots and heartbeats older than 3 days.
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
  await fetch(`${url}/rest/v1/market_signals?kind=in.(hot_snapshot,heartbeat)&trading_day=lt.${cutoff}`, { method: 'DELETE', headers }).catch(() => {})

  return json({ ok: true, inserted: clean.length })
})
