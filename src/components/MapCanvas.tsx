import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { Player, ProcessedEvent, Layers, MapId, MapIdOrUnknown } from '../types'
import { renderFrame } from '../utils/renderer'
import { ReplayLegend } from './ReplayLegend'

// ── Static minimap URLs (served from /public/minimaps/) ───────────────────────
const MINIMAP_SRC: Partial<Record<MapIdOrUnknown, string>> = {
  AmbroseValley: '/minimaps/AmbroseValley_Minimap.webp',
  GrandRift:     '/minimaps/GrandRift_Minimap.webp',
  Lockdown:      '/minimaps/Lockdown_Minimap.webp',
  // 'Unknown' intentionally omitted — no minimap for undetected maps
}

interface Props {
  mapId: MapIdOrUnknown | undefined  // undefined until replay is confirmed, 'Unknown' if undetected
  players: Player[]
  allEvents: ProcessedEvent[]
  selectedPlayers: Set<string>
  cutoffRel: number
  layers: Layers
  hasMatch: boolean
  isLoading?: boolean                // true while loading replay
}

const CANVAS_SIZE = 1024

export function MapCanvas({
  mapId, players, allEvents, selectedPlayers, cutoffRel, layers, hasMatch, isLoading,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Preload all minimaps to prevent flickering
  useEffect(() => {
    Object.values(MINIMAP_SRC).forEach(src => {
      if (src) {
        const img = new window.Image()
        img.src = src
      }
    })
  }, [])

  // Only render map if we have a known map, replay data, and are not loading
  const hasKnownMap = mapId && mapId !== 'Unknown' && MINIMAP_SRC[mapId]
  const canRender = hasMatch && hasKnownMap && !isLoading && (players.length > 0 || allEvents.length > 0)

  // Zoom / pan
  const [zoom, setZoom] = useState(1)
  const [pan,  setPan]  = useState({ x: 0, y: 0 })
  const dragging   = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // Tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  // Hovered player from legend — used to boost opacity on canvas
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null)

  // Redraw whenever data, timeline, or hovered player changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // If a player is hovered from the legend, temporarily boost their path visibility
    let effectivePlayers = players
    if (hoveredPlayer) {
      effectivePlayers = players.map(p =>
        p.userId === hoveredPlayer
          ? { ...p, color: p.color }   // keep color; renderer checks selectedPlayers for visibility
          : p
      )
      // Add hovered player to the selected set temporarily
      const boostedSelected = new Set(selectedPlayers)
      boostedSelected.add(hoveredPlayer)
      renderFrame(ctx, CANVAS_SIZE, allEvents, effectivePlayers, boostedSelected, cutoffRel, layers)
      return
    }

    renderFrame(ctx, CANVAS_SIZE, allEvents, players, selectedPlayers, cutoffRel, layers)
  }, [allEvents, players, selectedPlayers, cutoffRel, layers, hoveredPlayer])

  // Zoom
  const applyZoom = useCallback((delta: number) => {
    setZoom(z => Math.max(0.3, Math.min(6, z + delta)))
  }, [])
  const resetView  = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    applyZoom(e.deltaY < 0 ? 0.2 : -0.2)
  }, [applyZoom])

  // Pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({
      x: dragOrigin.current.px + (e.clientX - dragOrigin.current.mx) / zoom,
      y: dragOrigin.current.py + (e.clientY - dragOrigin.current.my) / zoom,
    })
  }, [zoom])
  const stopDrag = useCallback(() => { dragging.current = false }, [])

  // Tooltip on transparent hit layer
  const onHitMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !allEvents.length) return
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (CANVAS_SIZE / rect.width)
    const my = (e.clientY - rect.top)  * (CANVAS_SIZE / rect.height)

    let nearest: ProcessedEvent | null = null
    let nearDist = 18
    for (const ev of allEvents) {
      if (ev.event === 'Position' || ev.event === 'BotPosition') continue
      if (ev.tsRel > cutoffRel) continue
      const d = Math.hypot(ev.px - mx, ev.py - my)
      if (d < nearDist) { nearDist = d; nearest = ev }
    }
    if (nearest) {
      const uid = nearest.isBot
        ? `BOT ${nearest.userId}`
        : nearest.userId.substring(0, 8)
      const ms = nearest.tsRel
      const t  = `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')}`
      setTooltip({ x: e.clientX + 14, y: e.clientY - 10, text: `${nearest.event} · ${uid} · ${t}` })
    } else {
      setTooltip(null)
    }
  }, [allEvents, cutoffRel])

  const transform = `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`

  return (
    <div
      className="map-area"
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      {/* Empty state OR loading */}
      {!hasMatch || isLoading ? (
        <div className="empty-state">
          <div className="es-icon">{isLoading ? '⟳' : '⬡'}</div>
          <div className="es-text">{isLoading ? 'LOADING REPLAY…' : 'SELECT A MATCH TO BEGIN'}</div>
        </div>
      ) : !canRender ? (
        <div className="empty-state">
          <div className="es-icon">⚠</div>
          <div className="es-text">NO DATA FOR MAP</div>
        </div>
      ) : null}

      {/* Map + overlay — ONLY render if canRender is true (hasKnownMap guarantees mapId !== 'Unknown') */}
      {canRender && mapId && (
        <div
          className="map-wrap"
          style={{ transform, display: 'block' }}
          onMouseDown={onMouseDown}
          onWheel={handleWheel}
        >
          {/* Minimap — loaded from /public/minimaps/ automatically */}
          <img
            className="map-img"
            src={MINIMAP_SRC[mapId as MapId]}
            alt={mapId}
            draggable={false}
            key={mapId}  // Force re-render if mapId changes
          />

          {/* Canvas — pointer-events none so mouse events pass through */}
          <canvas
            ref={canvasRef}
            className="overlay-canvas"
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ pointerEvents: 'none' }}
          />

          {/* Transparent hit area for tooltip */}
          <div
            className="canvas-hit-area"
            onMouseMove={onHitMouseMove}
            onMouseLeave={() => setTooltip(null)}
          />

          <div className="map-label">{mapId.toUpperCase()}</div>
        </div>
      )}

      {/* Overlay container for floating UI (pointer-events:none on container, enabled on controls) */}
      <div className="map-overlay">
        {/* Zoom controls (pointer-events enabled) */}
        <div className="overlay-control zoom-controls">
          <button className="zoom-btn" onClick={() => applyZoom(0.25)}>+</button>
          <button className="zoom-btn" onClick={() => applyZoom(-0.25)}>−</button>
          <button className="zoom-btn zoom-reset" onClick={resetView}>⊙</button>
        </div>

        {/* Legend overlay wrapper (pointer-events enabled) */}
        {canRender && (
          <div className="overlay-control legend-wrapper">
            <ReplayLegend
              players={players}
              selectedPlayers={selectedPlayers}
              layers={layers}
              onHoverPlayer={setHoveredPlayer}
            />
          </div>
        )}
      </div>

      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
