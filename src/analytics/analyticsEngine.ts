import type { Player, ProcessedEvent, MapIdOrUnknown } from '../types'

const GRID_SIZE = 32
const CELL_SIZE = 1024 / GRID_SIZE
const VALID_COORD = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1024
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const normalize = (value: number, min: number, max: number) => max <= min ? 0 : clamp((value - min) / (max - min), 0, 1)
const score = (value: number) => clamp(Math.round(value), 0, 100)

export interface PlayerAnalytics {
  userId: string
  displayName: string
  isBot: boolean
  playstyle: string
  aggressionScore: number
  campingScore: number
  explorerScore: number
  looterScore: number
  speedRunnerScore: number
  totalDistance: number
  avgSpeed: number
  peakSpeed: number
  lootPerMinute: number
  combatPerMinute: number
  routeEfficiency: number
  movementSmoothness: number
  decisionSpeed: number
  lootEfficiency: number
  kills: number
  lootCount: number
  combatCount: number
  idleRatio: number
  coveragePercent: number
  uniqueCells: number
}

export interface HeatmapCell {
  x: number
  y: number
  count: number
  loot: number
  combat: number
  score: number
}

export interface MapAnalytics {
  gridSize: number
  deadZones: HeatmapCell[]
  hotspots: HeatmapCell[]
  chokepoints: HeatmapCell[]
  underused: HeatmapCell[]
  movementHeatmap: number[][]
  lootHeatmap: number[][]
  combatHeatmap: number[][]
  summary: {
    totalEvents: number
    totalLoot: number
    totalCombat: number
    totalVisitCells: number
    deadZoneCount: number
    hotspotCount: number
  }
}

export interface MatchAnalytics {
  players: PlayerAnalytics[]
  map: MapAnalytics
  summary: {
    playerCount: number
    activePlayers: number
    totalKills: number
    totalLoot: number
    durationMs: number
    mapId: MapIdOrUnknown | undefined
  }
}

function toDistance(
  a: { x: number; y: number } | { px: number; py: number },
  b: { x: number; y: number } | { px: number; py: number }
) {
  const ax = 'x' in a ? a.x : a.px
  const ay = 'y' in a ? a.y : a.py
  const bx = 'x' in b ? b.x : b.px
  const by = 'y' in b ? b.y : b.py
  return Math.hypot(ax - bx, ay - by)
}

function bucket(pos: { x: number; y: number } | { px: number; py: number }) {
  const x = 'x' in pos ? pos.x : pos.px
  const y = 'y' in pos ? pos.y : pos.py
  const bx = clamp(Math.floor(x / CELL_SIZE), 0, GRID_SIZE - 1)
  const by = clamp(Math.floor(y / CELL_SIZE), 0, GRID_SIZE - 1)
  return { bx, by }
}

function cellKey(bx: number, by: number) {
  return `${bx}:${by}`
}

function buildGrid() {
  const grid: number[][] = []
  for (let y = 0; y < GRID_SIZE; y++) {
    grid[y] = new Array(GRID_SIZE).fill(0)
  }
  return grid
}

function sortByCount(cells: HeatmapCell[]) {
  return [...cells].sort((a, b) => b.count - a.count)
}

function safeParsePositions(events: ProcessedEvent[]) {
  return events
    .filter(e => (e.event === 'Position' || e.event === 'BotPosition') && VALID_COORD(e.px) && VALID_COORD(e.py))
    .sort((a, b) => a.tsRel - b.tsRel)
}

function computePlayerStyle(scores: Record<string, number>) {
  const ordered = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)

  if (!ordered.length) return 'Unknown'
  const primary = ordered[0]
  const secondary = ordered[1]
  if (scores[primary] >= 60 && scores[secondary] >= 40) {
    return `${primary} ${secondary}`
  }
  return primary
}

function computeRouteEfficiency(
  totalDistance: number,
  start: { x: number; y: number } | { px: number; py: number } | null,
  end: { x: number; y: number } | { px: number; py: number } | null
) {
  if (!start || !end || totalDistance <= 0) return 0
  const direct = toDistance(start, end)
  if (direct === 0) return 0
  return score(normalize(direct / totalDistance, 0, 1) * 100)
}

