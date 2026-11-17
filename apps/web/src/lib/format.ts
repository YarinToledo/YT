const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })

export const money = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : usd.format(n))
export const px = (n: number | null | undefined) => (n == null ? '—' : price.format(n))
export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + usd.format(Math.abs(n))
export const pct = (n: number | null | undefined, digits = 2) => (n == null || !isFinite(n) ? '—' : `${(n * 100).toFixed(digits)}%`)
export const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''))
export const ratio = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : `1:${n.toFixed(2).replace(/\.00$/, '')}`)
export const rMult = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}R`)
export const tone = (n: number) => (n > 0 ? 'positive' : n < 0 ? 'negative' : '')

export const shortDate = (iso: string | Date | null) =>
  iso == null ? '—' : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })

export const dateTime = (iso: string | null) =>
  iso == null ? '—' : new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Value for <input type="datetime-local"> */
export const toLocalInput = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 16)
}
