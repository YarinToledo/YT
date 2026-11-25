import { useEffect, useState } from 'react'

/** The fixed target (in R) used for the theoretical "target R" column and monthly summary. Remembered per browser. */
const KEY = 'tradepilot-target-r'
const read = () => { try { const v = Number(localStorage.getItem(KEY)); return v > 0 ? v : 2 } catch { return 2 } }

export function useTargetR(): [number, (v: number) => void] {
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => setV(read())
    window.addEventListener('tradepilot-target-r', on)
    return () => window.removeEventListener('tradepilot-target-r', on)
  }, [])
  return [v, x => {
    try { localStorage.setItem(KEY, String(x)) } catch { /* private mode */ }
    setV(x)
    window.dispatchEvent(new Event('tradepilot-target-r'))
  }]
}
