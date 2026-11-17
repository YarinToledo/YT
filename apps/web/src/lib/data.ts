import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS, type AccountSettings, type Trade, type TradeInput, type WatchItem } from './types'

export interface DataApi {
  getSettings(): Promise<AccountSettings>
  saveSettings(s: AccountSettings): Promise<AccountSettings>
  listTrades(): Promise<Trade[]>
  createTrade(t: TradeInput): Promise<Trade>
  updateTrade(id: string, patch: Partial<TradeInput>): Promise<Trade>
  deleteTrade(id: string): Promise<void>
  listWatchlist(): Promise<WatchItem[]>
  addWatch(item: Omit<WatchItem, 'created_at'>): Promise<WatchItem>
  removeWatch(symbol: string): Promise<void>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isDemo = !url || !anonKey
export const supabase: SupabaseClient | null = isDemo ? null : createClient(url!, anonKey!)

// ---------------------------------------------------------------------------
// Normalizers: PostgREST returns numeric columns as strings.
// ---------------------------------------------------------------------------
const num = (v: unknown) => (v == null ? null : Number(v))

function toTrade(r: Record<string, unknown>): Trade {
  return {
    id: r.id as string,
    symbol: r.symbol as string,
    company: (r.company as string) ?? null,
    direction: r.direction as Trade['direction'],
    status: r.status as Trade['status'],
    entry_price: Number(r.entry_price),
    stop_loss: Number(r.stop_loss),
    take_profit: num(r.take_profit),
    quantity: Number(r.quantity),
    exit_price: num(r.exit_price),
    fees: Number(r.fees ?? 0),
    opened_at: (r.opened_at as string) ?? null,
    closed_at: (r.closed_at as string) ?? null,
    setup: (r.setup as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
  }
}

function toSettings(r: Record<string, unknown>): AccountSettings {
  return {
    starting_capital: Number(r.starting_capital),
    risk_per_trade_pct: Number(r.risk_per_trade_pct),
    daily_loss_limit_pct: Number(r.daily_loss_limit_pct),
    weekly_loss_limit_pct: Number(r.weekly_loss_limit_pct),
    min_reward_risk: Number(r.min_reward_risk),
    max_open_positions: Number(r.max_open_positions),
    fractional_shares: Boolean(r.fractional_shares),
  }
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  if (res.data == null) throw new Error('No data returned')
  return res.data
}

function supabaseApi(sb: SupabaseClient): DataApi {
  return {
    async getSettings() {
      const res = await sb.from('account_settings').select('*').maybeSingle()
      if (res.error) throw new Error(res.error.message)
      if (res.data) return toSettings(res.data)
      // Trigger normally creates this; fall back for users created before the migration.
      return toSettings(check(await sb.from('account_settings').insert({}).select().single()))
    },
    async saveSettings(s) {
      const { data: auth } = await sb.auth.getUser()
      return toSettings(check(await sb.from('account_settings').upsert({ ...s, user_id: auth.user?.id }).select().single()))
    },
    async listTrades() {
      return check(await sb.from('trades').select('*').order('created_at', { ascending: false })).map(toTrade)
    },
    async createTrade(t) {
      return toTrade(check(await sb.from('trades').insert(t).select().single()))
    },
    async updateTrade(id, patch) {
      return toTrade(check(await sb.from('trades').update(patch).eq('id', id).select().single()))
    },
    async deleteTrade(id) {
      const { error } = await sb.from('trades').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    async listWatchlist() {
      return check(await sb.from('watchlist').select('symbol,company,note,created_at').order('created_at')) as WatchItem[]
    },
    async addWatch(item) {
      return check(await sb.from('watchlist').upsert(item).select('symbol,company,note,created_at').single()) as WatchItem
    },
    async removeWatch(symbol) {
      const { error } = await sb.from('watchlist').delete().eq('symbol', symbol)
      if (error) throw new Error(error.message)
    },
  }
}

// ---------------------------------------------------------------------------
// Demo mode: same API, stored in localStorage, seeded with sample trades.
// ---------------------------------------------------------------------------
interface DemoState { settings: AccountSettings; trades: Trade[]; watchlist: WatchItem[] }
const KEY = 'tradepilot-demo-v1'

function daysAgo(n: number, hour = 15) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 30, 0, 0)
  return d.toISOString()
}

function demoSeed(): DemoState {
  const closed = (id: string, symbol: string, company: string, direction: Trade['direction'], entry: number, stop: number, target: number, qty: number, exit: number, day: number, setup: string): Trade => ({
    id, symbol, company, direction, status: 'CLOSED', entry_price: entry, stop_loss: stop, take_profit: target,
    quantity: qty, exit_price: exit, fees: 0, opened_at: daysAgo(day + 1, 16), closed_at: daysAgo(day, 19),
    setup, notes: null, created_at: daysAgo(day + 2),
  })
  return {
    settings: { ...DEFAULT_SETTINGS },
    trades: [
      { id: 'd-nvda', symbol: 'NVDA', company: 'NVIDIA Corporation', direction: 'LONG', status: 'PLANNED', entry_price: 145, stop_loss: 141, take_profit: 157, quantity: 3.75, exit_price: null, fees: 0, opened_at: null, closed_at: null, setup: 'Breakout', notes: 'Wait for close above resistance.', created_at: daysAgo(0, 9) },
      { id: 'd-pltr', symbol: 'PLTR', company: 'Palantir Technologies', direction: 'LONG', status: 'OPEN', entry_price: 62, stop_loss: 59.5, take_profit: 69.5, quantity: 6, exit_price: null, fees: 0, opened_at: daysAgo(1, 16), closed_at: null, setup: 'Pullback', notes: null, created_at: daysAgo(2) },
      closed('d-1', 'AAPL', 'Apple Inc.', 'LONG', 225, 221, 237, 3.75, 236.4, 4, 'Pullback'),
      closed('d-2', 'TSLA', 'Tesla, Inc.', 'SHORT', 340, 348, 316, 1.85, 348, 9, 'Failed breakout'),
      closed('d-3', 'MSFT', 'Microsoft Corporation', 'LONG', 415, 409, 433, 2.5, 432, 14, 'Breakout'),
      closed('d-4', 'AMD', 'Advanced Micro Devices', 'LONG', 150, 146, 162, 3.7, 146, 19, 'Breakout'),
      closed('d-5', 'META', 'Meta Platforms', 'LONG', 580, 572, 604, 1.9, 598, 24, 'Pullback'),
    ],
    watchlist: [
      { symbol: 'NVDA', company: 'NVIDIA Corporation', note: 'Earnings next week', created_at: daysAgo(5) },
      { symbol: 'PLTR', company: 'Palantir Technologies', note: null, created_at: daysAgo(5) },
      { symbol: 'AMZN', company: 'Amazon.com', note: 'Watching 200-day MA', created_at: daysAgo(3) },
    ],
  }
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage unavailable */ }
  return demoSeed()
}

