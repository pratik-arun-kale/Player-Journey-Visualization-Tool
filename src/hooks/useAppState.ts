import { useReducer, useCallback } from 'react'
import type {
  MatchMetadata, MatchFullData, Player, ProcessedEvent,
  Layers, FilterMap, FilterDate, MapIdOrUnknown, MatchLoadState,
  MapCounts,
} from '../types'

// ── LRU cache constant ────────────────────────────────────────────────────────

const MAX_LOADED_MATCHES = 10

// ── State shape ───────────────────────────────────────────────────────────────

export interface AppState {
  // ── Stage 1: Fast index (available immediately after upload) ──────────────
  indexedMatches: Map<string, MatchMetadata>   // realMatchId → lightweight metadata
  indexingState: 'idle' | 'indexing' | 'done'
  indexedCount: number
  totalFileCount: number

  // ── Stage 2: Full data cache (LRU, max 10) ────────────────────────────────
  loadedMatches: Map<string, MatchFullData>    // realMatchId → heavy parsed data
  loadedMatchOrder: string[]                   // LRU order: oldest first

  // ── Per-match load state (drives UI card badges) ──────────────────────────
  matchLoadStates: Map<string, MatchLoadState>

  // ── Filters ───────────────────────────────────────────────────────────────
  filterMap:  FilterMap
  filterDate: FilterDate

  // ── Active match view ─────────────────────────────────────────────────────
  activeMatchId: string | null
  mapId: MapIdOrUnknown | undefined
  players: Player[]
  allEvents: ProcessedEvent[]
  durationMs: number
  selectedPlayers: Set<string>
  isLoadingMatch: boolean

  // ── Layers ────────────────────────────────────────────────────────────────
  layers: Layers

  // ── Timeline ──────────────────────────────────────────────────────────────
  timelineCurrent: number
  isPlaying: boolean
  playSpeed: number

  // ── UI ────────────────────────────────────────────────────────────────────
  status: string
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type Action =
  // Indexing lifecycle
  | { type: 'INDEX_START'; total: number }
  | { type: 'INDEX_PROGRESS'; entries: [string, MatchMetadata][]; indexed: number; total: number }
  | { type: 'INDEX_COMPLETE'; entries: [string, MatchMetadata][]; indexed: number; total: number }
  // Per-match load state
  | { type: 'SET_MATCH_LOAD_STATE'; realMatchId: string; loadState: MatchLoadState }
  // Full match cache (LRU)
  | { type: 'CACHE_FULL_MATCH'; realMatchId: string; data: MatchFullData }
  // Active match view
  | { type: 'START_LOADING_MATCH' }
  | { type: 'LOAD_MATCH'; matchId: string; players: Player[]; allEvents: ProcessedEvent[]; durationMs: number; mapId: MapIdOrUnknown | undefined }
  // Filters
  | { type: 'SET_FILTER_MAP';  value: FilterMap }
  | { type: 'SET_FILTER_DATE'; value: FilterDate }
  // Player selection
  | { type: 'TOGGLE_PLAYER';       userId: string }
  | { type: 'SELECT_ALL_PLAYERS' }
  | { type: 'DESELECT_ALL_PLAYERS' }
  // Layers
  | { type: 'TOGGLE_LAYER'; layer: keyof Layers }
  // Timeline
  | { type: 'SET_TIMELINE';   ms: number }
  | { type: 'SET_PLAYING';    value: boolean }
  | { type: 'SET_PLAY_SPEED'; value: number }
  // Status
  | { type: 'SET_STATUS'; value: string }

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {

    case 'INDEX_START':
      return {
        ...state,
        indexingState: 'indexing',
        indexedCount: 0,
        totalFileCount: action.total,
        indexedMatches: new Map(),
        status: `INDEXING 0 / ${action.total} FILES…`,
      }

    case 'INDEX_PROGRESS': {
      const registry = new Map<string, MatchMetadata>(action.entries)
      return {
        ...state,
        indexedMatches: registry,
        indexedCount: action.indexed,
        totalFileCount: action.total,
        status: `INDEXING ${action.indexed} / ${action.total} FILES…`,
      }
    }

    case 'INDEX_COMPLETE': {
      const registry = new Map<string, MatchMetadata>(action.entries)
      return {
        ...state,
        indexedMatches: registry,
        indexingState: 'done',
        indexedCount: action.indexed,
        totalFileCount: action.total,
        status: `READY — ${registry.size} MATCHES INDEXED`,
      }
    }

    case 'SET_MATCH_LOAD_STATE': {
      const newStates = new Map(state.matchLoadStates)
      newStates.set(action.realMatchId, action.loadState)
      return { ...state, matchLoadStates: newStates }
    }

    case 'CACHE_FULL_MATCH': {
      const newLoaded = new Map(state.loadedMatches)
      const newOrder = [...state.loadedMatchOrder]

      // Remove if already in cache (refresh LRU position)
      const existingIdx = newOrder.indexOf(action.realMatchId)
      if (existingIdx !== -1) newOrder.splice(existingIdx, 1)

      // Add to end (most recently used)
      newOrder.push(action.realMatchId)
      newLoaded.set(action.realMatchId, action.data)

      // Evict oldest if over limit
      while (newOrder.length > MAX_LOADED_MATCHES) {
        const evict = newOrder.shift()!
        newLoaded.delete(evict)
      }

      return { ...state, loadedMatches: newLoaded, loadedMatchOrder: newOrder }
    }

    case 'SET_FILTER_MAP':
      return { ...state, filterMap: action.value }

    case 'SET_FILTER_DATE':
      return { ...state, filterDate: action.value }

    case 'START_LOADING_MATCH':
      return {
        ...state,
        isLoadingMatch: true,
        activeMatchId: null,
        mapId: undefined,
        players: [],
        allEvents: [],
        durationMs: 0,
        selectedPlayers: new Set(),
        timelineCurrent: 0,
        isPlaying: false,
      }

    case 'LOAD_MATCH':
      return {
        ...state,
        isLoadingMatch: false,
        activeMatchId: action.matchId,
        players: action.players,
        allEvents: action.allEvents,
        durationMs: action.durationMs,
        mapId: action.mapId,
        selectedPlayers: new Set(action.players.map(p => p.userId)),
        timelineCurrent: action.durationMs,
        isPlaying: false,
      }

    case 'TOGGLE_PLAYER': {
      const sel = new Set(state.selectedPlayers)
      if (sel.has(action.userId)) sel.delete(action.userId)
      else sel.add(action.userId)
      return { ...state, selectedPlayers: sel }
    }

    case 'SELECT_ALL_PLAYERS':
      return { ...state, selectedPlayers: new Set(state.players.map(p => p.userId)) }

    case 'DESELECT_ALL_PLAYERS':
      return { ...state, selectedPlayers: new Set() }

    case 'TOGGLE_LAYER':
      return {
        ...state,
        layers: { ...state.layers, [action.layer]: !state.layers[action.layer] },
      }

    case 'SET_TIMELINE':
      return { ...state, timelineCurrent: Math.max(0, Math.min(state.durationMs, action.ms)) }

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.value }