function computeAverageDelay(actionEvents: ProcessedEvent[], positions: ProcessedEvent[]) {
  if (!actionEvents.length || !positions.length) return 50
  const delays: number[] = []
  let posIndex = 0
  for (const action of actionEvents) {
    while (posIndex < positions.length - 1 && positions[posIndex + 1].tsRel <= action.tsRel) {
      posIndex++
    }
    const pos = positions[posIndex]
    if (!pos) continue
    const dt = action.tsRel - pos.tsRel
    if (dt >= 0 && dt < 10000) delays.push(dt)
  }
  if (!delays.length) return 50
  const avgDelay = delays.reduce((acc, v) => acc + v, 0) / delays.length
  return score(clamp(120 - avgDelay / 40, 0, 100))
}

function computeMovementSmoothness(positions: ProcessedEvent[]) {
  if (positions.length < 3) return 50
  const angles: number[] = []
  for (let i = 2; i < positions.length; i++) {
    const a = positions[i - 2]
    const b = positions[i - 1]
    const c = positions[i]
    const v1 = { x: b.px - a.px, y: b.py - a.py }
    const v2 = { x: c.px - b.px, y: c.py - b.py }
    const mag1 = Math.hypot(v1.x, v1.y)
    const mag2 = Math.hypot(v2.x, v2.y)
    if (mag1 === 0 || mag2 === 0) continue
    const dot = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2)
    const angle = Math.acos(clamp(dot, -1, 1))
    angles.push(angle)
  }
  if (!angles.length) return 70
  const avgAngle = angles.reduce((sum, a) => sum + a, 0) / angles.length
  const percent = 1 - normalize(avgAngle, 0, Math.PI / 2)
  return score(percent * 100)
}

function clusterSize(events: ProcessedEvent[]) {
  if (!events.length) return 0
  const clusters: number[] = []
  for (const e of events) {
    const nearby = events.filter(other =>
      other !== e && Math.hypot(other.px - e.px, other.py - e.py) <= 40 && Math.abs(other.tsRel - e.tsRel) <= 30000
    )
    clusters.push(nearby.length + 1)
  }
  const avg = clusters.reduce((sum, v) => sum + v, 0) / clusters.length
  return avg
}

