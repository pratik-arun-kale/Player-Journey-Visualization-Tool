import type { EventType, MapId, ProcessedEvent, RawEvent } from '../types'

// ── Map configuration (from README) ──────────────────────────────────────────

interface MapCfg {
  scale: number
  ox: number   // origin X (world units)
  oz: number   // origin Z (world units)
}

export const MAP_CONFIG: Record<MapId, MapCfg> = {
  AmbroseValley: { scale: 900,  ox: -370, oz: -473 },
  GrandRift:     { scale: 581,  ox: -290, oz: -290 },
  Lockdown:      { scale: 1000, ox: -500, oz: -500 },
}

/** Source minimap PNGs are 1024×1024. We render on a canvas that can be any
 *  size; callers pass `canvasSize` to scale the result. */
export function isValidMapId(value: unknown): value is MapId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MAP_CONFIG, value)
}

export function getSafeMapId(value: unknown): MapId {
  return isValidMapId(value) ? value : 'AmbroseValley'
}

export function worldToPixel(
  x: number,
  z: number,
  mapId: MapId,
  canvasSize = 1024
): [number, number] {
  const cfg = MAP_CONFIG[mapId]
  if (!cfg) {
    console.warn(`worldToPixel: invalid mapId ${mapId}, defaulting to center`)
    return [canvasSize / 2, canvasSize / 2]
  }
  const u = (x - cfg.ox) / cfg.scale
  const v = (z - cfg.oz) / cfg.scale
  return [u * canvasSize, (1 - v) * canvasSize]
}

// ── Human vs Bot detection ────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isHuman(userId: string): boolean {
  return UUID_RE.test(userId)
}

// ── Filename parsing ──────────────────────────────────────────────────────────

/** Extract the real match UUID from a source filename like
 *  "uuid_matchuuid.nakama-0"  or  "1429_matchuuid.nakama-0" */
export function parseRealMatchId(sourceFile: string): string {
  const name = sourceFile.replace('.nakama-0', '')
  const parts = name.split('_')
  // Bot files: first part is a short numeric id
  if (/^\d+$/.test(parts[0])) return parts.slice(1).join('_')
  // Human files: exactly two UUIDs separated by _
  return parts.length === 2 ? parts[1] : parts.slice(1).join('_')
}

// ── Timestamp parsing ─────────────────────────────────────────────────────────

/** ts strings look like "1970-01-21T11:52:11.207000" — we parse to epoch ms */
export function parseTsMs(ts: string): number {
  return new Date(ts).getTime()
}

// ── Event processing ──────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

const EVENT_NORMALIZATION: Record<string, EventType> = {
  'position': 'Position',
  'botposition': 'BotPosition',
  'kill': 'Kill',
  'botkill': 'BotKill',
  'botkilled': 'BotKill',
  'killed': 'Killed',
  'killedbystorm': 'KilledByStorm',
  'loot': 'Loot',
}

function normalizeEventType(value: unknown): EventType {
  if (typeof value !== 'string') return 'Position'
  const normalized = value.trim().toLowerCase()
  return EVENT_NORMALIZATION[normalized] ?? 'Position'
}

function parseSafeTsMs(ts: unknown, fallbackIndex: number, previousTsMs?: number): number {
  const parsed = typeof ts === 'string' ? Date.parse(ts) : NaN
  if (Number.isFinite(parsed)) return parsed
  if (Number.isFinite(previousTsMs ?? NaN)) return (previousTsMs as number) + 1
  return fallbackIndex * 50
}

