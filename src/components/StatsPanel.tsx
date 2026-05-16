import React from 'react'
import type { Player, ProcessedEvent } from '../types'
import { shortId } from '../utils/mapUtils'

interface StatsProps {
  players: Player[]
  allEvents: ProcessedEvent[]
  cutoffRel: number
}

export function StatsPanel({ players, allEvents, cutoffRel }: StatsProps) {
  const visible = allEvents.filter(e => e.tsRel <= cutoffRel)
  const humans  = players.filter(p => !p.isBot)
  const bots    = players.filter(p => p.isBot)
  const kills   = visible.filter(e => e.event === 'Kill' || e.event === 'BotKill').length
  const deaths  = visible.filter(e => e.event === 'Killed' || e.event === 'BotKilled').length
  const storm   = visible.filter(e => e.event === 'KilledByStorm').length
  const loot    = visible.filter(e => e.event === 'Loot').length

  const rows = [
    { label: 'PLAYERS', value: humans.length, cls: 'c-accent' },
    { label: 'BOTS',    value: bots.length,   cls: 'c-orange' },
    { label: 'KILLS',   value: kills,          cls: 'c-red'    },
    { label: 'DEATHS',  value: deaths,         cls: 'c-red'    },
    { label: 'LOOT',    value: loot,           cls: 'c-yellow' },
    { label: 'STORM ⚡', value: storm,         cls: 'c-purple' },
    { label: 'EVENTS',  value: visible.length, cls: 'c-green'  },
  ]

  return (
    <div className="stats-section">
      <div className="panel-title">// Match Stats</div>
      {rows.map(r => (
        <div className="stat-row" key={r.label}>
          <span className="stat-key">{r.label}</span>
          <span className={`stat-val ${r.cls}`}>{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Player list ───────────────────────────────────────────────────────────────

interface PlayerListProps {
  players: Player[]
  selectedPlayers: Set<string>
  onToggle: (uid: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export function PlayerList({
  players, selectedPlayers, onToggle, onSelectAll, onDeselectAll
}: PlayerListProps) {
  return (
    <div className="player-section">
      <div className="player-header">
        <span className="panel-title" style={{ margin: 0 }}>
          // Players <span className="dim">({players.length})</span>
        </span>
        <div className="player-sel-btns">
          <button className="sel-btn" onClick={onSelectAll}>ALL</button>
          <button className="sel-btn" onClick={onDeselectAll}>NONE</button>
        </div>
      </div>

      <div className="player-scroll">
        {players.length === 0 && <div className="no-data">No match loaded</div>}
        {players.map(p => {
          const sel = selectedPlayers.has(p.userId)
          return (
            <div
              key={p.userId}
              className={`player-item ${sel ? 'selected' : ''}`}
              onClick={() => onToggle(p.userId)}
            >
              <span
                className="player-dot"
                style={{
                  background: p.color,
                  boxShadow: `0 0 5px ${p.color}`,
                }}
              />
              <span className="player-name">{shortId(p.userId, p.isBot)}</span>
              <span className={`player-tag ${p.isBot ? 'tag-bot' : 'tag-human'}`}>
                {p.isBot ? 'BOT' : 'HMN'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
