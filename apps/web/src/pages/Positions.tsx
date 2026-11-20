import PositionsTable from '../components/PositionsTable'
import { useT } from '../lib/i18n'
import TradePlanner from '../components/TradePlanner'
import RiskPanel from '../components/RiskPanel'
import { useStore } from '../lib/store'

export default function Positions() {
  const { trades } = useStore()
  const t = useT()
  const open = trades.filter(x => x.status === 'OPEN')
  const planned = trades.filter(x => x.status === 'PLANNED')
  return (
    <div className="stack">
      <PositionsTable title={t('Open')} subtitle={open.length === 1 ? t('1 live position') : t('{n} live positions', { n: open.length })} trades={open} />
      <PositionsTable title={t('Planned')} subtitle={t('Sized and waiting for entry')} trades={planned} />
      <section className="grid bottom-grid" style={{ marginTop: 0 }}>
        <TradePlanner />
        <RiskPanel />
      </section>
    </div>
  )
}
