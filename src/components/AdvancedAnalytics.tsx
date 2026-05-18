import React, { useMemo, useState } from 'react'
import type { MatchAnalytics, PlayerAnalytics } from '../analytics/analyticsEngine'

const layers = ['Movement', 'Loot', 'Combat', 'Deaths'] as const

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function createRadarPoints(data: Array<{ label: string; value: number }>, size: number) {
  const center = size / 2
  const radius = center - 28
  const points = data.map((item, index) => {
    const angle = Math.PI / 2 + (index / data.length) * Math.PI * 2
    const scaled = (item.value / 100) * radius
    return {
      x: center + Math.cos(angle) * scaled,
      y: center - Math.sin(angle) * scaled,
    }
  })
  return points.map(p => `${p.x},${p.y}`).join(' ')
}

function formatNumber(value: number, suffix = '') {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`
}

function formatDistance(value: number) {
  return `${(value / 16).toFixed(1)} m`
}

function buildHeatmapCells(data: number[][]) {
  const max = Math.max(...data.flat(), 1)
  return data.map(row => row.map(val => ({ value: val, intensity: val / max })))
}

export function AdvancedAnalytics({ analytics }: { analytics: MatchAnalytics }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState(analytics.players[0]?.userId || '')
  const [selectedLayer, setSelectedLayer] = useState<typeof layers[number]>('Movement')
  const [highlightText, setHighlightText] = useState('Hover a region for details')

  const selectedPlayer = analytics.players.find(player => player.userId === selectedPlayerId) || analytics.players[0]
  const bestPlayer = useMemo(() => analytics.players
    .slice()
    .sort((a, b) => (b.aggressionScore + b.explorerScore + b.looterScore + b.speedRunnerScore) - (a.aggressionScore + a.explorerScore + a.looterScore + a.speedRunnerScore))[0]
  , [analytics.players])

  const totalDistance = useMemo(() => analytics.players.reduce((sum, p) => sum + p.totalDistance, 0), [analytics.players])
  const avgSpeed = useMemo(() => analytics.players.length > 0
    ? analytics.players.reduce((sum, p) => sum + p.avgSpeed, 0) / analytics.players.length
    : 0
  , [analytics.players])

  const radarData = selectedPlayer ? [
    { label: 'Aggression', value: selectedPlayer.aggressionScore },
    { label: 'Exploration', value: selectedPlayer.explorerScore },
    { label: 'Looting', value: selectedPlayer.looterScore },
    { label: 'Speed', value: selectedPlayer.speedRunnerScore },
    { label: 'Camping', value: selectedPlayer.campingScore },
  ] : []

  const heatmapCells = useMemo(() => {
    const data = selectedLayer === 'Movement'
      ? analytics.map.movementHeatmap
      : selectedLayer === 'Loot'
        ? analytics.map.lootHeatmap
        : analytics.map.combatHeatmap
    return buildHeatmapCells(data)
  }, [analytics.map, selectedLayer])

  const styleParts = selectedPlayer?.playstyle.split(' ') || ['Unknown']
  const primaryStyle = styleParts[0]
  const secondaryStyle = styleParts.slice(1).join(' ') || 'Balanced'
  const topHotspot = analytics.map.hotspots[0]
  const topChokepoint = analytics.map.chokepoints[0]

  return (
    <div className="analytics-panel">
      <div className="analytics-overview">
        <div className="analytics-tile">
          <div className="title">Total Distance</div>
          <div className="value">{formatDistance(totalDistance)}</div>
          <div className="meta">All players combined travel</div>
        </div>
        <div className="analytics-tile">
          <div className="title">Average Speed</div>
          <div className="value">{formatNumber(avgSpeed, ' m/s')}</div>
          <div className="meta">Real-time velocity average</div>
        </div>
        <div className="analytics-tile">
          <div className="title">Combat Count</div>
          <div className="value">{analytics.summary.totalKills}</div>
          <div className="meta">Engagements detected</div>
        </div>
        <div className="analytics-tile">
          <div className="title">Loot Count</div>
          <div className="value">{analytics.summary.totalLoot}</div>
          <div className="meta">Supply events captured</div>
        </div>
        <div className="analytics-tile">
          <div className="title">Heat Zones</div>
          <div className="value">{analytics.map.summary.hotspotCount}</div>
          <div className="meta">Critical tactical areas</div>
        </div>
        <div className="analytics-tile">
          <div className="title">Top Playstyle</div>
          <div className="value">{bestPlayer?.playstyle || 'Unknown'}</div>
          <div className="meta">Match dominant behavior</div>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-widget large">
          <div className="analytics-widget-header">
            <div>
              <div className="analytics-widget-title">Playstyle Analysis</div>
              <div className="analytics-widget-subtitle">Performance profile and decision intelligence</div>
            </div>
            <div className="analytics-player-selector">
              <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
                {analytics.players.map(player => (
                  <option key={player.userId} value={player.userId}>{player.displayName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="playstyle-summary">
            <div className="playstyle-score">
              <strong>{selectedPlayer?.playstyle || 'Unknown Player'}</strong>
              <span>{primaryStyle} · {secondaryStyle}</span>
            </div>
            <div className="analytics-summary-pill">
              <div className="pill-label">Dominant trait</div>
              <div className="pill-value">{primaryStyle}</div>
            </div>
            <svg viewBox="0 0 240 240" className="playstyle-radar">
              <circle cx="120" cy="120" r="100" fill="rgba(0,204,255,0.06)" stroke="rgba(0,204,255,0.18)" />
              {[1, 2, 3, 4].map(level => (
                <circle key={level} cx="120" cy="120" r={100 * level / 4} fill="none" stroke="rgba(0,204,255,0.12)" />
              ))}
              <polyline points={createRadarPoints(radarData, 240)} fill="rgba(0,204,255,0.22)" stroke="#36c1ff" strokeWidth="2" />
              {radarData.map((item, index) => {
                const angle = Math.PI / 2 + (index / radarData.length) * Math.PI * 2
                const px = 120 + Math.cos(angle) * 116
                const py = 120 - Math.sin(angle) * 116
                return (
                  <g key={item.label}>
                    <line x1="120" y1="120" x2={px} y2={py} stroke="rgba(255,255,255,0.08)" />
                    <text x={px} y={py} fill="#c6f3ff" fontSize="10" textAnchor={Math.cos(angle) > 0 ? 'start' : 'end'} dominantBaseline="central">
                      {item.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        <div className="analytics-widget medium">
          <div className="analytics-widget-header">
            <div>
              <div className="analytics-widget-title">Movement Heatmap</div>
              <div className="analytics-widget-subtitle">Multi-layer density and hotspot overlay</div>
            </div>
          </div>

          <div className="analytics-layer-toggle">
            {layers.map(layer => (
              <button
                key={layer}
                className={selectedLayer === layer ? 'active' : ''}
                onClick={() => setSelectedLayer(layer)}
              >
                {layer}
              </button>
            ))}
          </div>

          <div className="heatmap-preview">
            <div className="heatmap-grid">
              {heatmapCells.flatMap((row, rowIndex) =>
                row.map((cell, cellIndex) => (
                  <div
                    key={`${rowIndex}-${cellIndex}`}
                    className="heatmap-cell"
                    style={{ background: `rgba(54,193,255,${0.08 + cell.intensity * 0.72})` }}
                    onMouseEnter={() => setHighlightText(`Cell ${cellIndex + 1},${rowIndex + 1} · ${cell.value} events`)}
                    onMouseLeave={() => setHighlightText('Hover a region for details')}
                  />
                ))
              )}
            </div>
            <div className="heatmap-legend">
              <div className="heatmap-legend-item"><span className="heatmap-legend-dot" style={{ background: 'rgba(54,193,255,0.9)' }} /> High density</div>
              <div className="heatmap-legend-item"><span className="heatmap-legend-dot" style={{ background: 'rgba(54,193,255,0.25)' }} /> Low activity</div>
              <div className="heatmap-legend-item"><span>{highlightText}</span></div>
            </div>
          </div>
        </div>

        <div className="analytics-widget medium">
          <div className="analytics-widget-header">
            <div>
              <div className="analytics-widget-title">Skill Analytics</div>
              <div className="analytics-widget-subtitle">Efficiency metrics and combat rhythm</div>
            </div>
          </div>

          <div className="skill-metric-list">
            <div className="skill-metric">
              <div className="skill-metric-title"><span>Route Efficiency</span><strong>{selectedPlayer?.routeEfficiency ?? 0}%</strong></div>
              <div className="skill-metric-bar"><div className="skill-metric-fill" style={{ width: `${selectedPlayer?.routeEfficiency ?? 0}%` }} /></div>
            </div>
            <div className="skill-metric">
              <div className="skill-metric-title"><span>Loot Efficiency</span><strong>{selectedPlayer?.lootEfficiency ?? 0}</strong></div>
              <div className="skill-metric-bar"><div className="skill-metric-fill" style={{ width: `${clamp((selectedPlayer?.lootEfficiency ?? 0) * 8, 0, 100)}%` }} /></div>
            </div>
            <div className="skill-metric">
              <div className="skill-metric-title"><span>Combat Efficiency</span><strong>{formatNumber(selectedPlayer?.combatPerMinute ?? 0)}</strong></div>
              <div className="skill-metric-bar"><div className="skill-metric-fill" style={{ width: `${clamp((selectedPlayer?.combatPerMinute ?? 0) * 10, 0, 100)}%` }} /></div>
            </div>
            <div className="skill-metric">
              <div className="skill-metric-title"><span>Movement Smoothness</span><strong>{selectedPlayer?.movementSmoothness ?? 0}%</strong></div>
              <div className="skill-metric-bar"><div className="skill-metric-fill" style={{ width: `${selectedPlayer?.movementSmoothness ?? 0}%` }} /></div>
            </div>
            <div className="skill-metric">
              <div className="skill-metric-title"><span>Decision Speed</span><strong>{selectedPlayer?.decisionSpeed ?? 0}%</strong></div>
              <div className="skill-metric-bar"><div className="skill-metric-fill" style={{ width: `${selectedPlayer?.decisionSpeed ?? 0}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="analytics-widget wide">
          <div className="analytics-widget-header">
            <div>
              <div className="analytics-widget-title">Map Intelligence</div>
              <div className="analytics-widget-subtitle">Dead zones, chokepoints, and overpowered terrain</div>
            </div>
          </div>

          <div className="map-intel-matrix">
            <div className="map-intel-pill">
              <div className="title">Dead Zones</div>
              <div className="value">{analytics.map.summary.deadZoneCount}</div>
              <div className="meta">Low traffic areas players avoid</div>
            </div>
            <div className="map-intel-pill">
              <div className="title">Overpowered Locations</div>
              <div className="value">{analytics.map.hotspots.length}</div>
              <div className="meta">Loot + combat concentration</div>
            </div>
            <div className="map-intel-pill">
              <div className="title">Chokepoints</div>
              <div className="value">{analytics.map.chokepoints.length}</div>
              <div className="meta">Repeat crossing zones</div>
            </div>
            <div className="map-intel-pill">
              <div className="title">Underused Terrain</div>
              <div className="value">{analytics.map.underused.length}</div>
              <div className="meta">Rarely explored areas</div>
            </div>
          </div>

          <div className="analytics-grid">
            <div className="analytics-list">
              <div className="analytics-list-item" onMouseEnter={() => setHighlightText(`Hotspot at ${topHotspot?.x + 1},${topHotspot?.y + 1}`)}>
                <strong>Primary Hotspot</strong>
                <span>{topHotspot ? `${topHotspot.count} events` : 'No data'}</span>
              </div>
              <div className="analytics-list-item" onMouseEnter={() => setHighlightText(`Top chokepoint at ${topChokepoint?.x + 1},${topChokepoint?.y + 1}`)}>
                <strong>Top Chokepoint</strong>
                <span>{topChokepoint ? `${topChokepoint.score.toFixed(0)} score` : 'No data'}</span>
              </div>
              <div className="analytics-list-item" onMouseEnter={() => setHighlightText('Interactive region preview enabled')}>
                <strong>Map Overlay</strong>
                <span>Hover hotspots to inspect</span>
              </div>
            </div>
            <div className="heatmap-preview" />
          </div>
        </div>
      </div>
    </div>
  )
}
