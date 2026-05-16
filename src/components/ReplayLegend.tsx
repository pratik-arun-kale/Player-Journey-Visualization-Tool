/**
 * ReplayLegend.tsx
 *
 * Floating overlay panel positioned inside the map area.
 * Shows player colors, human/bot distinction, and event symbol meanings.
 * Respects layer visibility — fades items whose layer is disabled.
 * Never re-renders the canvas; pure DOM overlay.
 */

import React, { memo, useState, useCallback } from 'react'
import type { Player, Layers } from '../types'
import { BOT_COLOR } from '../utils/mapUtils'

// ── Event symbol config (must match renderer.ts exactly) ─────────────────────

interface EventSymbol {
  label: string
  color: string
  shape: 'circle-x' | 'circle' | 'diamond' | 'square'
  layer: keyof Layers | null   // null = always visible
}

const EVENT_SYMBOLS: EventSymbol[] = [
  { label: 'Kill',        color: '#ff3333', shape: 'circle-x', layer: 'kills' },
  { label: 'Death',       color: '#ff6666', shape: 'circle',   layer: 'kills' },
  { label: 'Storm Death', color: '#bf5fff', shape: 'diamond',  layer: 'storm' },
  { label: 'Loot',        color: '#ffd700', shape: 'square',   layer: 'loot'  },
]

// ── Symbol SVG shapes ─────────────────────────────────────────────────────────

function SymbolIcon({ shape, color }: { shape: EventSymbol['shape']; color: string }) {
  const s = 14  // svg viewBox size
  const c = s / 2

  switch (shape) {
    case 'circle-x':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ flexShrink: 0 }}>
          <circle cx={c} cy={c} r={c - 1} fill={`${color}30`} stroke={color} strokeWidth="1.5" />
          <line x1={c - 3} y1={c - 3} x2={c + 3} y2={c + 3} stroke={color} strokeWidth="1.5" />
          <line x1={c + 3} y1={c - 3} x2={c - 3} y2={c + 3} stroke={color} strokeWidth="1.5" />
        </svg>
      )
    case 'circle':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ flexShrink: 0 }}>
          <circle cx={c} cy={c} r={c - 1} fill={color} stroke={`${color}80`} strokeWidth="1" />
        </svg>
      )
    case 'diamond':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ flexShrink: 0 }}>
          <polygon points={`${c},1 ${s - 1},${c} ${c},${s - 1} 1,${c}`} fill={color} />
        </svg>
      )
    case 'square':
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ flexShrink: 0 }}>
          <rect
            x={2} y={2} width={s - 4} height={s - 4}
            fill={color}
            transform={`rotate(45 ${c} ${c})`}
          />
        </svg>
      )
  }
}

// ── Player row ────────────────────────────────────────────────────────────────

interface PlayerRowProps {
  player: Player
  isSelected: boolean
  onHoverIn: (userId: string) => void
  onHoverOut: () => void
  showBots: boolean
}

const PlayerRow = memo(function PlayerRow({
  player, isSelected, onHoverIn, onHoverOut, showBots,
}: PlayerRowProps) {
  if (player.isBot && !showBots) return null

  const shortId = player.isBot
    ? `BOT ${player.userId}`
    : `${player.userId.substring(0, 8)}…`

  return (
    <div
      className={`legend-player-row ${isSelected ? 'selected' : 'faded'}`}
      onMouseEnter={() => onHoverIn(player.userId)}
      onMouseLeave={onHoverOut}
      title={player.userId}
    >
      <span
        className="legend-dot"
        style={{
          background: player.color,
          boxShadow: isSelected ? `0 0 5px ${player.color}` : 'none',
        }}
      />
      <span className="legend-player-id">{shortId}</span>
      <span className={`legend-tag ${player.isBot ? 'tag-bot' : 'tag-human'}`}>
        {player.isBot ? 'BOT' : 'HMN'}
      </span>
    </div>
  )
})

// ── Main Legend component ─────────────────────────────────────────────────────

interface Props {
  players: Player[]
  selectedPlayers: Set<string>
  layers: Layers
  /** Callback: highlight a player's path on the canvas */
  onHoverPlayer?: (userId: string | null) => void
}

export const ReplayLegend = memo(function ReplayLegend({
  players, selectedPlayers, layers, onHoverPlayer,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const handleHoverIn = useCallback((userId: string) => {
    onHoverPlayer?.(userId)
  }, [onHoverPlayer])

  const handleHoverOut = useCallback(() => {
    onHoverPlayer?.(null)
  }, [onHoverPlayer])

  // Don't show if no match loaded
  if (players.length === 0) return null

  const humans = players.filter(p => !p.isBot)
  const bots   = players.filter(p => p.isBot)

  return (
    <div className={`replay-legend ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="legend-header" onClick={() => setCollapsed(c => !c)}>
        <span className="legend-title">// LEGEND</span>
        <span className="legend-collapse-btn">{collapsed ? '▸' : '▾'}</span>
      </div>

      {!collapsed && (
        <>
          {/* ── Players section ── */}
          <div className="legend-section">
            <div className="legend-section-title">
              PLAYERS
              <span className="legend-section-count">
                {humans.length}H · {bots.length}B
              </span>
            </div>
            <div className="legend-player-list">
              {players.map(p => (
                <PlayerRow
                  key={p.userId}
                  player={p}
                  isSelected={selectedPlayers.has(p.userId)}
                  onHoverIn={handleHoverIn}
                  onHoverOut={handleHoverOut}
                  showBots={layers.bots}
                />
              ))}
              {/* Bots hidden notice */}
              {!layers.bots && bots.length > 0 && (
                <div className="legend-hidden-note">
                  {bots.length} bot{bots.length > 1 ? 's' : ''} hidden
                </div>
              )}
            </div>
          </div>

          <div className="legend-divider" />

          {/* ── Events section ── */}
          <div className="legend-section">
            <div className="legend-section-title">EVENTS</div>
            {EVENT_SYMBOLS.map(sym => {
              const layerActive = sym.layer === null || layers[sym.layer]
              return (
                <div
                  key={sym.label}
                  className={`legend-event-row ${layerActive ? '' : 'layer-off'}`}
                  title={layerActive ? sym.label : `${sym.label} (layer hidden)`}
                >
                  <SymbolIcon shape={sym.shape} color={sym.color} />
                  <span className="legend-event-label">{sym.label}</span>
                  {!layerActive && <span className="legend-off-tag">OFF</span>}
                </div>
              )
            })}
          </div>

          <div className="legend-divider" />

          {/* ── Type reference ── */}
          <div className="legend-section">
            <div className="legend-section-title">TYPE</div>
            <div className="legend-type-row">
              <span className="legend-dot" style={{ background: '#4d9fff', boxShadow: '0 0 5px #4d9fff' }} />
              <span className="legend-event-label">Human Player</span>
            </div>
            <div className="legend-type-row">
              <span className="legend-dot" style={{ background: BOT_COLOR, opacity: layers.bots ? 1 : 0.4 }} />
              <span className="legend-event-label" style={{ opacity: layers.bots ? 1 : 0.4 }}>Bot</span>
              {!layers.bots && <span className="legend-off-tag">OFF</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
})
