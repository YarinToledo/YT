# IBKR worker (cloud)

Runs IB Gateway (paper account, read-only API) plus `worker.py` on a small Linux server. During US market hours it pushes
Opening Range Breakout signals and a hot-stocks snapshot to Supabase; the app shows them on **Hot Stocks → Live from IBKR**.
It never places orders.

## One-time setup

1. **Supabase**
   - SQL Editor → run `supabase/migrations/20261120000000_market_signals.sql`.
   - Edge Functions → Secrets → add `INGEST_SECRET` (generate: `openssl rand -hex 32`).
   - Edge Functions → Deploy a new function → Via Editor, name `ingest`, paste `supabase/functions/ingest/index.ts`.
2. **IBKR (Client Portal on the web)**
   - Settings → Paper Trading Account → enable sharing real-time market data with the paper account.
   - Make sure the live account has US stock market data subscriptions (scanners and historical bars need them).
3. **Server** (Ubuntu 24.04, 2 GB RAM, e.g. Hetzner / DigitalOcean):
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/YarinToledo/YT.git && cd YT/worker/ibkr
   cp .env.example .env && nano .env      # paper login, Supabase URL + anon key, INGEST_SECRET
   chmod 600 .env
   docker compose up -d --build
   docker compose logs -f worker          # expect "connected to IB Gateway" and "pushed 1 rows (heartbeat)"
   ```

## Schedule (New York time)

| When | What |
|---|---|
| every 15 min | heartbeat (shows online/offline in the app) |
| 9:36 | ORB scan: IBKR scanners → 15 days of 5-min bars per candidate → top 20 long signals |
| 9:50–16:05, every 10 min | hot-stocks snapshot + status of today's ORB signals |

Tests for the ORB logic: `python3 -m unittest test_orb`.
