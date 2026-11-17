import type { TradeInput } from './types'

/** Mirrors the CHECK constraints in the database so errors show up before saving. */
export function validateTrade(t: TradeInput): string | null {
  if (!/^[A-Z0-9.\-]{1,12}$/.test(t.symbol)) return 'Symbol must be 1–12 letters, digits, dots or dashes.'
  if (!(t.entry_price > 0)) return 'Entry price must be positive.'
  if (!(t.stop_loss > 0)) return 'Stop loss must be positive.'
  if (!(t.quantity > 0)) return 'Quantity must be positive.'
  if (t.fees < 0) return 'Fees cannot be negative.'
  if (t.direction === 'LONG' && t.stop_loss >= t.entry_price) return 'For a LONG, the stop must be below entry.'
  if (t.direction === 'SHORT' && t.stop_loss <= t.entry_price) return 'For a SHORT, the stop must be above entry.'
  if (t.take_profit != null) {
    if (!(t.take_profit > 0)) return 'Target must be positive.'
    if (t.direction === 'LONG' && t.take_profit <= t.entry_price) return 'For a LONG, the target must be above entry.'
    if (t.direction === 'SHORT' && t.take_profit >= t.entry_price) return 'For a SHORT, the target must be below entry.'
  }
  if (t.status === 'OPEN' && !t.opened_at) return 'An open trade needs an open time.'
  if (t.status === 'CLOSED') {
    if (!(t.exit_price != null && t.exit_price > 0)) return 'Enter the exit price.'
    if (!t.closed_at || !t.opened_at) return 'A closed trade needs open and close times.'
    if (new Date(t.closed_at) < new Date(t.opened_at)) return 'Close time is before open time.'
  }
  return null
}

export const parseNum = (s: string): number | null => {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export const normalizeSymbol = (s: string) => s.trim().toUpperCase()
