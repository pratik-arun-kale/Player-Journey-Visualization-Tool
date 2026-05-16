import React from 'react'
import type { MatchMetadata, FilterMap, FilterDate, MapCounts, MatchLoadState } from '../types'

interface Props {
  matches: MatchMetadata[]
  activeMatchId: string | null
  filterMap:    FilterMap
  filterDate:   FilterDate
  mapCounts:    MapCounts
  matchLoadStates: Map<string, MatchLoadState>
  indexingState: 'idle' | 'indexing' | 'done'
  onSelectMatch: (id: string) => void
  onFilterMap:   (v: FilterMap) => void
  onFilterDate:  (v: FilterDate) => void
  totalCount: number
}

const MAP_SHORT: Record<string, string> = {
  AmbroseValley: 'AMBROSE',
  GrandRift:     'GRAND RIFT',
  Lockdown:      'LOCKDOWN',
  Unknown:       'UNKNOWN',
}
const MAP_CLASS: Record<string, string> = {
  AmbroseValley: 'badge-ambrose',
  GrandRift:     'badge-grand',
  Lockdown:      'badge-lock',
  Unknown:       'badge-unknown',
}

const LOAD_STATE_BADGE: Record<MatchLoadState, { label: string; cls: string }> = {
  indexed: { label: 'INDEXED', cls: 'load-badge-indexed' },
  loading: { label: 'LOADING…', cls: 'load-badge-loading' },
  loaded:  { label: '● LOADED', cls: 'load-badge-loaded' },
  error:   { label: '⚠ ERROR', cls: 'load-badge-error' },
}

export function MatchList({
  matches, activeMatchId,
  filterMap, filterDate,
  mapCounts, matchLoadStates,
  indexingState,
  onSelectMatch, onFilterMap, onFilterDate,
  totalCount,
}: Props) {
  return (
    <div className="match-list-panel">
      {/* Filters */}
      <div className="panel-section">
        <div className="panel-title">// Filters</div>
        <div className="filter-group">
          <label className="filter-label">Map</label>
          <select value={filterMap} onChange={e => onFilterMap(e.target.value as FilterMap)}>
            <option value="all">All Maps ({totalCount})</option>
            <option value="AmbroseValley">
              Ambrose Valley ({mapCounts.AmbroseValley})
            </option>
            <option value="GrandRift">
              Grand Rift ({mapCounts.GrandRift})
            </option>
            <option value="Lockdown">
              Lockdown ({mapCounts.Lockdown})
            </option>
            {mapCounts.Unknown > 0 && (
              <option value="Unknown">
                Unknown ({mapCounts.Unknown})
              </option>
            )}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Date</label>
          <select value={filterDate} onChange={e => onFilterDate(e.target.value as FilterDate)}>
            <option value="all">All Dates</option>
            <option value="February_10">Feb 10</option>
            <option value="February_11">Feb 11</option>
            <option value="February_12">Feb 12</option>
            <option value="February_13">Feb 13</option>
            <option value="February_14">Feb 14</option>
          </select>
        </div>
      </div>

      {/* List header */}
      <div className="panel-title match-list-header">
        // Match Select{' '}
        <span className="dim">
          ({matches.length}/{totalCount})
          {indexingState === 'indexing' && <span className="indexing-pulse"> ⏳</span>}
        </span>
      </div>

      {/* Match cards */}
      <div className="match-scroll">
        {matches.length === 0 ? (
          <div className="no-data">
            {indexingState === 'idle'
              ? 'Drop a folder to begin'
              : indexingState === 'indexing'
                ? 'Indexing…'
                : 'No matches found'}
          </div>
        ) : (
          matches.map(g => {
            const loadState = matchLoadStates.get(g.realMatchId)
            const loadBadge = loadState ? LOAD_STATE_BADGE[loadState] : null

            return (
              <div
                key={g.realMatchId}
                className={`match-item ${g.realMatchId === activeMatchId ? 'active' : ''}`}
                onClick={() => onSelectMatch(g.realMatchId)}
              >
                <div className="match-id">{g.realMatchId.substring(0, 8)}…</div>
                <div className="match-meta">
                  <span className={`badge ${MAP_CLASS[g.mapId] ?? 'badge-unknown'}`}>
                    {MAP_SHORT[g.mapId] ?? g.mapId}
                  </span>
                  <span className="match-counts">
                    👤{g.humanCount} 🤖{g.botCount}
                  </span>
                  <span className="match-folder dim">
                    {g.folder.replace('February_', 'F')}
                  </span>
                  {loadBadge && (
                    <span className={`load-badge ${loadBadge.cls}`}>
                      {loadBadge.label}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
