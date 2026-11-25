import { useEffect, useMemo, useState } from 'react'
import { expectancyR, inRecommendedZone, journalR, nearestCell, LESSON_COSTS_R, TARGETS, WIN_RATES } from '../lib/expectancy'
import { money, pct, rMult } from '../lib/format'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { parseNum } from '../lib/validate'

const KEY = 'tradepilot-expectancy'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string> } catch { return {} } }

/** Expected R per trade by win rate × target (from the risk-management lesson), with your journal's cell marked. */
export default function ExpectancyCard() {
  const t = useT()
  const { trades, usage, settings } = useStore()
  const j = useMemo(() => journalR(trades), [trades])
  const saved = useMemo(load, [])

  // Size of 1R in dollars: what the trade planner uses (fixed $ if chosen there, else % of equity).
  const plannerR = (() => {
    try { if (localStorage.getItem('tradepilot-risk-unit') === 'usd') { const v = parseNum(localStorage.getItem('tradepilot-risk-usd') ?? ''); if (v && v > 0) return v } } catch { /* ignore */ }
    return Math.round((usage.equity * settings.risk_per_trade_pct) / 100)
  })()
  const [afterCosts, setAfterCosts] = useState(saved.afterCosts !== '0')
  const [costs, setCosts] = useState(saved.costs ?? String(LESSON_COSTS_R))
  const [perMonth, setPerMonth] = useState(saved.perMonth ?? '40')
  const [rUsd, setRUsd] = useState(saved.rUsd ?? (plannerR > 0 ? String(plannerR) : '10'))
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ afterCosts: afterCosts ? '1' : '0', costs, perMonth, rUsd })) } catch { /* private mode */ }
  }, [afterCosts, costs, perMonth, rUsd])

  const c = afterCosts ? Math.max(0, parseNum(costs) ?? 0) : 0
  const n = parseNum(perMonth), r = parseNum(rUsd)
  const mine = j.winRate != null && j.avgWinR != null ? nearestCell(j.winRate, j.avgWinR) : null
  const modelR = j.winRate != null && j.avgWinR != null ? expectancyR(j.winRate, j.avgWinR, c) : null
  const monthly = (e: number | null) => (e != null && n != null && n > 0 && r != null && r > 0 ? { r: e * n, usd: e * n * r } : null)
  const real = monthly(j.avgR)
  const lesson = monthly(expectancyR(0.5, 2, c))

  return (
    <section className="card">
      <div className="card-head" style={{ padding: 0 }}>
        <div>
          <div className="card-title">{t('Expectancy table')}</div>
          <div className="subtle">{t('Average R per trade by win rate and target. Losers count as −1R.')}</div>
        </div>
        <div className="tabs" role="group" aria-label={t('Costs')}>
          <button className={!afterCosts ? 'active' : ''} aria-pressed={!afterCosts} onClick={() => setAfterCosts(false)}>{t('Before costs')}</button>
          <button className={afterCosts ? 'active' : ''} aria-pressed={afterCosts} onClick={() => setAfterCosts(true)}>{t('After costs')}</button>
        </div>
      </div>

      <div className="table-scroll expectancy-scroll">
        <table className="expectancy">
          <thead>
            <tr><th>{t('Win rate ↓ · Target →')}</th>{TARGETS.map(x => <th key={x} className="num">{x}R</th>)}</tr>
          </thead>
          <tbody>
            {WIN_RATES.map(w => (
              <tr key={w}>
                <th scope="row">{Math.round(w * 100)}%</th>
                {TARGETS.map(x => {
                  const raw = expectancyR(w, x, c)
                  const e = Math.abs(raw) < 0.005 ? 0 : raw
                  const isMine = mine?.winRate === w && mine.target === x
                  const cls = [e > 0.005 ? 'pos' : e < -0.005 ? 'neg' : 'zero', inRecommendedZone(w, x) ? 'zone' : '', isMine ? 'mine' : ''].join(' ')
                  return <td key={x} className={`num ${cls}`} title={isMine ? t('Closest to your journal') : undefined}>{e > 0 ? '+' : ''}{e.toFixed(2)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="expectancy-legend subtle">
        <span><i className="sw zone" /> {t('Recommended zone: 50–60% success, 1.5R–2.5R target')}</span>
        {mine && <span><i className="sw mine" /> {t('Closest to your journal')}</span>}
      </div>

      <div className="form-grid" style={{ marginTop: 14 }}>
        {afterCosts && <div className="field"><label>{t('Fees + slippage per trade (R)')}</label><input type="number" inputMode="decimal" min="0" step="0.05" value={costs} onChange={e => setCosts(e.target.value)} /></div>}
        <div className="field"><label>{t('Trades per month')}</label><input type="number" inputMode="numeric" min="0" step="1" value={perMonth} onChange={e => setPerMonth(e.target.value)} /><div className="hint">{t('Last 30 days in your journal: {n}', { n: j.last30 })}</div></div>
        <div className="field"><label>{t('Size of 1R ($)')}</label><input type="number" inputMode="decimal" min="0" step="any" value={rUsd} onChange={e => setRUsd(e.target.value)} /><div className="hint">{t('From the trade planner: {v}', { v: money(plannerR) })}</div></div>
      </div>

      <div className="expectancy-summary">
        {j.trades === 0 ? (
          <p className="subtle">{t('No closed trades with a stop yet. Once your journal has some, your cell is marked in the table.')}</p>
        ) : (
          <>
            <p>
              {t('Your journal ({n} trades): win rate {w}, average win {aw}, average loss {al}.', { n: j.trades, w: pct(j.winRate, 0), aw: rMult(j.avgWinR), al: rMult(j.avgLossR) })}
            </p>
            <p>
              {t('Actual average per trade: {r}', { r: rMult(j.avgR) })}
              {real && <> · <b className={real.r >= 0 ? 'positive' : 'negative'}>{t('≈ {r} a month ({usd})', { r: rMult(real.r), usd: money(real.usd) })}</b></>}
            </p>
            {modelR != null && <p className="hint">{t('Table formula with your win rate and average win: {r} per trade. Journal results already include the fees you recorded.', { r: rMult(modelR) })}</p>}
            {j.trades < 30 && <p className="hint">{t('Fewer than 30 trades: the numbers can still change a lot.')}</p>}
          </>
        )}
        {lesson && <p className="hint">{t("The lesson's example, 50% success at 2R: {r} a month ({usd}).", { r: rMult(lesson.r), usd: money(lesson.usd) })}</p>}
        <p className="hint">{t('A projection from averages, not a forecast. Below 1.5R it is hard to stay profitable after costs.')}</p>
      </div>
    </section>
  )
}
