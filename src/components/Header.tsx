import React from 'react'

interface Props {
  matchCount: number
  playerCount: number
  eventCount: number
  activeMap: string
  status: string
  indexingState: 'idle' | 'indexing' | 'done'
  indexedCount: number
  totalFileCount: number
}

export function Header({
  matchCount, playerCount, eventCount, activeMap, status,
  indexingState, indexedCount, totalFileCount,
}: Props) {
  const isReady = indexingState === 'done' || status.startsWith('LOADED')
  const isIndexing = indexingState === 'indexing'
  const progress = totalFileCount > 0 ? (indexedCount / totalFileCount) * 100 : 0

  return (
    <header className="hdr">
      <div className="hdr-logo">
        LILA <span className="accent2">BLACK</span>
        <span className="hdr-slash"> // </span>
        <span className="hdr-sub">ANALYST</span>
      </div>
      <div className="hdr-sep" />
      <Stat label="Matches"  value={matchCount}          color="accent" />
      <Stat label="Players"  value={playerCount}         color="orange" />
      <Stat label="Events"   value={eventCount}          color="green" />
      <Stat label="Map"      value={activeMap || '—'}    color="accent" />

      {/* Indexing progress bar — visible only during indexing */}
      {(isIndexing || (indexingState === 'done' && totalFileCount > 0)) && (
        <div className="hdr-index-progress">
          <div className="index-bar-track">
            <div
              className={`index-bar-fill ${isIndexing ? 'indexing' : 'done'}`}
              style={{ width: `${isIndexing ? progress : 100}%` }}
            />
          </div>
          <span className="index-label">
            {isIndexing
              ? `Indexing ${indexedCount} / ${totalFileCount}`
              : `${matchCount} matches indexed`}
          </span>
        </div>
      )}

      <div className="hdr-right">
        <span
          className="status-dot"
          style={{
            background:  isReady   ? 'var(--green)'   :
                         isIndexing ? 'var(--accent2)' :
                                      'var(--accent2)',
            boxShadow: `0 0 8px ${isReady ? 'var(--green)' : 'var(--accent2)'}`,
          }}
        />
        <span className="status-text">{status}</span>
      </div>
    </header>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="hdr-stat">
      <span className="hdr-stat-label">{label}</span>
      <span className={`hdr-stat-value c-${color}`}>{value}</span>
    </div>
  )
}
