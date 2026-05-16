// ── Raw JSON shapes (as written by the Python pipeline) ──────────────────────

export type MapId = 'AmbroseValley' | 'GrandRift' | 'Lockdown'
export type MapIdOrUnknown = MapId | 'Unknown'

export type EventType =
  | 'Position'
  | 'BotPosition'
  | 'Kill'
  | 'Killed'
  | 'BotKill'
  | 'BotKilled'
  | 'KilledByStorm'
  | 'Loot'

export interface RawEvent {
  user_id: string
  match_id: string
  map_id: MapId
  x: number
  y: number
  z: number
  ts: string        // ISO string e.g. "1970-01-21T11:52:11.207000"
  event: EventType
  map_x: number     // pre-computed pixel X (0–1023)
  map_y: number     // pre-computed pixel Y (0–1023)
}

export interface MatchInfo {
  match_id: string  // user_uuid_match_uuid (combined filename key)
  folder: string    // "February_10" etc.
  source_file: string
  json_file: string
  events_count: number
}

export interface PlayerFile {
  match_info: MatchInfo
  events: RawEvent[]
}

// ── Lightweight metadata — populated immediately during indexing ──────────────
// NOTE: This is extracted via regex from the first 50 KB only. No full parse.

export interface MatchMetadata {
  realMatchId: string
  /** 'Unknown' until confirmed from file content */
  mapId: MapIdOrUnknown
  humanCount: number
  botCount: number
  folder: string
  /** Rough estimate of total events (regex count of first 50 KB slice) */
  totalEvents: number
  /** All file paths belonging to this match */
  filePaths: string[]
}

/** Per-match load state shown on UI cards */
export type MatchLoadState = 'indexed' | 'loading' | 'loaded' | 'error'

// ── Processed / app-level types ──────────────────────────────────────────────

export interface ProcessedEvent {
  userId: string
  isBot: boolean
  mapId: MapId
  /** pixel X on 1024×1024 canvas, from map_x */
  px: number
  /** pixel Y on 1024×1024 canvas, from map_y */
  py: number
  /** absolute ms timestamp parsed from ts string */
  tsMs: number
  /** ms relative to match start (0 = first event) */
  tsRel: number
  event: EventType
}

export interface Player {
  userId: string
  isBot: boolean
  color: string
  /** all events for this player, sorted by tsMs */
  events: ProcessedEvent[]
}

/** Heavy full-parsed match data — only loaded when user opens a match */
export interface MatchFullData {
  realMatchId: string
  mapId: MapIdOrUnknown
  players: Player[]
  allEvents: ProcessedEvent[]
  durationMs: number
}

// ── Legacy group type (kept for dataLoader compatibility) ─────────────────────

export interface MatchGroup {
  /** real match UUID (second part of filename) */
  realMatchId: string
  folder: string
  /** MapId is 'Unknown' until replay files are loaded. Never defaults to AmbroseValley. */
  mapId: MapIdOrUnknown
  /** list of json_file paths belonging to this match */
  filePaths: string[]
  /** human player count */
  humanCount: number
  /** bot count */
  botCount: number
}

// ── Layer / UI state ─────────────────────────────────────────────────────────

export interface Layers {
  paths: boolean
  kills: boolean
  loot: boolean
  storm: boolean
  heatmap: boolean
  bots: boolean
}

export type FilterMap = MapIdOrUnknown | 'all'
export type FilterDate = 'all' | 'February_10' | 'February_11' | 'February_12' | 'February_13' | 'February_14'

// ── Map counts (computed from indexedMatches) ─────────────────────────────────

export interface MapCounts {
  AmbroseValley: number
  GrandRift: number
  Lockdown: number
  Unknown: number
}