export function computePlayerAnalytics(player: Player, allEvents: ProcessedEvent[], durationMs: number): PlayerAnalytics {
  const positions = safeParsePositions(player.events)
  const totalTime = Math.max(1, durationMs, positions.length ? positions[positions.length - 1].tsRel - positions[0].tsRel : 1)
  const uniqueCellSet = new Set<string>()
  let totalDistance = 0
  let peakSpeed = 0
  let totalMovingTime = 0
  let idleTime = 0
  let previous = positions[0]
  let lastMoving = positions[0]

  for (let i = 1; i < positions.length; i++) {
    const current = positions[i]
    const dt = current.tsRel - previous.tsRel
    const dist = toDistance(previous, current)
    totalDistance += dist
    if (dt > 0) {
      const speed = dist / (dt / 1000)
      peakSpeed = Math.max(peakSpeed, speed)
      if (dist < 12) {
        idleTime += dt
      } else {
        totalMovingTime += dt
        lastMoving = current
      }
    }
    uniqueCellSet.add(cellKey(bucket(previous).bx, bucket(previous).by))
    previous = current
  }
  if (positions.length) uniqueCellSet.add(cellKey(bucket(positions[positions.length - 1]).bx, bucket(positions[positions.length - 1]).by))

  const lootEvents = player.events.filter(e => e.event === 'Loot')
  const killEvents = player.events.filter(e => e.event === 'Kill' || e.event === 'BotKill')
  const combatEvents = player.events.filter(e => ['Kill', 'BotKill', 'Killed', 'BotKilled', 'KilledByStorm'].includes(e.event))
  const lootsPerMinute = (lootEvents.length / (totalTime / 60000)) || 0
  const combatsPerMinute = (combatEvents.length / (totalTime / 60000)) || 0

  const cluster = clusterSize(lootEvents)
  const decisionSpeed = computeAverageDelay(combatEvents.concat(lootEvents), positions)
  const routeEfficiency = computeRouteEfficiency(totalDistance, positions[0] ?? null, positions[positions.length - 1] ?? null)
  const movementSmoothness = computeMovementSmoothness(positions)
  const avgSpeed = totalDistance / (totalTime / 1000)
  const coverage = clamp(uniqueCellSet.size / (GRID_SIZE * GRID_SIZE), 0, 1)
  const lootEfficiency = totalDistance > 0 ? lootEvents.length / (totalDistance / 1000) : 0

  const aggressionScore = score(Math.min(100, killEvents.length * 22 + combatsPerMinute * 8 + (1 - idleTime / totalTime) * 30))
  const campingScore = score(Math.min(100, idleTime / totalTime * 90 + (1 - coverage) * 40))
  const explorerScore = score(Math.min(100, coverage * 110 + normalize(totalDistance, 0, 1600) * 65 + (1 - idleTime / totalTime) * 20))
  const looterScore = score(Math.min(100, lootsPerMinute * 16 + cluster * 12 + clamp(lootEfficiency * 4, 0, 40)))
  const speedRunnerScore = score(Math.min(100, normalize(avgSpeed, 0, 2.5) * 70 + normalize(peakSpeed, 0, 4) * 30 + coverage * 20))

  const playstyle = computePlayerStyle({
    Aggressive: aggressionScore,
    Camper: campingScore,
    Explorer: explorerScore,
    Looter: looterScore,
    'Speed Runner': speedRunnerScore,
  })

  return {
    userId: player.userId,
    displayName: player.isBot ? `BOT ${player.userId.slice(0, 6)}` : player.userId.slice(0, 8),
    isBot: player.isBot,
    playstyle,
    aggressionScore,
    campingScore,
    explorerScore,
    looterScore,
    speedRunnerScore,
    totalDistance: Math.round(totalDistance),
    avgSpeed: Number(avgSpeed.toFixed(2)),
    peakSpeed: Number(peakSpeed.toFixed(2)),
    lootPerMinute: Number(lootsPerMinute.toFixed(2)),
    combatPerMinute: Number(combatsPerMinute.toFixed(2)),
    routeEfficiency,
    movementSmoothness,
    decisionSpeed,
    lootEfficiency: Number(lootEfficiency.toFixed(2)),
    kills: killEvents.length,
    lootCount: lootEvents.length,
    combatCount: combatEvents.length,
    idleRatio: Number((idleTime / totalTime).toFixed(2)),
    coveragePercent: Number((coverage * 100).toFixed(1)),
    uniqueCells: uniqueCellSet.size,
  }
}

