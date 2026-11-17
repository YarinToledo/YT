import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { normalizeSymbol } from '../lib/validate'
import { shortDate } from '../lib/format'

export default function MarketWatch() {
  const { watchlist, trades, addWatch, removeWatch } = useStore()
  const [symbol, setSymbol] = useState('')
  const [company, setCompany] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const s = normalizeSymbol(symbol)
    if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) return setErr('Enter a valid symbol.')
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
          <div><div className="card-title">Watchlist</div><div className="subtle">No market data provider connected · prices are not shown</div></div>
        </div>
        {watchlist.length === 0 ? (
          <div className="empty" style={{ marginTop: 18 }}>Your watchlist is empty.</div>
        ) : (
          <div className="table-scroll" style={{ marginTop: 18 }}>
            <table>
              <thead><tr><th>Instrument</th><th>Note</th><th>Trades</th><th>Added</th><th className="num">Actions</th></tr></thead>
              <tbody>
                {watchlist.map(w => {
                  const n = trades.filter(t => t.symbol === w.symbol).length
                  return (
                    <tr key={w.symbol}>
                      <td><span className="ticker">{w.symbol}</span>{w.company && <span className="company">{w.company}</span>}</td>
                      <td style={{ whiteSpace: 'normal', minWidth: 180 }}>{w.note ?? '—'}</td>
                      <td>{n || '—'}</td>
                      <td>{shortDate(w.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <Link className="btn sm" style={{ textDecoration: 'none' }} to={`/?symbol=${encodeURIComponent(w.symbol)}`}>Plan trade</Link>
                          <button className="btn sm danger" onClick={() => removeWatch(w.symbol).catch(() => {})}>Remove</button>
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
        <div className="card-head"><div className="card-title">Add to watchlist</div></div>
        <form className="trade-form" onSubmit={add}>
          <div className="field"><label>Symbol</label><input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} maxLength={12} placeholder="AMZN" autoCapitalize="characters" /></div>
          <div className="field"><label>Company</label><input value={company} onChange={e => setCompany(e.target.value)} placeholder="Optional" /></div>
          <div className="field"><label>Note</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="What are you waiting for?" /></div>
          {err && <div className="form-result error">{err}</div>}
          <div className="form-actions"><button className="btn">Add symbol</button></div>
        </form>
      </article>
    </div>
  )
}
