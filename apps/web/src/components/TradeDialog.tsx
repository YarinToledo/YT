import { useCallback, useState, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import Modal from './Modal'
import { useStore } from '../lib/store'
import type { Trade, TradeInput } from '../lib/types'
import { normalizeSymbol, parseNum, validateTrade } from '../lib/validate'
import { money, signedMoney, toLocalInput, tone } from '../lib/format'
import { tradePnl } from '../lib/calc'

export type DialogMode = 'open' | 'close' | 'edit'

const fromInput = (s: string) => (s ? new Date(s).toISOString() : null)
const toInput = (iso: string | null) => (iso ? toLocalInput(new Date(iso)) : '')

function strip(t: Trade): TradeInput {
  const { id: _id, created_at: _c, ...rest } = t
  return rest
}

function Dialog({ trade, mode, onClose }: { trade: Trade; mode: DialogMode; onClose(): void }) {
  const { updateTrade } = useStore()
  const t = useT()
  const now = toLocalInput(new Date())
  const [f, setF] = useState({
    symbol: trade.symbol,
    company: trade.company ?? '',
    direction: trade.direction,
    entry: String(trade.entry_price),
    stop: String(trade.stop_loss),
    target: trade.take_profit == null ? '' : String(trade.take_profit),
    quantity: String(trade.quantity),
    exit: trade.exit_price == null ? '' : String(trade.exit_price),
    best: trade.best_price == null ? '' : String(trade.best_price),
    eod: trade.eod_price == null ? '' : String(trade.eod_price),
    fees: String(trade.fees ?? 0),
    opened: mode === 'open' ? now : toInput(trade.opened_at),
    closed: mode === 'close' ? now : toInput(trade.closed_at),
    setup: trade.setup ?? '',
    notes: trade.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const status = mode === 'open' ? 'OPEN' : mode === 'close' ? 'CLOSED' : trade.status
  const next: TradeInput = {
    ...strip(trade),
    symbol: normalizeSymbol(f.symbol),
    company: f.company.trim() || null,
    direction: f.direction,
    status,
    entry_price: parseNum(f.entry) ?? NaN,
    stop_loss: parseNum(f.stop) ?? NaN,
    take_profit: parseNum(f.target),
    quantity: parseNum(f.quantity) ?? NaN,
    exit_price: status === 'CLOSED' ? parseNum(f.exit) : null,
    best_price: status === 'CLOSED' ? parseNum(f.best) : trade.best_price ?? null,
    eod_price: status === 'CLOSED' ? parseNum(f.eod) : trade.eod_price ?? null,
    fees: parseNum(f.fees) ?? 0,
    // If the user kept the prefilled "now", store the precise timestamp instead of the minute-rounded one.
    opened_at: status === 'OPEN' || status === 'CLOSED' ? (mode === 'open' && f.opened === now ? new Date().toISOString() : f.opened === toInput(trade.opened_at) ? trade.opened_at : fromInput(f.opened)) : null,
    closed_at: status === 'CLOSED' ? (mode === 'close' && f.closed === now ? new Date().toISOString() : f.closed === toInput(trade.closed_at) ? trade.closed_at : fromInput(f.closed)) : null,
    setup: f.setup.trim() || null,
    notes: f.notes.trim() || null,
  }
  const preview = status === 'CLOSED' && next.exit_price ? tradePnl({ ...trade, ...next }) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const err = validateTrade(next)
    if (err) return setError(t(err))
    setBusy(true)
    try { await updateTrade(trade.id, next); onClose() } catch (x) { setError((x as Error).message) } finally { setBusy(false) }
  }

  const title = t(mode === 'open' ? 'Open {s}' : mode === 'close' ? 'Close {s}' : 'Edit {s}', { s: trade.symbol })
  const subtitle = t(mode === 'open' ? 'Record your actual fill.' : mode === 'close' ? 'Record the exit to realize P&L.' : 'Correct any detail of this trade.')
  const showCore = mode !== 'close'
  const showOpened = mode === 'open' || (mode === 'edit' && (status === 'OPEN' || status === 'CLOSED'))
  const showClose = mode === 'close' || (mode === 'edit' && status === 'CLOSED')

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        {mode === 'edit' && <>
          <div className="field"><label>{t('Symbol')}</label><input value={f.symbol} onChange={set('symbol')} maxLength={12} /></div>
          <div className="field"><label>{t('Company')}</label><input value={f.company} onChange={set('company')} /></div>
          <div className="field"><label>{t('Direction')}</label><select value={f.direction} onChange={set('direction')}><option value="LONG">{t('LONG')}</option><option value="SHORT">{t('SHORT')}</option></select></div>
        </>}
        {showCore && <>
          <div className="field"><label>{t(mode === 'open' ? 'Fill price ($)' : 'Entry ($)')}</label><input type="number" inputMode="decimal" step="any" value={f.entry} onChange={set('entry')} /></div>
          <div className="field"><label>{t('Quantity')}</label><input type="number" inputMode="decimal" step="any" value={f.quantity} onChange={set('quantity')} /></div>
          <div className="field"><label>{t('Stop loss ($)')}</label><input type="number" inputMode="decimal" step="any" value={f.stop} onChange={set('stop')} /></div>
          <div className="field"><label>{t('Target ($)')}</label><input type="number" inputMode="decimal" step="any" value={f.target} onChange={set('target')} /></div>
        </>}
        {showOpened && <div className="field"><label>{t('Opened at')}</label><input type="datetime-local" value={f.opened} onChange={set('opened')} /></div>}
        {showClose && <>
          <div className="field"><label>{t('Exit price ($)')}</label><input type="number" inputMode="decimal" step="any" value={f.exit} onChange={set('exit')} autoFocus={mode === 'close'} /></div>
          <div className="field"><label>{t('Closed at')}</label><input type="datetime-local" value={f.closed} onChange={set('closed')} /></div>
          <div className="field"><label>{t('Fees ($)')}</label><input type="number" inputMode="decimal" step="any" min="0" value={f.fees} onChange={set('fees')} /></div>
          <div className="field"><label>{t(f.direction === 'SHORT' ? 'Lowest price reached ($)' : 'Highest price reached ($)')}</label><input type="number" inputMode="decimal" step="any" min="0" value={f.best} onChange={set('best')} placeholder={t('Optional')} /><div className="hint">{t('Best point after entry, even if you were later stopped out')}</div></div>
          <div className="field"><label>{t('End-of-day price ($)')}</label><input type="number" inputMode="decimal" step="any" min="0" value={f.eod} onChange={set('eod')} placeholder={t('Optional')} /><div className="hint">{t('If you were stopped out, enter the stop price')}</div></div>
        </>}
        {mode === 'edit' && <div className="field"><label>{t('Setup')}</label><input value={f.setup} onChange={set('setup')} placeholder={t('Breakout, pullback…')} /></div>}
        <div className="field full"><label>{t('Notes')}</label><textarea value={f.notes} onChange={set('notes')} placeholder={mode === 'close' ? t('What went right or wrong?') : ''} /></div>
        {preview != null && (
          <div className="form-result"><span>{t('Entry {v} × {q}', { v: money(trade.entry_price), q: trade.quantity })}</span><span>{t('Realized P&L')} <b className={tone(preview)}>{signedMoney(preview)}</b></span></div>
        )}
        {error && <div className="form-result error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn" disabled={busy}>{t(busy ? 'Saving…' : mode === 'open' ? 'Open position' : mode === 'close' ? 'Close trade' : 'Save changes')}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Returns [dialog element, opener]. */
export function useTradeDialog(): [ReactNode, (t: Trade, m: DialogMode) => void] {
  const [state, setState] = useState<{ trade: Trade; mode: DialogMode } | null>(null)
  const close = useCallback(() => setState(null), [])
  const el = state ? <Dialog key={state.trade.id + state.mode} trade={state.trade} mode={state.mode} onClose={close} /> : null
  return [el, (trade, mode) => setState({ trade, mode })]
}
