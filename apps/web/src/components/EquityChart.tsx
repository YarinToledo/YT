import { useMemo, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { equityCurve } from '../lib/calc'
import { money, shortDate } from '../lib/format'
import { useStore } from '../lib/store'

const W = 700, H = 230, PAD_T = 20, PAD_B = 20

export default function EquityChart({ days = 30 }: { days?: number }) {
  const { settings, trades } = useStore()
  const t = useT()
  const pts = useMemo(() => equityCurve(settings, trades, days), [settings, trades, days])
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const vals = pts.map(p => p.equity)
  let lo = Math.min(...vals, settings.starting_capital)
  let hi = Math.max(...vals, settings.starting_capital)
  if (hi - lo < 1) { lo -= 10; hi += 10 }
  const pad = (hi - lo) * 0.12
  lo -= pad; hi += pad
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.equity).toFixed(1)}`).join(' ')
  const area = `${line} L${W} ${H - PAD_B} L0 ${H - PAD_B}Z`
  const baseY = y(settings.starting_capital)
  const labelIdx = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * (pts.length - 1)))
  const first = vals[0], last = vals[vals.length - 1]

  function onMove(e: React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))
    setHover(Math.max(0, Math.min(pts.length - 1, i)))
  }

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{t('Equity Performance')}</div>
          <div className="subtle">{t('Realized equity · {n}-day change {v}', { n: days, v: `${last - first >= 0 ? '+' : '−'}${money(Math.abs(last - first))}` })}</div>
        </div>
        <span className="subtle">{t('{n}D', { n: days })}</span>
      </div>
      <div className="chart-wrap" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('Equity over the last {n} days, from {a} to {b}', { n: days, a: money(first), b: money(last) })}>
          <defs>
            <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#c9aa70" stopOpacity=".24" />
              <stop offset="100%" stopColor="#c9aa70" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-grid" d={`M0 ${PAD_T}H${W} M0 ${(H - PAD_B + PAD_T) / 2}H${W} M0 ${H - PAD_B}H${W}`} />
          <path className="chart-base" d={`M0 ${baseY}H${W}`} />
          <path d={area} fill="url(#area)" />
          <path className="chart-line" d={line} />
        </svg>
        <span className="chart-y" style={{ top: `${(baseY / H) * 100}%` }}>{t('start {v}', { v: money(settings.starting_capital) })}</span>
        {hover != null && (
          <>
            <div className="chart-cursor" style={{ left: `${(hover / (pts.length - 1)) * 100}%` }} />
            <div className="chart-tip" style={{ left: `${Math.min(88, Math.max(12, (hover / (pts.length - 1)) * 100))}%` }}>
              {shortDate(pts[hover].date)} · <b>{money(pts[hover].equity)}</b>
            </div>
          </>
        )}
      </div>
      <div className="chart-labels">{labelIdx.map(i => <span key={i}>{shortDate(pts[i].date).toUpperCase()}</span>)}</div>
    </article>
  )
}