    case 'SET_PLAY_SPEED':
      return { ...state, playSpeed: action.value }

    case 'SET_STATUS':
      return { ...state, status: action.value }

    default:
      return state
  }
}

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL: AppState = {
  indexedMatches: new Map(),
  indexingState: 'idle',
  indexedCount: 0,
  totalFileCount: 0,

  loadedMatches: new Map(),
  loadedMatchOrder: [],
  matchLoadStates: new Map(),

  filterMap:   'all',
  filterDate:  'all',

  activeMatchId: null,
  mapId: undefined,
  players: [],
  allEvents: [],
  durationMs: 0,
  selectedPlayers: new Set(),
  isLoadingMatch: false,

  layers: {
    paths:   true,
    kills:   true,
    loot:    true,
    storm:   true,
    heatmap: true,
    bots:    true,
  },

  timelineCurrent: 0,
  isPlaying: false,
  playSpeed: 1,
  status: 'STANDBY',
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  /**
   * Filtered list of matches — reads from indexedMatches (Stage 1 index).
   * Available immediately after upload without any match being clicked.
   */
  const filteredMatches = useCallback((): MatchMetadata[] => {
    let groups = [...state.indexedMatches.values()]
    if (state.filterMap !== 'all')  groups = groups.filter(g => g.mapId === state.filterMap)
    if (state.filterDate !== 'all') groups = groups.filter(g => g.folder === state.filterDate)
    // Sort: most players first
    return groups.sort((a, b) => (b.humanCount + b.botCount) - (a.humanCount + a.botCount))
  }, [state.indexedMatches, state.filterMap, state.filterDate])

  /**
   * Map counts computed from the full indexedMatches registry (not filtered).
   * Used by MatchList to show e.g. "Ambrose Valley (142)".
   */
  const mapCounts = useCallback((): MapCounts => {
    const counts: MapCounts = { AmbroseValley: 0, GrandRift: 0, Lockdown: 0, Unknown: 0 }
    for (const m of state.indexedMatches.values()) {
      if (m.mapId in counts) counts[m.mapId as keyof MapCounts]++
      else counts.Unknown++
    }
    return counts
  }, [state.indexedMatches])

  return { state, dispatch, filteredMatches, mapCounts }
}
