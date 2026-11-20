import type { Bar } from '../lib/indicators'
import { useT } from '../lib/i18n'

interface Plan { entry: number; stop: number; target: number }

/** Small daily candle chart (last ~3 months) with the trade plan's entry, stop and target lines. */
export default function MiniChart({ bars, plan, days = 60 }: { bars: Bar[]; plan?: Plan | null; days?: number }) {
  const t = useT()
  const data = bars.slice(-days)
  if (data.length < 2) return null
  const W = 600, H = 220, padR = 118, padY = 10
  const levels = plan ? [plan.entry, plan.stop, plan.target] : []
  const lo = Math.min(...data.map(b => b.low), ...levels)
  const hi = Math.max(...data.map(b => b.high), ...levels)
  const span = hi - lo || 1
  const y = (v: number) => padY + (1 - (v - lo) / span) * (H - 2 * padY)
  const step = (W - padR) / data.length
  const bw = Math.max(1.5, step * 0.62)

  const line = (v: number, cls: string, label: string) => (
    <g className={`mc-level ${cls}`}>
      <line x1={0} x2={W - padR} y1={y(v)} y2={y(v)} />
      <text x={W - padR + 6} y={y(v) + 5}>{label} {v.toFixed(2)}</text>
    </g>
  )

  return (
    <svg className="mini-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={t('Daily chart, last {n} sessions', { n: data.length })}>
      {data.map((b, i) => {
        const x = i * step + step / 2
        const up = b.close >= b.open
        const top = y(Math.max(b.open, b.close)), bot = y(Math.min(b.open, b.close))
        return (
          <g key={b.date} className={up ? 'mc-up' : 'mc-down'}>
            <line x1={x} x2={x} y1={y(b.high)} y2={y(b.low)} />
            <rect x={x - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} />
          </g>
        )
      })}
      {plan && line(plan.target, 'target', t('T'))}
      {plan && line(plan.entry, 'entry', t('E'))}
      {plan && line(plan.stop, 'stop', t('S'))}
    </svg>
  )
}
