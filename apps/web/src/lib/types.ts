export type Direction = 'LONG' | 'SHORT'
export type TradeStatus = 'PLANNED' | 'OPEN' | 'CLOSED' | 'CANCELLED'

export interface AccountSettings {
  starting_capital: number
  risk_per_trade_pct: number
  daily_loss_limit_pct: number
  weekly_loss_limit_pct: number
  min_reward_risk: number
  max_open_positions: number
  fractional_shares: boolean
}

export interface Trade {
  id: string
  symbol: string
  company: string | null
  direction: Direction
  status: TradeStatus
  entry_price: number
  stop_loss: number
  take_profit: number | null
  quantity: number
  exit_price: number | null
  /** Best price reached after entry before any stop-out (highest for LONG, lowest for SHORT). Optional. */
  best_price?: number | null
  /** End-of-day price while still in the trade; the stop price if stopped out. Optional. */
  eod_price?: number | null
  fees: number
  opened_at: string | null
  closed_at: string | null
  setup: string | null
  notes: string | null
  created_at: string
}

export type TradeInput = Omit<Trade, 'id' | 'created_at'>

export interface WatchItem {
  symbol: string
  company: string | null
  note: string | null
  created_at: string
}

export const DEFAULT_SETTINGS: AccountSettings = {
  starting_capital: 1000,
  risk_per_trade_pct: 1.5,
  daily_loss_limit_pct: 3,
  weekly_loss_limit_pct: 6,
  min_reward_risk: 3,
  max_open_positions: 2,
  fractional_shares: true,
}