export function computeMapAnalytics(allEvents: ProcessedEvent[]): MapAnalytics {
  const movementHeatmap = buildGrid()
  const lootHeatmap = buildGrid()
  const combatHeatmap = buildGrid()
  const visitSets: Record<string, Set<string>> = {}
  const eventCells: Record<string, HeatmapCell> = {}
  const positions = safeParsePositions(allEvents)

  for (const e of allEvents) {
    if (!VALID_COORD(e.px) || !VALID_COORD(e.py)) continue
    const { bx, by } = bucket({ x: e.px, y: e.py })
    const key = cellKey(bx, by)
    if (!eventCells[key]) {
      eventCells[key] = { x: bx, y: by, count: 0, loot: 0, combat: 0, score: 0 }
    }
    eventCells[key].count += 1
    if (e.event === 'Loot') eventCells[key].loot += 1
    if (['Kill', 'BotKill', 'Killed', 'BotKilled', 'KilledByStorm'].includes(e.event)) eventCells[key].combat += 1
    if (e.event === 'Position' || e.event === 'BotPosition') movementHeatmap[by][bx] += 1
    if (e.event === 'Loot') lootHeatmap[by][bx] += 1
    if (['Kill', 'BotKill', 'Killed', 'BotKilled', 'KilledByStorm'].includes(e.event)) combatHeatmap[by][bx] += 1
    visitSets[key] = visitSets[key] || new Set()
    visitSets[key].add(e.userId)
  }

  const cells = Object.values(eventCells)
  const deadZones = cells.filter(cell => movementHeatmap[cell.y][cell.x] === 0)
    .sort((a, b) => a.combat - b.combat || a.loot - b.loot || a.count - b.count)
    .slice(0, 12)

  const hotspots = sortByCount(cells)
    .filter(cell => cell.count > 3)
    .slice(0, 12)
    .map(cell => ({ ...cell, score: cell.count + cell.loot * 2 + cell.combat * 3 }))

  const underused = cells
    .filter(cell => movementHeatmap[cell.y][cell.x] > 0 && movementHeatmap[cell.y][cell.x] < 4)
    .sort((a, b) => a.count - b.count)
    .slice(0, 12)

  const chokepointCandidates = cells
    .map(cell => ({
      ...cell,
      score: movementHeatmap[cell.y][cell.x] * (visitSets[cellKey(cell.x, cell.y)]?.size || 1)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const summary = {
    totalEvents: allEvents.length,
    totalLoot: allEvents.filter(e => e.event === 'Loot').length,
    totalCombat: allEvents.filter(e => ['Kill', 'BotKill', 'Killed', 'BotKilled', 'KilledByStorm'].includes(e.event)).length,
    totalVisitCells: cells.filter(cell => movementHeatmap[cell.y][cell.x] > 0).length,
    deadZoneCount: deadZones.length,
    hotspotCount: hotspots.length,
  }

  return {
    gridSize: GRID_SIZE,
    deadZones,
    hotspots,
    chokepoints: chokepointCandidates,
    underused,
    movementHeatmap,
    lootHeatmap,
    combatHeatmap,
    summary,
  }
}

export function createEmptyMatchAnalytics(mapId: MapIdOrUnknown | undefined, durationMs: number): MatchAnalytics {
  return {
    players: [],
    map: {
      gridSize: GRID_SIZE,
      deadZones: [],
      hotspots: [],
      chokepoints: [],
      underused: [],
      movementHeatmap: buildGrid(),
      lootHeatmap: buildGrid(),
      combatHeatmap: buildGrid(),
      summary: {
        totalEvents: 0,
        totalLoot: 0,
        totalCombat: 0,
        totalVisitCells: 0,
        deadZoneCount: 0,
        hotspotCount: 0,
      },
    },
    summary: {
      playerCount: 0,
      activePlayers: 0,
      totalKills: 0,
      totalLoot: 0,
      durationMs,
      mapId,
    },
  }
}

export function computeMatchAnalytics(players: Player[] | undefined, allEvents: ProcessedEvent[] | undefined, durationMs: number, mapId: MapIdOrUnknown | undefined): MatchAnalytics {
  if (!Array.isArray(players) || !Array.isArray(allEvents)) {
    console.warn('computeMatchAnalytics: invalid players or events', { players, allEvents })
    return createEmptyMatchAnalytics(mapId, durationMs)
  }

  try {
    const safePlayers = players.filter(Boolean)
    const safeEvents = allEvents.filter(Boolean)
    const playerData = safePlayers.map(player => computePlayerAnalytics(player, safeEvents, durationMs))
    const mapData = computeMapAnalytics(safeEvents)
    const summary = {
      playerCount: safePlayers.length,
      activePlayers: safePlayers.filter(p => !p.isBot).length,
      totalKills: safeEvents.filter(e => e.event === 'Kill' || e.event === 'BotKill').length,
      totalLoot: safeEvents.filter(e => e.event === 'Loot').length,
      durationMs,
      mapId,
    }
    return { players: playerData, map: mapData, summary }
  } catch (error) {
    console.error('computeMatchAnalytics: failed to compute analytics', error)
    return createEmptyMatchAnalytics(mapId, durationMs)
  }
}
