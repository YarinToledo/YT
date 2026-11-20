import { getLang } from './i18n'

const loc = () => (getLang() === 'he' ? 'he-IL' : 'en-US')
/** In Hebrew, wrap numbers in a left-to-right isolate so signs, $ and 1:3 ratios don't get reordered. */
const ltr = (s: string) => (getLang() === 'he' && s !== '—' ? `\u2066${s}\u2069` : s)
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })

export const money = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : ltr(usd.format(n)))
export const px = (n: number | null | undefined) => (n == null ? '—' : ltr(price.format(n)))
export const signedMoney = (n: number) => ltr((n > 0 ? '+' : n < 0 ? '−' : '') + usd.format(Math.abs(n)))
export const pct = (n: number | null | undefined, digits = 2) => (n == null || !isFinite(n) ? '—' : ltr(`${(n * 100).toFixed(digits)}%`))
export const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''))
export const ratio = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : ltr(`1:${n.toFixed(2).replace(/\.00$/, '')}`))
export const rMult = (n: number | null | undefined) => (n == null ? '—' : ltr(`${n > 0 ? '+' : ''}${n.toFixed(2)}R`))
export const tone = (n: number) => (n > 0 ? 'positive' : n < 0 ? 'negative' : '')

export const shortDate = (iso: string | Date | null) =>
  iso == null ? '—' : new Date(iso).toLocaleDateString(loc(), { month: 'short', day: '2-digit' })

export const dateTime = (iso: string | null) =>
  iso == null ? '—' : new Date(iso).toLocaleString(loc(), { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Value for <input type="datetime-local"> */
export const toLocalInput = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 16)
}

/** 1.2T / 345.6B / 12.3M — for market caps, revenue, volume. */
export const compact = (n: number | null | undefined) => {
  if (n == null || !isFinite(n)) return '—'
  const a = Math.abs(n)
  const [d, s] = a >= 1e12 ? [1e12, 'T'] : a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, '']
  const v = (n / d).toFixed(a >= 1e3 ? 1 : 0)
  return getLang() === 'he' ? `⁦${v}${s}⁩` : `${v}${s}`
}
export const num2 = (n: number | null | undefined, digits = 2) => (n == null || !isFinite(n) ? '—' : n.toFixed(digits))
export const signedPct = (n: number | null | undefined, digits = 2) =>
  n == null || !isFinite(n) ? '—' : ltr(`${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n * 100).toFixed(digits)}%`)
export const times = (n: number | null | undefined, digits = 1) => (n == null || !isFinite(n) ? '—' : ltr(`${n.toFixed(digits)}×`))
