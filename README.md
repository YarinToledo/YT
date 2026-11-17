# TradePilot

Personal trading journal and risk planner. Trades are entered manually; there is no broker or market-data connection.

```
apps/web     Vite + React + TypeScript (deploy to Vercel)
supabase/    SQL migrations (Postgres + Auth + RLS)
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

## Deploy to Vercel

Import the repo in Vercel, set **Root Directory** to `apps/web`, framework preset Vite, and add the
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` environment variables. `vercel.json` handles SPA routing.
