# TradePilot

Personal trading journal and risk planner. Trades are entered manually; there is no broker or market-data connection.

```
apps/web     Vite + React + TypeScript (deploy to Vercel)
supabase/    SQL migrations (Postgres + Auth + RLS) and Edge Functions
worker/ibkr  IB Gateway + Python worker for live signals (cloud server)
design/      original HTML prototype
```

## Features

- **Overview**: equity, realized P&L, win rate, open positions, 30-day equity curve, live risk usage, activity feed
- **Trade planner**: sizes a position from entry/stop/target using `risk % × current equity`, always rounding down so risk never exceeds budget; warns below your minimum R:R
- **Risk enforcement**: opening a position is blocked when max open positions, the daily loss limit, or the weekly loss limit (week starts Monday) is reached
- **Lifecycle**: planned → open (record fill) → closed (record exit, fees, notes) or cancelled
- **Trade journal**: filter, search, edit, delete, CSV export
- **Analytics**: profit factor, expectancy, average R, breakdowns by symbol, setup and direction
- **Market watch**: watchlist with notes and a "plan trade" shortcut
- **Settings**: starting capital, fractional shares, risk limits

## Run locally

```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for sizing / P&L / risk math
```

With no Supabase keys the app runs in **demo mode**: sample data stored in your browser's localStorage.

## Connect Supabase

1. Create a project at supabase.com (free tier is fine).
2. SQL Editor → paste and run `supabase/migrations/20261117000000_init.sql`
   (or `supabase db push` if you use the Supabase CLI).
3. Authentication → Users → **Add user** with your email and password.
   Then Authentication → Providers → Email → turn off "Allow new users to sign up" so nobody else can register.
4. Copy `apps/web/.env.example` to `apps/web/.env` and fill in Settings → API → Project URL and anon key.
5. Restart `npm run dev` and sign in.

## Stock analysis (Financial Modeling Prep)

The **Stock Analysis** page calls the `market-data` Edge Function, which proxies Financial Modeling Prep so the key stays server-side.

1. Get a free key at financialmodelingprep.com.
2. Supabase → Edge Functions → Secrets → add `FMP_API_KEY`.
3. Deploy `supabase/functions/market-data/index.ts` (Dashboard → Edge Functions → Deploy a new function → Via Editor, name `market-data`),
   or `npx supabase functions deploy market-data --project-ref <ref>`.

The **AI analyst** on that page uses the same function with a second secret, `ANTHROPIC_API_KEY` (console.anthropic.com).
It sends Claude the computed data plus your risk settings; Claude adds web search for news and returns a recommendation
and a trade plan. Each run costs a few cents.

Indicators (SMA, RSI, MACD, ATR, support/resistance) are computed in the browser in `apps/web/src/lib/indicators.ts`.

## Hot stocks

The **Hot Stocks** page runs a momentum-swing "stocks in play" screen on end-of-day data: FMP biggest gainers + most active
+ your watchlist, filtered in the browser (`apps/web/src/lib/hotstocks.ts`) for unusual volume, a strong close and an uptrend.
Each pass gets a buy-stop / stop / target plan at your R:R and risk %. "Rank with AI" asks Claude to check the news behind each
move and rank them. A scan costs about 2 + N FMP requests (N ≤ 30); the free plan allows 250 a day.

## Live data from Interactive Brokers

`worker/ibkr/` runs IB Gateway (paper account, read-only) and a Python worker on a cloud server. It pushes Opening Range
Breakout signals and a hot-stocks snapshot through the `ingest` Edge Function into `market_signals`, shown live on the
Hot Stocks page. Setup: `worker/ibkr/README.md`.

## Deploy to Vercel

Import the repo in Vercel, set **Root Directory** to `apps/web`, framework preset Vite, and add the
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` environment variables. `vercel.json` handles SPA routing.

## Six-specialist research desk

Open **Research Desk** (`/agents`) for six explicit workflows: the existing momentum screener,
daily/weekly technical analysis, the existing on-demand AI/news review, strategy backtesting,
portfolio stress, and a review of the last 20 dated closed trades. `tool` and `s` URL parameters
retain the selected workflow and symbol. Hebrew/English, RTL, keyboard navigation and narrow screens
are supported. AI requests still require an explicit button press.

The desk reuses the existing `market-data` function and account store. No new secrets, database
migrations, model service, or backend deployment are required. Existing FMP/Anthropic/Supabase
configuration is still needed for market data and AI; the demo displays that limitation honestly.
Portfolio and journal tools operate on whatever account is currently loaded, including labelled demo data.

`apps/web/src/lib/desk.ts` contains the auditable calculations:

- Weekly candles aggregate provider OHLCV; the current New York calendar week is excluded conservatively,
  even after Friday's close. At least 30 prior weekly candles are required for the weekly indicator card;
  indicators with longer warmups remain blank.
- Backtesting supports a configurable SMA crossover and a prior-high breakout. Signals use the previous
  bar and fill at the next open. One long position, cash-capped sizing, both-sided fees/slippage, gap-stop
  fills at the open, stop-first treatment of ambiguous OHLC bars, and final sample liquidation are explicit.
  The current New York market date is excluded. Selected sample dates include the indicator warmup;
  result dates start after warmup. Buy-and-hold uses matching test dates and costs with fractional shares.
  Drawdown is end-of-day mark-to-market, not intraday drawdown. Results are in-sample; provider corporate-action
  adjustments are not independently verified. No automatic parameter optimization or claims of an edge.
- The 20% portfolio shock uses recorded entry costs and realized equity; it is not live valuation,
  a correlation estimate, or a maximum-loss guarantee. It assumes no stop execution or rebalancing.
- Journal observations count missing setup labels/targets, planned ratios below the current minimum,
  and net losses beyond 1.05R. These do not establish emotional behavior or historical rule violations.
  Incomplete outcome records are excluded and counted. Nothing modifies existing trades.

Validation: `cd apps/web && npm test && npm run build`. Domain tests cover signal timing, future-data
independence, ambiguous candles, gap losses, cost/cash limits, weekly boundaries, stress netting and journal selection.
