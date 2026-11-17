import { useEffect, type ReactNode } from 'react'

export default function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {subtitle && <span className="subtle">{subtitle}</span>}
        {children}
      </div>
    </div>
  )
}
