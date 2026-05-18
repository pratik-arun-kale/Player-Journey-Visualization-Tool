import type { Player, ProcessedEvent, MapIdOrUnknown } from '../types'
import type { MatchAnalytics, PlayerAnalytics, MapAnalytics } from './analyticsEngine'
import { computePlayerAnalytics, createEmptyMatchAnalytics } from './analyticsEngine'

export type AnalyticsPhase = 'idle' | 'parsing' | 'metrics' | 'classification' | 'heatmap' | 'done' | 'failed'

export interface AnalyticsProgressUpdate {
  phase: AnalyticsPhase
  progress: number
  message: string
  analytics?: MatchAnalytics
}

const MAX_HEATMAP_EVENTS = 12000
const BASE_GRID_SIZE = 32
const REDUCED_GRID_SIZE = 24

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const cellKey = (x: number, y: number) => `${x}:${y}`

function nextIdle(): Promise<void> {
  return new Promise(resolve => {
    const callback = (window as any).requestIdleCallback || ((fn: FrameRequestCallback) => window.setTimeout(fn, 50))
    callback(resolve, { timeout: 500 })
  })
}

function bucket(position: { x: number; y: number } | { px: number; py: number }, gridSize: number) {
  const cellSize = 1024 / gridSize
  const x = 'x' in position ? position.x : position.px
  const y = 'y' in position ? position.y : position.py
  const bx = clamp(Math.floor(x / cellSize), 0, gridSize - 1)
  const by = clamp(Math.floor(y / cellSize), 0, gridSize - 1)
  return { bx, by }
}

function buildGrid(gridSize: number) {
  const grid: number[][] = []
  for (let y = 0; y < gridSize; y++) {
    grid[y] = new Array(gridSize).fill(0)
  }
  return grid
}

function validCoord(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1024
}

async function computeMapAnalyticsChunked(
  allEvents: ProcessedEvent[],
  onProgress: (update: AnalyticsProgressUpdate) => void
): Promise<MapAnalytics> {
  const rawEvents = allEvents.filter(e => validCoord(e.px) && validCoord(e.py))
  const sampleStep = Math.max(1, Math.ceil(rawEvents.length / MAX_HEATMAP_EVENTS))
  const shouldSample = sampleStep > 1
  const eventsToProcess = shouldSample
    ? rawEvents.filter((_, index) => index % sampleStep === 0)
    : rawEvents
  const gridSize = shouldSample ? REDUCED_GRID_SIZE : BASE_GRID_SIZE

  const movementHeatmap = buildGrid(gridSize)
  const lootHeatmap = buildGrid(gridSize)
  const combatHeatmap = buildGrid(gridSize)
  const eventCells: Record<string, { x: number; y: number; count: number; loot: number; combat: number; score: number }> = {}
  const visitSets: Record<string, Set<string>> = {}

  const chunkSize = 600
  for (let offset = 0; offset < eventsToProcess.length; offset += chunkSize) {
    const chunk = eventsToProcess.slice(offset, offset + chunkSize)

    for (const e of chunk) {
      const { bx, by } = bucket(e, gridSize)
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

    const progress = Math.round((offset + chunk.length) / eventsToProcess.length * 100)
    onProgress({ phase: 'heatmap', progress: 50 + Math.round(progress * 0.45), message: shouldSample ? 'Building reduced heatmaps for large telemetry' : 'Building heatmaps' })
    await nextIdle()
  }

  const cells = Object.values(eventCells).map(cell => ({
    x: cell.x,
    y: cell.y,
    count: cell.count,
    loot: cell.loot,
    combat: cell.combat,
    score: cell.count + cell.loot * 2 + cell.combat * 3,
  }))

  const deadZones = cells
    .filter(cell => movementHeatmap[cell.y][cell.x] === 0)
    .sort((a, b) => a.combat - b.combat || a.loot - b.loot || a.count - b.count)
    .slice(0, 12)

  const hotspots = [...cells]
    .filter(cell => cell.count > 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const underused = cells
    .filter(cell => movementHeatmap[cell.y][cell.x] > 0 && movementHeatmap[cell.y][cell.x] < 4)
    .sort((a, b) => a.count - b.count)
    .slice(0, 12)

  const chokepoints = [...cells]
    .map(cell => ({
      ...cell,
      score: movementHeatmap[cell.y][cell.x] * (visitSets[cellKey(cell.x, cell.y)]?.size || 1),
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
    gridSize,
    deadZones,
    hotspots,
    chokepoints,
    underused,
    movementHeatmap,
    lootHeatmap,
    combatHeatmap,
    summary,
  }
}

export async function generateMatchAnalytics(
  players: Player[] | undefined,
  allEvents: ProcessedEvent[] | undefined,
  durationMs: number,
  mapId: MapIdOrUnknown | undefined,
  onProgress: (update: AnalyticsProgressUpdate) => void
): Promise<MatchAnalytics> {
  onProgress({ phase: 'parsing', progress: 5, message: 'Parsing telemetry and validating data' })
  await nextIdle()

  const safePlayers = Array.isArray(players) ? players.filter(Boolean) : []
  const safeEvents = Array.isArray(allEvents) ? allEvents.filter(Boolean) : []

  if (!safePlayers.length || !safeEvents.length) {
    throw new Error('No telemetry available for analytics.')
  }

  const playerAnalytics: PlayerAnalytics[] = []

  for (let index = 0; index < safePlayers.length; index += 1) {
    const player = safePlayers[index]
    playerAnalytics.push(computePlayerAnalytics(player, safeEvents, durationMs))

    if (index % 2 === 0) {
      const percent = Math.round((index + 1) / safePlayers.length * 100)
      onProgress({ phase: 'metrics', progress: 10 + Math.round(percent * 0.18), message: 'Computing player metrics' })
      await nextIdle()
    }
  }

  onProgress({ phase: 'classification', progress: 30, message: 'Analyzing playstyles and route efficiency' })
  await nextIdle()

  const summary = {
    playerCount: safePlayers.length,
    activePlayers: safePlayers.filter(player => !player.isBot).length,
    totalKills: safeEvents.filter(e => e.event === 'Kill' || e.event === 'BotKill').length,
    totalLoot: safeEvents.filter(e => e.event === 'Loot').length,
    durationMs,
    mapId,
  }

  const emptyAnalytics = createEmptyMatchAnalytics(mapId, durationMs)
  const partialAnalytics: MatchAnalytics = {
    players: playerAnalytics,
    map: emptyAnalytics.map,
    summary,
  }

  onProgress({ phase: 'classification', progress: 35, message: 'Ready with lightweight analytics', analytics: partialAnalytics })
  await nextIdle()

  onProgress({ phase: 'heatmap', progress: 40, message: 'Preparing map overlay data', analytics: partialAnalytics })
  await nextIdle()

  const mapAnalytics = await computeMapAnalyticsChunked(safeEvents, update => {
    if (update.phase === 'heatmap') {
      onProgress(update)
    }
  })

  onProgress({ phase: 'done', progress: 100, message: 'Analytics ready' })
  await nextIdle()

  return { players: playerAnalytics, map: mapAnalytics, summary }
}
