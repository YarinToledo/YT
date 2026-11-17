import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './data'
import { riskUsage, type RiskUsage } from './calc'
import { DEFAULT_SETTINGS, type AccountSettings, type Trade, type TradeInput, type WatchItem } from './types'

interface Store {
  loading: boolean
  error: string | null
  settings: AccountSettings
  trades: Trade[]
  watchlist: WatchItem[]
  usage: RiskUsage
  toast: string | null
  notify(msg: string): void
  saveSettings(s: AccountSettings): Promise<void>
  createTrade(t: TradeInput): Promise<void>
  updateTrade(id: string, patch: Partial<TradeInput>): Promise<void>
  deleteTrade(id: string): Promise<void>
  addWatch(item: Omit<WatchItem, 'created_at'>): Promise<void>
  removeWatch(symbol: string): Promise<void>
  reload(): Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AccountSettings>(DEFAULT_SETTINGS)
  const [trades, setTrades] = useState<Trade[]>([])
  const [watchlist, setWatchlist] = useState<WatchItem[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 3200)
  }, [])

  const reload = useCallback(async () => {
    try {
      const [s, t, w] = await Promise.all([api.getSettings(), api.listTrades(), api.listWatchlist()])
      setSettings(s); setTrades(t); setWatchlist(w); setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  /** Run a mutation, surface errors as a toast, and rethrow so forms can stay open. */
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      await reload()
      if (ok) notify(ok)
    } catch (e) {
      notify(`Error: ${(e as Error).message}`)
      throw e
    }
  }, [reload, notify])

  const value = useMemo<Store>(() => ({
    loading, error, settings, trades, watchlist, toast, notify, reload,
    usage: riskUsage(settings, trades),
    saveSettings: s => run(() => api.saveSettings(s), 'Settings saved'),
    createTrade: t => run(() => api.createTrade(t), t.status === 'OPEN' ? `${t.symbol} position opened` : `${t.symbol} saved as planned`),
    updateTrade: (id, p) => run(() => api.updateTrade(id, p), 'Trade updated'),
    deleteTrade: id => run(() => api.deleteTrade(id), 'Trade deleted'),
    addWatch: w => run(() => api.addWatch(w), `${w.symbol} added to watchlist`),
    removeWatch: s => run(() => api.removeWatch(s), `${s} removed`),
  }), [loading, error, settings, trades, watchlist, toast, notify, reload, run])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
