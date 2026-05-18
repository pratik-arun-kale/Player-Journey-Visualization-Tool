import type { ProcessedEvent, Player, Layers } from '../types'
import { interpolatePosition } from '../replay/interpolation'

const CANVAS_SIZE = 1024

function getCanvasPoint(e: ProcessedEvent) {
  return { x: e.px, y: e.py }
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  events: ProcessedEvent[],
  size: number
) {
  const posEvents = events
    .filter(e => e.event === 'Position' || e.event === 'BotPosition')
    .map(getCanvasPoint)
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))

  if (posEvents.length < 5) return

  const GRID = 40
  const cellW = size / GRID
  const cellH = size / GRID
  const scale = size / CANVAS_SIZE
  const grid = new Float32Array(GRID * GRID)

  for (const point of posEvents) {
    const gx = Math.floor((point.x * scale) / cellW)
    const gy = Math.floor((point.y * scale) / cellH)
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue
    const ix = Math.max(0, Math.min(GRID - 1, gx))
    const iy = Math.max(0, Math.min(GRID - 1, gy))
    grid[iy * GRID + ix]++
  }

  // Gaussian blur pass (3x3 box)
  const blurred = new Float32Array(GRID * GRID)
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0, count = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = gy + dy, nx = gx + dx
          if (ny >= 0 && ny < GRID && nx >= 0 && nx < GRID) {
            sum += grid[ny * GRID + nx]; count++
          }
        }
      }
      blurred[gy * GRID + gx] = sum / count
    }
  }

  const maxVal = Math.max(...Array.from(blurred))
  if (maxVal === 0) return

  ctx.save()
  ctx.globalAlpha = 0.38
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const val = blurred[gy * GRID + gx] / maxVal
      if (val < 0.06) continue
      // blue → cyan → yellow → red
      const r = val > 0.5 ? 255 : Math.round(val * 2 * 255)
      const g = val < 0.5 ? Math.round(val * 2 * 200) : Math.round((1 - (val - 0.5) * 2) * 200)
      const b = val < 0.5 ? 255 : 0
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1)
    }
  }
  ctx.restore()
}

// ── Player paths ──────────────────────────────────────────────────────────────

export function drawPaths(
  ctx: CanvasRenderingContext2D,
  players: Player[],
  selectedPlayers: Set<string>,
  cutoffRel: number,
  showBots: boolean,
  size: number
) {
  const scale = size / CANVAS_SIZE
  for (const player of players) {
    if (!selectedPlayers.has(player.userId)) continue
    if (player.isBot && !showBots) continue
    const posEvents = player.events
      .filter(e => e.event === 'Position' || e.event === 'BotPosition')
      .map(e => ({
        tsRel: e.tsRel,
        px: getCanvasPoint(e).x,
        py: getCanvasPoint(e).y,
      }))
      .filter(p => Number.isFinite(p.px) && Number.isFinite(p.py))

    if (posEvents.length < 1) continue

    const current = interpolatePosition(posEvents, cutoffRel)
    const pathPoints: { x: number; y: number }[] = []
    for (const p of posEvents) {
      if (p.tsRel <= cutoffRel) {
        pathPoints.push({ x: p.px * scale, y: p.py * scale })
      } else break
    }
    if (current && Number.isFinite(current.x) && Number.isFinite(current.y)) {
      pathPoints.push({ x: current.x * scale, y: current.y * scale })
    }

    if (pathPoints.length < 2) continue

    ctx.save()
    ctx.beginPath()
    ctx.strokeStyle = player.color
    ctx.lineWidth   = player.isBot ? 1 : 2
    ctx.globalAlpha = player.isBot ? 0.25 : 0.75
    ctx.lineJoin    = 'round'
    ctx.lineCap     = 'round'

    ctx.moveTo(pathPoints[0].x, pathPoints[0].y)
    for (let i = 1; i < pathPoints.length; i++) {
      ctx.lineTo(pathPoints[i].x, pathPoints[i].y)
    }
    ctx.stroke()

    // Current interpolated dot with glow
    const r = player.isBot ? 4 : 7
    ctx.globalAlpha = 1
    ctx.beginPath()
    const last = pathPoints[pathPoints.length - 1]
    ctx.arc(last.x, last.y, r, 0, Math.PI * 2)
    ctx.fillStyle    = player.color
    ctx.shadowColor  = player.color
    ctx.shadowBlur   = 12
    ctx.fill()
    ctx.restore()
  }
}

