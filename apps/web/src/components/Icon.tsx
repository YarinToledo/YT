/** Small line-icon set for the navigation (24×24, stroke = currentColor). */
const PATHS: Record<string, string> = {
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  positions: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  journal: 'M6 3h10l3 3v15H6zM9 9h7M9 13h7M9 17h4',
  watch: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  hot: 'M12 21c-4 0-7-2.8-7-6.6 0-3.6 2.9-5.5 3.6-9.4 2.1 1.4 3.4 3.4 3.6 5.6 1-.8 1.6-2 1.7-3.3 2.5 2 4.1 4.6 4.1 7.3 0 3.6-2.6 6.4-6 6.4zM12 21c-1.7 0-3-1.2-3-2.8 0-1.7 1.6-2.6 3-4.2 1.4 1.6 3 2.5 3 4.2 0 1.6-1.3 2.8-3 2.8z',
  analyze: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM21 21l-5.2-5.2M7 12l2.2-2.4 2 1.8L14 8',
  risk: 'M12 3l8 3v6c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6zM12 8v5M12 16h.01',
  analytics: 'M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
}

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.overview} />
    </svg>
  )
}
