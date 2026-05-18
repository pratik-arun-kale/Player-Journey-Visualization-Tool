import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
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
  cinematicEnabled: boolean
}

const CANVAS_SIZE = 1024

export function MapCanvas({
  mapId, players, allEvents, selectedPlayers, cutoffRel, layers, hasMatch, isLoading,
  cinematicEnabled,
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

  // Render partial replays even when the map has not been detected.
  const hasMinimap = mapId && mapId !== 'Unknown' && Boolean(MINIMAP_SRC[mapId as MapId])
  const canRender = hasMatch && !isLoading && allEvents.length > 0

  // Zoom / pan
  const [zoom, setZoom] = useState(1)
  const [pan,  setPan]  = useState({ x: 0, y: 0 })
  const dragging   = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const cinematicFrame = useRef<number | null>(null)

  // Tooltip
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  // Hovered player from legend — used to boost opacity on canvas
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null)

  // Redraw whenever data, timeline, or hovered player changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      // If a player is hovered from the legend, temporarily boost their path visibility
      if (hoveredPlayer) {
        const effectivePlayers = players.map(p =>
          p.userId === hoveredPlayer
            ? { ...p, color: p.color }
            : p
        )
        const boostedSelected = new Set(selectedPlayers)
        boostedSelected.add(hoveredPlayer)
        renderFrame(ctx, CANVAS_SIZE, allEvents, effectivePlayers, boostedSelected, cutoffRel, layers)
      } else {
        renderFrame(ctx, CANVAS_SIZE, allEvents, players, selectedPlayers, cutoffRel, layers)
      }
      setRenderError(null)
    } catch (error) {
      console.error('MapCanvas render failed, recovering partial replay', error)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setRenderError('Partial telemetry loaded; some invalid data was skipped.')
    }
  }, [allEvents, players, selectedPlayers, cutoffRel, layers, hoveredPlayer])

  // Zoom
  const applyZoom = useCallback((delta: number) => {
    setZoom(z => Math.max(0.3, Math.min(6, z + delta)))
  }, [])
  const resetView  = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [])
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      applyZoom(e.deltaY < 0 ? 0.2 : -0.2)
      return
    }

    const scrollAmount = Math.sign(e.deltaY) * 24
    setPan(current => ({
      x: current.x + (e.shiftKey ? scrollAmount : 0),
      y: current.y + (e.shiftKey ? 0 : scrollAmount),
    }))
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

  const getEventCanvasPoint = useCallback((ev: ProcessedEvent) => {
    return { x: ev.px, y: ev.py }
  }, [])

  const rendererStats = useMemo(() => {
    const total = allEvents.length
    const valid = allEvents.filter(e => Number.isFinite(e.px) && Number.isFinite(e.py)).length
    const invalid = total - valid
    return { total, valid, invalid }
  }, [allEvents])

  const mapSize = useMemo(() => {
    const base = 720
    const safeZoom = Number.isFinite(zoom) ? zoom : 1
    return Math.max(520, Math.min(1280, Math.round(base * safeZoom)))
  }, [zoom])

  const transform = useMemo(() => {
    const safePanX = Number.isFinite(pan.x) ? pan.x : 0
    const safePanY = Number.isFinite(pan.y) ? pan.y : 0
    return `translate3d(${safePanX}px, ${safePanY}px, 0)`
  }, [pan])

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
      const point = getEventCanvasPoint(ev)
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
      const d = Math.hypot(point.x - mx, point.y - my)
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
  }, [allEvents, cutoffRel, getEventCanvasPoint])

  useEffect(() => {
    if (!cinematicEnabled || dragging.current) return

    const size = CANVAS_SIZE
    const center = size / 2

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const getTarget = () => {
      const recentCombat = allEvents
        .filter(e => e.tsRel <= cutoffRel && e.tsRel >= cutoffRel - 6000)
        .filter(e => e.event === 'Kill' || e.event === 'BotKill' || e.event === 'KilledByStorm')

      if (recentCombat.length > 0) {
        const last = recentCombat[recentCombat.length - 1]
        return { x: last.px, y: last.py, zoom: 1.35 }
      }

      const selectedPositions = players
        .filter(player => selectedPlayers.has(player.userId))
        .map(player => {
          const recent = player.events.filter(e =>
            (e.event === 'Position' || e.event === 'BotPosition') && e.tsRel <= cutoffRel
          )
          return recent.length ? recent[recent.length - 1] : null
        })
        .filter(Boolean) as ProcessedEvent[]

      if (selectedPositions.length > 0) {
        const sum = selectedPositions.reduce((acc, curr) => {
          const point = getEventCanvasPoint(curr)
          return {
            x: acc.x + point.x,
            y: acc.y + point.y,
          }
        }, { x: 0, y: 0 })
        const avg = {
          x: sum.x / selectedPositions.length,
          y: sum.y / selectedPositions.length,
        }
        return { x: avg.x, y: avg.y, zoom: 1.1 }
      }

      return { x: center, y: center, zoom: 1 }
    }

    const target = getTarget()
    if (!target) return

    const step = () => {
      setPan(current => ({
        x: lerp(current.x, center / target.zoom - target.x, 0.08),
        y: lerp(current.y, center / target.zoom - target.y, 0.08),
      }))
      setZoom(current => lerp(current, target.zoom, 0.08))
      cinematicFrame.current = window.requestAnimationFrame(step)
    }

    cinematicFrame.current = window.requestAnimationFrame(step)
    return () => {
      if (cinematicFrame.current != null) {
        window.cancelAnimationFrame(cinematicFrame.current)
        cinematicFrame.current = null
      }
    }
  }, [cinematicEnabled, cutoffRel, allEvents, players, selectedPlayers, getEventCanvasPoint])

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
      {canRender && (
        <div
          className="map-wrap"
          style={{ transform, width: `${mapSize}px`, height: `${mapSize}px` }}
          onMouseDown={onMouseDown}
          onWheel={handleWheel}
        >
          {hasMinimap ? (
            <img
              className="map-img"
              src={MINIMAP_SRC[mapId as MapId]}
              alt={mapId}
              draggable={false}
              key={mapId}  // Force re-render if mapId changes
            />
          ) : (
            <div className="map-fallback" />
          )}

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

          <div className="map-label">{(mapId || 'Unknown').toUpperCase()}</div>
          {renderError && (
            <div className="render-warning">{renderError}</div>
          )}
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
