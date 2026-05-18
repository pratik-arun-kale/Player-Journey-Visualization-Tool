import type {
  MatchInfo, PlayerFile, MatchGroup, Player, ProcessedEvent, MapIdOrUnknown
} from '../types'
import {
  parseRealMatchId, isHuman, processEvents,
  normalizeEventsByWorld, playerColor, BOT_COLOR, HUMAN_COLORS
} from './mapUtils'

// ── Build MatchGroup index from matches.json ──────────────────────────────────
// NOTE: mapId starts as 'Unknown' — never defaults to any real map.
// This function is used as an optional enrichment path only.

export function buildMatchGroups(matchIndex: MatchInfo[]): Map<string, MatchGroup> {
  const groups = new Map<string, MatchGroup>()

  for (const entry of matchIndex) {
    const realId = parseRealMatchId(entry.source_file)
    const existing = groups.get(realId)
    const srcName = entry.source_file.replace('.nakama-0', '')
    const firstPart = srcName.split('_')[0]
    const isBot = /^\d+$/.test(firstPart)

    if (!existing) {
      const group: MatchGroup = {
        realMatchId: realId,
        folder: entry.folder,
        mapId: 'Unknown',   // never defaults to any map — confirmed later
        filePaths: [entry.json_file],
        humanCount: isBot ? 0 : 1,
        botCount: isBot ? 1 : 0,
      }
      groups.set(realId, group)
    } else {
      existing.filePaths.push(entry.json_file)
      if (isBot) existing.botCount++
      else existing.humanCount++
    }
  }

  // Sort filePaths in each group for deterministic processing
  for (const group of groups.values()) {
    group.filePaths.sort()
  }

  return groups
}

// ── Process a loaded PlayerFile into Player + events ─────────────────────────

const CANVAS_SIZE = 1024

export function processPlayerFile(
  file: PlayerFile,
  colorIndex: number
): Player {
  const raw = file.events
  if (!raw.length) {
    return { userId: '', isBot: false, color: '#fff', events: [] }
  }

  const withoutRel = processEvents(raw, CANVAS_SIZE)
  if (!withoutRel.length) {
    return { userId: '', isBot: false, color: '#fff', events: [] }
  }

  const userId = withoutRel[0].userId
  const isBot  = !isHuman(userId)
  const color  = playerColor(colorIndex, isBot)
  const tsMin   = Math.min(...withoutRel.map(e => e.tsMs))

  const events: ProcessedEvent[] = withoutRel
    .map(e => ({ ...e, tsRel: e.tsMs - tsMin }))
    .sort((a, b) => a.tsMs - b.tsMs)

  return { userId, isBot, color, events }
}

// ── Detect map using majority voting across all loaded files ───────────────────

function detectMapByMajority(files: PlayerFile[]): MapIdOrUnknown {
  const mapCounts = new Map<string, number>()

  for (const file of files) {
    if (!file.events?.length) continue
    const mapId = file.events[0]?.map_id as string | undefined
    if (!mapId) continue
    mapCounts.set(mapId, (mapCounts.get(mapId) ?? 0) + 1)
  }

  if (mapCounts.size === 0) return 'Unknown'

  // Return map with highest count
  let maxMap: string | undefined
  let maxCount = 0
  for (const [mapId, count] of mapCounts) {
    if (count > maxCount) {
      maxCount = count
      maxMap = mapId
    }
  }

  // Warn if multiple maps detected (consistency check)
  if (mapCounts.size > 1) {
    // silently handle multiple maps in production
  }

  const VALID_MAPS = ['AmbroseValley', 'GrandRift', 'Lockdown'] as const
  if (maxMap && VALID_MAPS.includes(maxMap as typeof VALID_MAPS[number])) {
    return maxMap as MapIdOrUnknown
  }

  return 'Unknown'
}

// ── Merge multiple PlayerFiles into a single match dataset ───────────────────

export interface CoordinateBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  width: number
  height: number
}

export interface MatchData {
  mapId: MapIdOrUnknown
  players: Player[]
  allEvents: ProcessedEvent[]   // merged + globally re-normalised
  durationMs: number
  coordBounds?: CoordinateBounds
}

export function mergeMatchFiles(files: PlayerFile[]): MatchData {
  if (!files.length) {
    return { mapId: 'Unknown', players: [], allEvents: [], durationMs: 0 }
  }

  const processedPlayers = files.map((f) => processPlayerFile(f, -1))
  const players = processedPlayers
    .filter(p => p.events.length > 0)
    // sort: humans first, then bots
    .sort((a, b) => (a.isBot ? 1 : 0) - (b.isBot ? 1 : 0))

  // Reassign colors in final sorted order
  let hi = 0
  for (const p of players) {
    p.color = playerColor(p.isBot ? -1 : hi++, p.isBot)
  }

  // Global normalise: shift all events so the earliest is t=0
  const allRaw = players.flatMap(p => p.events)
  if (!allRaw.length) {
    const detectedMap = detectMapByMajority(files)
    return { mapId: detectedMap, players, allEvents: [], durationMs: 0 }
  }

  const globalMin = Math.min(...allRaw.map(e => e.tsMs))
  const globalMax = Math.max(...allRaw.map(e => e.tsMs))

  // Mutate tsRel on every event to be globally normalised
  for (const p of players) {
    for (const e of p.events) {
      e.tsRel = e.tsMs - globalMin
    }
  }

  const coordBounds = normalizeEventsByWorld(allRaw, CANVAS_SIZE)

  const allEvents = allRaw
    .map(e => ({ ...e, tsRel: e.tsMs - globalMin }))
    .sort((a, b) => a.tsRel - b.tsRel)

  const mapId = detectMapByMajority(files)
  const eventCount = Array.isArray(allEvents) ? allEvents.length : 0
  console.info(
    `loadMatch: loaded ${eventCount} events from ${players.length} players, map=${mapId} ` +
      `(${coordBounds.width.toFixed(1)}x${coordBounds.height.toFixed(1)} bounds)`
  )
  console.log('Detected mapId:', mapId)
  console.log('Events count:', eventCount)

  if (mapId === 'Unknown') {
    // silently handle unknown map in production
  }

  return {
    mapId,
    players,
    allEvents,
    durationMs: globalMax - globalMin,
    coordBounds,
  }
}
