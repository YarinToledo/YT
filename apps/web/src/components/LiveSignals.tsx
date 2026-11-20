import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { planPosition } from '../lib/calc'
import { isDemo, supabase } from '../lib/data'
import { compact, money, qty, rMult, signedPct, times } from '../lib/format'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'

interface Row { id: number; kind: 'orb' | 'hot_snapshot' | 'heartbeat'; trading_day: string; symbol: string | null; payload: Record<string, any>; created_at: string }

const STATUS_CLS: Record<string, string> = { waiting: '', triggered: 'positive', stopped: 'negative' }

/** Live ORB signals and hot-stock snapshots pushed by the IBKR worker (worker/ibkr). Refreshes every minute. */
export default function LiveSignals() {
  const t = useT()
  const { settings, usage } = useStore()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rr = settings.min_reward_risk > 0 ? settings.min_reward_risk : 2

  const load = useCallback(async () => {
    if (isDemo || !supabase) return
    const since = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10)
    const { data, error } = await supabase.from('market_signals').select('*').gte('trading_day', since).order('created_at', { ascending: false }).limit(300)
    if (error) setError(error.message)
    else { setRows(data as Row[]); setError(null) }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  if (isDemo) return null

  const beat = rows?.find(r => r.kind === 'heartbeat')
  const beatAge = beat ? (Date.now() - new Date(beat.created_at).getTime()) / 60_000 : null
  const online = beat != null && beatAge! < 35 && beat.payload.connected
  const orbDay = rows?.find(r => r.kind === 'orb')?.trading_day
  const orb = (rows ?? []).filter(r => r.kind === 'orb' && r.trading_day === orbDay).sort((a, b) => (a.payload.rank ?? 99) - (b.payload.rank ?? 99))
  const snap = rows?.find(r => r.kind === 'hot_snapshot')
  const statusLabel: Record<string, string> = { waiting: t('Waiting for breakout'), triggered: t('Triggered'), stopped: t('Stopped out') }

  return (
    <article className="card table-card">
      <div className="card-head">
        <div>
          <div className="card-title">{t('Live from IBKR')}</div>
          <div className="subtle">
            <span className={`live-dot${online ? '' : ' demo'}`} />
            {beat == null ? t('Worker not connected yet. See the setup steps.')
              : online ? t('Worker online · last update {d}', { d: new Date(beat.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
              : t('Worker offline since {d}', { d: new Date(beat.created_at).toLocaleString() })}
          </div>
        </div>
        <button className="btn sm secondary" onClick={load}>{t('Refresh')}</button>
      </div>
      {error && <div className="risk-note danger" style={{ margin: '12px 20px' }}>{t(error)}</div>}

      <div className="ai-sub" style={{ padding: '0 20px' }}>{t('Opening Range Breakout · {d}', { d: orbDay ?? '—' })}</div>
      {orb.length === 0 ? (
        <div className="empty" style={{ marginTop: 8 }}>{t('No ORB signals yet today. They arrive at 16:36 Israel time (9:36 New York).')}</div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>#</th><th>{t('Instrument')}</th><th className="num">{t('Rel. volume')}</th><th className="num">{t('Entry (buy-stop)')}</th><th className="num">{t('Stop loss')}</th>
              <th className="num">{t('Target')}</th><th className="num">{t('Qty')}</th><th>{t('Status')}</th><th className="num">R</th><th className="num">{t('Actions')}</th>
            </tr></thead>
            <tbody>
              {orb.map(r => {
                const p = r.payload
                const target = p.entry != null && p.stop != null ? Math.round((p.entry + rr * (p.entry - p.stop)) * 100) / 100 : null
                const sized = target != null ? planPosition({ direction: 'LONG', entry: p.entry, stop: p.stop, target, equity: usage.equity, riskPct: settings.risk_per_trade_pct, fractional: settings.fractional_shares }) : null
                return (
                  <tr key={r.id}>
                    <td>{p.rank}</td>
                    <td><Link to={`/analyze?s=${r.symbol}`} className="ticker">{r.symbol}</Link></td>
                    <td className="num">{times(p.rel_volume)}</td>
                    <td className="num">{money(p.entry)}</td>
                    <td className="num negative">{money(p.stop)}</td>
                    <td className="num positive">{money(target)}</td>
                    <td className="num">{sized?.ok ? qty(sized.quantity) : '—'}</td>
                    <td className={STATUS_CLS[p.status] ?? ''}>{statusLabel[p.status] ?? p.status}</td>
                    <td className={`num ${p.r > 0 ? 'positive' : p.r < 0 ? 'negative' : ''}`}>{p.r == null ? '—' : rMult(p.r)}</td>
                    <td><div className="row-actions">
                      {target != null && <Link className="btn sm" style={{ textDecoration: 'none' }} to={`/?symbol=${r.symbol}&entry=${p.entry}&stop=${p.stop}&target=${target}`}>{t('Plan trade')}</Link>}
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="subtle" style={{ padding: '8px 20px 0' }}>{t('ORB rule: first 5-minute candle bullish, volume at least its 14-day norm, stop 10% of ATR under entry; the study exits at the close. Target shown at your ratio.')}</div>

      <div className="ai-sub" style={{ padding: '0 20px' }}>{t('Hot right now')}{snap && ` · ${new Date(snap.payload.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</div>
      {!snap || (snap.payload.items ?? []).length === 0 ? (
        <div className="empty" style={{ marginTop: 8, marginBottom: 16 }}>{t('No snapshot yet. Updates every 10 minutes during market hours.')}</div>
      ) : (
        <div className="table-scroll" style={{ marginBottom: 12 }}>
          <table>
            <thead><tr><th>{t('Instrument')}</th><th className="num">{t('Price')}</th><th className="num">{t('Today')}</th><th className="num">{t('Volume')}</th><th className="num">{t('Actions')}</th></tr></thead>
            <tbody>
              {snap.payload.items.map((x: any) => (
                <tr key={x.symbol}>
                  <td><span className="ticker">{x.symbol}</span></td>
                  <td className="num">{money(x.last)}</td>
                  <td className={`num ${x.change_pct > 0 ? 'positive' : x.change_pct < 0 ? 'negative' : ''}`}>{x.change_pct == null ? '—' : signedPct(x.change_pct / 100)}</td>
                  <td className="num">{compact(x.volume)}</td>
                  <td><div className="row-actions"><Link className="btn sm secondary" style={{ textDecoration: 'none' }} to={`/analyze?s=${x.symbol}`}>{t('Analyze')}</Link></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}
