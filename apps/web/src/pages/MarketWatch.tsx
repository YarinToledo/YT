import { useCallback, useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { normalizeSymbol } from '../lib/validate'
import { money, shortDate, signedMoney, signedPct, tone } from '../lib/format'
import { fetchQuotes, type Quote } from '../lib/market'
import { isDemo } from '../lib/data'

export default function MarketWatch() {
  const { watchlist, trades, addWatch, removeWatch } = useStore()
  const t = useT()
  const [symbol, setSymbol] = useState('')
  const [company, setCompany] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [quoteState, setQuoteState] = useState<{ loading: boolean; error: string | null; at: Date | null }>({ loading: false, error: null, at: null })
  const symbolsKey = watchlist.map(w => w.symbol).join(',')

  // Prices load when the page opens and on demand (the free FMP plan allows 250 requests a day).
  const refresh = useCallback(async (force = false) => {
    if (isDemo || !symbolsKey) return
    setQuoteState(q => ({ ...q, loading: true, error: null }))
    try {
      setQuotes(await fetchQuotes(symbolsKey.split(','), force))
      setQuoteState({ loading: false, error: null, at: new Date() })
    } catch (e) {
      setQuoteState(q => ({ ...q, loading: false, error: (e as Error).message }))
    }
  }, [symbolsKey])
  useEffect(() => { refresh() }, [refresh])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const s = normalizeSymbol(symbol)
    if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) return setErr(t('Enter a valid symbol.'))
    setErr(null)
    try {
      await addWatch({ symbol: s, company: company.trim() || null, note: note.trim() || null })
      setSymbol(''); setCompany(''); setNote('')
    } catch { /* toast shown */ }
  }

  return (
    <div className="stack">
      <section className="card table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t('Watchlist')}</div>
            <div className="subtle">
              {isDemo ? t('Prices are not available in demo mode')
                : quoteState.error ? t('Could not load prices: {msg}', { msg: t(quoteState.error) })
                : quoteState.at ? t('Prices from Financial Modeling Prep · updated {d}', { d: quoteState.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
                : t('Loading prices…')}
            </div>
          </div>
          {!isDemo && watchlist.length > 0 && <button className="btn sm secondary" disabled={quoteState.loading} onClick={() => refresh(true)}>{quoteState.loading ? t('Refreshing…') : t('Refresh prices')}</button>}
        </div>
        {watchlist.length === 0 ? (
          <div className="empty" style={{ marginTop: 18 }}>{t('Your watchlist is empty.')}</div>
        ) : (
          <div className="table-scroll" style={{ marginTop: 18 }}>
            <table>
              <thead><tr><th>{t('Instrument')}</th><th className="num">{t('Price')}</th><th className="num">{t('Today')}</th><th>{t('Note')}</th><th>{t('Trades')}</th><th>{t('Added')}</th><th className="num">{t('Actions')}</th></tr></thead>
              <tbody>
                {watchlist.map(w => {
                  const n = trades.filter(x => x.symbol === w.symbol).length
                  return (
                    <tr key={w.symbol}>
                      <td><span className="ticker">{w.symbol}</span>{w.company && <span className="company">{w.company}</span>}</td>
                      <td className="num">{money(quotes[w.symbol]?.price)}</td>
                      <td className={`num ${tone(quotes[w.symbol]?.changePct ?? 0)}`}>
                        {quotes[w.symbol]?.changePct != null ? <>{signedPct(quotes[w.symbol].changePct! / 100)}{quotes[w.symbol].change != null && <span className="company">{signedMoney(quotes[w.symbol].change!)}</span>}</> : '—'}
                      </td>
                      <td style={{ whiteSpace: 'normal', minWidth: 180 }}>{w.note ?? '—'}</td>
                      <td>{n || '—'}</td>
                      <td>{shortDate(w.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <Link className="btn sm secondary" style={{ textDecoration: 'none' }} to={`/analyze?s=${encodeURIComponent(w.symbol)}`}>{t('Analyze')}</Link>
                          <Link className="btn sm" style={{ textDecoration: 'none' }} to={`/?symbol=${encodeURIComponent(w.symbol)}`}>{t('Plan trade')}</Link>
                          <button className="btn sm danger" onClick={() => removeWatch(w.symbol).catch(() => {})}>{t('Remove')}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <article className="card">
        <div className="card-head"><div className="card-title">{t('Add to watchlist')}</div></div>
        <form className="trade-form" onSubmit={add}>
          <div className="field"><label>{t('Symbol')}</label><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} maxLength={12} placeholder="AMZN" autoCapitalize="characters" /></div>
          <div className="field"><label>{t('Company')}</label><input value={company} onChange={e => setCompany(e.target.value)} placeholder={t('Optional')} /></div>
          <div className="field"><label>{t('Note')}</label><input value={note} onChange={e => setNote(e.target.value)} placeholder={t('What are you waiting for?')} /></div>
          {err && <div className="form-result error">{err}</div>}
          <div className="form-actions"><button className="btn">{t('Add symbol')}</button></div>
        </form>
      </article>
    </div>
  )
}