function demoApi(): DataApi {
  let state = load()
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ } }
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
  return {
    async getSettings() { return clone(state.settings) },
    async saveSettings(s) { state.settings = { ...s }; save(); return clone(s) },
    async listTrades() { return clone([...state.trades].sort((a, b) => b.created_at.localeCompare(a.created_at))) },
    async createTrade(t) {
      const trade: Trade = { ...t, id: crypto.randomUUID(), created_at: new Date().toISOString() }
      state.trades.push(trade); save(); return clone(trade)
    },
    async updateTrade(id, patch) {
      const i = state.trades.findIndex(t => t.id === id)
      if (i < 0) throw new Error('Trade not found')
      state.trades[i] = { ...state.trades[i], ...patch }; save(); return clone(state.trades[i])
    },
    async deleteTrade(id) { state.trades = state.trades.filter(t => t.id !== id); save() },
    async listWatchlist() { return clone(state.watchlist) },
    async addWatch(item) {
      const w = { ...item, created_at: new Date().toISOString() }
      state.watchlist = [...state.watchlist.filter(x => x.symbol !== item.symbol), w]; save(); return clone(w)
    },
    async removeWatch(symbol) { state.watchlist = state.watchlist.filter(w => w.symbol !== symbol); save() },
  }
}

export function resetDemo() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export const api: DataApi = supabase ? supabaseApi(supabase) : demoApi()
