import type { MapId, ProcessedEvent, RawEvent } from '../types'

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
export function worldToPixel(
  x: number,
  z: number,
  mapId: MapId,
  canvasSize = 1024
): [number, number] {
  const cfg = MAP_CONFIG[mapId]
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

export function processEvents(
  rawEvents: RawEvent[],
  canvasSize: number
): Omit<ProcessedEvent, 'tsRel'>[] {
  return rawEvents.map((e) => {
    // Prefer pre-computed map_x/map_y when available and in range;
    // fall back to live calculation (handles different canvas sizes)
    const scale = canvasSize / 1024
    const px = e.map_x != null ? e.map_x * scale : worldToPixel(e.x, e.z, e.map_id, canvasSize)[0]
    const py = e.map_y != null ? e.map_y * scale : worldToPixel(e.x, e.z, e.map_id, canvasSize)[1]

    return {
      userId:  e.user_id,
      isBot:   !isHuman(e.user_id),
      mapId:   e.map_id,
      px,
      py,
      tsMs:    parseTsMs(e.ts),
      event:   e.event,
    }
  })
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