export function sanitizeTelemetryData(rawEvents: RawEvent[]): RawEvent[] {
  if (!Array.isArray(rawEvents)) return []

  let invalidCount = 0
  const cleaned: RawEvent[] = []

  for (const e of rawEvents) {
    if (!e || typeof e !== 'object') {
      invalidCount++
      continue
    }

    const x = Number(e.x)
    const z = Number(e.z)
    const userId = typeof e.user_id === 'string' ? e.user_id : ''
    const ts = typeof e.ts === 'string' ? e.ts : ''
    const mapId = isValidMapId(e.map_id) ? e.map_id : getSafeMapId(e.map_id)
    const map_x = Number(e.map_x)
    const map_y = Number(e.map_y)

    const hasPosition = Number.isFinite(x) && Number.isFinite(z)
    const hasMapCoords = Number.isFinite(map_x) && Number.isFinite(map_y)
    const event = normalizeEventType(e.event)

    if (!userId || (!hasPosition && !hasMapCoords)) {
      invalidCount++
      continue
    }

    cleaned.push({
      ...e,
      user_id: userId,
      x,
      z,
      map_id: mapId,
      map_x: hasMapCoords ? map_x : NaN,
      map_y: hasMapCoords ? map_y : NaN,
      event,
      ts,
    })
  }

  if (invalidCount > 0) {
    console.warn(`sanitizeTelemetryData: dropped ${invalidCount} invalid events out of ${rawEvents.length}`)
  }

  return cleaned
}

export function processEvents(
  rawEvents: RawEvent[],
  canvasSize: number
): Omit<ProcessedEvent, 'tsRel'>[] {
  const cleaned = sanitizeTelemetryData(rawEvents)

  let lastTsMs: number | undefined
  return cleaned.map((e, index) => {
    const safeMapId = getSafeMapId(e.map_id)
    const [px, py] = Number.isFinite(e.x) && Number.isFinite(e.z)
      ? worldToPixel(e.x, e.z, safeMapId, canvasSize)
      : [canvasSize / 2, canvasSize / 2]

    const tsMs = parseSafeTsMs(e.ts, index, lastTsMs)
    lastTsMs = tsMs

    return {
      userId:   e.user_id,
      isBot:    !isHuman(e.user_id),
      mapId:    safeMapId,
      worldX:   e.x,
      worldZ:   e.z,
      px,
      py,
      tsMs,
      event:    normalizeEventType(e.event),
    }
  })
}

export interface CoordinateBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  width: number
  height: number
}

export function normalizeEventsByWorld(
  events: ProcessedEvent[],
  canvasSize = 1024
): CoordinateBounds {
  const validWorldXs = events.filter(e => Number.isFinite(e.worldX)).map(e => e.worldX)
  const validWorldZs = events.filter(e => Number.isFinite(e.worldZ)).map(e => e.worldZ)
  const minX = validWorldXs.length ? Math.min(...validWorldXs) : 0
  const maxX = validWorldXs.length ? Math.max(...validWorldXs) : 0
  const minZ = validWorldZs.length ? Math.min(...validWorldZs) : 0
  const maxZ = validWorldZs.length ? Math.max(...validWorldZs) : 0
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxZ - minZ)

  for (const e of events) {
    if (Number.isFinite(e.worldX) && Number.isFinite(e.worldZ)) {
      const xNorm = clamp((e.worldX - minX) / width, 0, 1)
      const zNorm = clamp((e.worldZ - minZ) / height, 0, 1)
      e.px = clamp(xNorm * canvasSize, 0, canvasSize)
      e.py = clamp((1 - zNorm) * canvasSize, 0, canvasSize)
    } else {
      e.px = canvasSize / 2
      e.py = canvasSize / 2
    }
  }

  console.info(`normalizeEventsByWorld: events=${events.length}, bounds=${width.toFixed(1)}x${height.toFixed(1)}`)
  return { minX, maxX, minZ, maxZ, width, height }
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function shortId(userId: string, isBot: boolean): string {
  if (isBot) return `BOT ${userId}`
  return userId.substring(0, 8) + '…'
}

// ── Colour palette ────────────────────────────────────────────────────────────

export const HUMAN_COLORS = [
  '#4d9fff', '#00ffcc', '#ff4daa', '#aaff44',
  '#ffaa00', '#aa44ff', '#00ccff', '#ff8844',
  '#44ffaa', '#ff4466',
]
export const BOT_COLOR = '#ff6b35'

export function playerColor(index: number, isBot: boolean): string {
  if (isBot) return BOT_COLOR
  return HUMAN_COLORS[index % HUMAN_COLORS.length]
}
