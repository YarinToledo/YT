import PositionsTable from '../components/PositionsTable'
import TradePlanner from '../components/TradePlanner'
import RiskPanel from '../components/RiskPanel'
import { useStore } from '../lib/store'

export default function Positions() {
  const { trades } = useStore()
  const open = trades.filter(t => t.status === 'OPEN')
  const planned = trades.filter(t => t.status === 'PLANNED')
  return (
    <div className="stack">
      <PositionsTable title="Open" subtitle={`${open.length} live position${open.length === 1 ? '' : 's'}`} trades={open} />
      <PositionsTable title="Planned" subtitle="Sized and waiting for entry" trades={planned} />
      <section className="grid bottom-grid" style={{ marginTop: 0 }}>
        <TradePlanner />
        <RiskPanel />
      </section>
    </div>
  )
}
