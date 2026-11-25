import { useMemo } from 'react'
import { monthlySummary, reachShare, type MonthRow } from '../lib/monthly'
import { pct, rMult, signedMoney, tone } from '../lib/format'
import { useLang, useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { useTargetR } from '../lib/targetR'

/** Per-month results: theoretical (fixed target) vs actual, and how far trades ran — from the trade-journal lesson. */
export default function MonthlySummary() {
  const t = useT()
  const { lang } = useLang()
  const { trades } = useStore()
  const [target, setTarget] = useTargetR()
  const { months, total } = useMemo(() => monthlySummary(trades, target), [trades, target])
  const reach = useMemo(() => reachShare(trades), [trades])
  const monthName = (k: string) => (k === 'total' ? t('Total') : new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' }).format(new Date(`${k}-15T12:00:00`)))

  const row = (m: MonthRow, isTotal = false) => (
    <tr key={m.key} className={isTotal ? 'total-row' : ''}>
      <td>{monthName(m.key)}</td>
      <td className="num">{m.trades}</td>
      <td className="num">{pct(m.winRate, 0)}</td>
      <td className={`num ${tone(m.avgTargetR ?? 0)}`}>{rMult(m.avgTargetR)}{m.targetN < m.trades && m.targetN > 0 ? <small className="subtle"> ({m.targetN})</small> : null}</td>
      <td className={`num ${tone(m.avgR ?? 0)}`}>{rMult(m.avgR)}</td>
      <td className={`num ${tone(m.avgPnl ?? 0)}`}>{m.avgPnl == null ? '—' : signedMoney(m.avgPnl)}</td>
      <td className={`num ${tone(m.sumTargetR)}`}>{m.targetN ? rMult(m.sumTargetR) : '—'}</td>
      <td className={`num ${tone(m.net)}`}>{signedMoney(m.net)}</td>
    </tr>
  )

  return (
    <section className="card table-card">
      <div className="card-head">
        <div>
          <div className="card-title">{t('Monthly summary')}</div>
          <div className="subtle">{t('Theoretical = a fixed target if the best price reached it, otherwise the end-of-day result.')}</div>
        </div>
        <label className="target-select">{t('Target')}
          <select value={target} onChange={e => setTarget(Number(e.target.value))}>{[1, 1.5, 2, 2.5, 3, 4].map(x => <option key={x} value={x}>{x}R</option>)}</select>
        </label>
      </div>
      {months.length === 0 ? <div className="empty" style={{ marginTop: 18 }}>{t('No closed trades yet.')}</div> : (
        <div className="table-scroll" style={{ marginTop: 18 }}>
          <table>
            <thead><tr>
              <th>{t('Month')}</th><th className="num">{t('Trades')}</th><th className="num">{t('Win rate')}</th>
              <th className="num">{t('Avg theoretical R')}</th><th className="num">{t('Avg actual R')}</th><th className="num">{t('Avg P&L per trade')}</th>
              <th className="num">{t('Theoretical total R')}</th><th className="num">{t('Actual net P&L')}</th>
            </tr></thead>
            <tbody>
              {months.map(m => row(m))}
              {months.length > 1 && row(total, true)}
            </tbody>
          </table>
        </div>
      )}
      <div className="reach">
        <div className="ai-sub">{t('How far trades went')}</div>
        {reach.n === 0 ? (
          <p className="subtle">{t('Record the highest price reached when closing a trade to see this.')}</p>
        ) : (
          <>
            <div className="reach-bars">
              {reach.shares.map(s => (
                <div key={s.level} className="reach-bar">
                  <span>≥{s.level}R</span>
                  <div className="bar"><i style={{ width: `${Math.round(s.share * 100)}%` }} /></div>
                  <b>{pct(s.share, 0)}</b>
                </div>
              ))}
            </div>
            <p className="hint">{t('Based on {n} trades with a best price. If many trades run past your target, a farther target may pay; if few reach it, a closer one may.', { n: reach.n })}</p>
          </>
        )}
        {total.targetN < total.trades && total.trades > 0 && (
          <p className="hint">{t('{n} of {m} closed trades have a best price recorded; the theoretical columns use only those.', { n: total.targetN, m: total.trades })}</p>
        )}
      </div>
    </section>
  )
}
