import { money, ratio } from '../lib/format'
import { useT } from '../lib/i18n'
import { plannedRR } from '../lib/calc'
import { useStore } from '../lib/store'

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div className="progress"><i className={value >= max && max > 0 ? 'over' : ''} style={{ width: `${w}%` }} /></div>
}

export default function RiskPanel() {
  const { settings: s, usage: u, trades } = useStore()
  const t = useT()
  const active = trades.filter(x => x.status === 'OPEN' || x.status === 'PLANNED')
  const rrs = active.map(plannedRR).filter((r): r is number => r != null)
  const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null

  const locked = u.dailyLocked || u.weeklyLocked
  return (
    <article className="card">
      <div className="card-head"><div className="card-title">{t('Risk Control')}</div><span className="subtle">{t('Live usage')}</span></div>
      <div className="risk-list">
        <div>
          <div className="risk-row"><span>{t('Open risk · {a}/{b} positions', { a: u.openCount, b: s.max_open_positions })}</span><b>{money(u.openRisk)} / {money(u.riskPerTrade * s.max_open_positions)}</b></div>
          <Bar value={u.openRisk} max={u.riskPerTrade * s.max_open_positions} />
        </div>
        <div>
          <div className="risk-row"><span>{t('Daily loss · limit {v}%', { v: s.daily_loss_limit_pct })}</span><b>{money(u.dailyLoss)} / {money(u.dailyLimit)}</b></div>
          <Bar value={u.dailyLoss} max={u.dailyLimit} />
        </div>
        <div>
          <div className="risk-row"><span>{t('Weekly loss · limit {v}%', { v: s.weekly_loss_limit_pct })}</span><b>{money(u.weeklyLoss)} / {money(u.weeklyLimit)}</b></div>
          <Bar value={u.weeklyLoss} max={u.weeklyLimit} />
        </div>
        <div>
          <div className="risk-row"><span>{t('Avg planned R:R · minimum {v}', { v: ratio(s.min_reward_risk) })}</span><b className={avgRR != null && avgRR < s.min_reward_risk ? 'warn' : ''}>{ratio(avgRR)}</b></div>
          <div className="progress"><i style={{ width: `${avgRR == null ? 0 : Math.min(100, (avgRR / s.min_reward_risk) * 100)}%` }} /></div>
        </div>
      </div>
      {locked ? (
        <div className="risk-note danger">
          {u.weeklyLocked
            ? t('Weekly loss limit reached. Opening new positions is blocked until the week resets.')
            : t('Daily loss limit reached. Opening new positions is blocked until the day resets.')}
        </div>
      ) : (
        <div className="risk-note">{t('Risk per trade: {p}% of equity = {v}. Limits are enforced when you open positions in TradePilot.', { p: s.risk_per_trade_pct, v: money(u.riskPerTrade) })}</div>
      )}
    </article>
  )
}