// ── Event markers ─────────────────────────────────────────────────────────────

const MARKER_SIZE = 7

export function drawEventMarkers(
  ctx: CanvasRenderingContext2D,
  events: ProcessedEvent[],
  layers: Layers,
  size: number,
  cutoffRel: number
) {
  const scale = size / CANVAS_SIZE
  const nonPos = events.filter(
    e => e.event !== 'Position' && e.event !== 'BotPosition'
  )

  for (const e of nonPos) {
    const point = getCanvasPoint(e)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const x = point.x * scale
    const y = point.y * scale
    ctx.save()

    // Persistence / fade logic
    const age = Math.max(0, cutoffRel - e.tsRel)
    const DUR_KILL = 10000
    const DUR_LOOT = 5000
    const DUR_STORM = 10000
    let dur = 8000
    if (e.event === 'Loot') dur = DUR_LOOT
    if (e.event === 'KilledByStorm') dur = DUR_STORM
    if (e.event === 'Kill' || e.event === 'BotKill') dur = DUR_KILL

    const progress = Math.min(1, age / dur)
    const alpha = Math.max(0.16, 1 - progress)
    ctx.globalAlpha = alpha

    const pulse = e.event === 'Kill' || e.event === 'BotKill'
      ? 1 + Math.sin(Math.min(age, 1200) / 160) * 0.18
      : 1

    switch (e.event) {
      case 'Kill':
      case 'BotKill': {
        if (!layers.kills) break
        const c = '#ff3333'
        ctx.strokeStyle = c
        ctx.fillStyle   = 'rgba(255,51,51,0.18)'
        ctx.lineWidth   = 2
        ctx.shadowColor = c
        ctx.shadowBlur  = 12
        ctx.beginPath()
        ctx.arc(x, y, MARKER_SIZE * pulse, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        // ✕ cross
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(x - 4 * pulse, y - 4 * pulse); ctx.lineTo(x + 4 * pulse, y + 4 * pulse)
        ctx.moveTo(x + 4 * pulse, y - 4 * pulse); ctx.lineTo(x - 4 * pulse, y + 4 * pulse)
        ctx.stroke()
        break
      }
      case 'Killed':
      case 'BotKilled': {
        if (!layers.kills) break
        const c = '#ff6666'
        ctx.fillStyle   = c
        ctx.strokeStyle = 'rgba(255,51,51,0.5)'
        ctx.lineWidth   = 1.5
        ctx.shadowColor = c
        ctx.shadowBlur  = 6
        ctx.beginPath()
        ctx.arc(x, y, MARKER_SIZE - 1, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        break
      }
      case 'KilledByStorm': {
        if (!layers.storm) break
        const c = '#bf5fff'
        ctx.fillStyle  = c
        ctx.shadowColor = c
        ctx.shadowBlur  = 14
        // ◆ diamond
        ctx.beginPath()
        ctx.moveTo(x,              y - MARKER_SIZE - 1)
        ctx.lineTo(x + MARKER_SIZE, y)
        ctx.lineTo(x,              y + MARKER_SIZE + 1)
        ctx.lineTo(x - MARKER_SIZE, y)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'Loot': {
        if (!layers.loot) break
        const c = '#ffd700'
        ctx.fillStyle  = c
        ctx.shadowColor = c
        ctx.shadowBlur  = 7
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.PI / 4)
        ctx.fillRect(-(MARKER_SIZE - 2), -(MARKER_SIZE - 2), (MARKER_SIZE - 2) * 2, (MARKER_SIZE - 2) * 2)
        ctx.restore()
        break
      }
    }
    ctx.restore()
  }
}

// ── Main draw call ─────────────────────────────────────────────────────────────

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  allEvents: ProcessedEvent[],
  players: Player[],
  selectedPlayers: Set<string>,
  cutoffRel: number,
  layers: Layers
) {
  ctx.clearRect(0, 0, canvasSize, canvasSize)

  const visible = allEvents.filter(
    e =>
      selectedPlayers.has(e.userId) &&
      e.tsRel <= cutoffRel &&
      (e.isBot ? layers.bots : true)
  )

  if (layers.heatmap) {
    drawHeatmap(ctx, visible, canvasSize)
  }

  if (layers.paths) {
    drawPaths(ctx, players, selectedPlayers, cutoffRel, layers.bots, canvasSize)
  }

  drawEventMarkers(ctx, visible, layers, canvasSize, cutoffRel)
}
