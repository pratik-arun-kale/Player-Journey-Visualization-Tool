import { useCallback, useRef } from 'react'
import type { MatchInfo, PlayerFile, MatchFullData } from '../types'
import { mergeMatchFiles } from '../utils/dataLoader'
import { folderFromPath } from '../utils/matchIndexer'
import type { AppState, Action } from './useAppState'
import type { WorkerInMsg, WorkerOutMsg } from '../workers/indexer.worker'

type Dispatch = (action: Action) => void

// How many bytes to read for fast indexing (50 KB is enough to capture events[0])
const INDEX_SLICE_BYTES = 50_000

export function useFileLoader(state: AppState, dispatch: Dispatch) {
  /**
   * Persistent ref to raw File objects, keyed by every path variant.
   * NOT in React state — avoids re-renders when file cache changes.
   * Used only during full match load (on match click).
   */
  const fileMapRef = useRef<Map<string, File>>(new Map())

  /**
   * Active worker ref — terminated and replaced on each new upload.
   */
  const workerRef = useRef<Worker | null>(null)

  // ── Main upload handler ───────────────────────────────────────────────────

  const loadFiles = useCallback(async (files: File[]) => {
    // Terminate any previous worker
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }

    const jsonFiles = files.filter(f => f.name.endsWith('.json'))
    if (!jsonFiles.length) return

    dispatch({ type: 'INDEX_START', total: jsonFiles.length })

    // Reset file map
    fileMapRef.current = new Map()

    // Collect all file objects into the ref map under every path variant
    // so loadMatch() can look them up by any key format
    for (const file of jsonFiles) {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      fileMapRef.current.set(file.name, file)
      fileMapRef.current.set(path, file)
      fileMapRef.current.set(path.replace(/\\/g, '/'), file)
      fileMapRef.current.set(path.replace(/\//g, '\\'), file)
    }

    // Separate matches.json (small, parse fully) from player files
    let matchesJson: MatchInfo[] | undefined
    const playerFiles: File[] = []

    for (const file of jsonFiles) {
      if (file.name === 'matches.json') {
        try {
          const text = await file.text()
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed) && parsed.length > 0 && 'json_file' in parsed[0]) {
            matchesJson = parsed as MatchInfo[]
            // parsed successfully
          }
        } catch {
          // silently continue without matches.json
        }
        continue
      }
      playerFiles.push(file)
    }

    // Read only the first INDEX_SLICE_BYTES of each player file
    // This is MUCH faster than full JSON.parse and sufficient for metadata extraction
    const fileMetas = await Promise.all(
      playerFiles.map(async (file) => {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        const folder = folderFromPath(path)
        const slice = await file.slice(0, INDEX_SLICE_BYTES).text()
        return { name: file.name, path, folder, slice }
      })
    )

    // Launch Web Worker
    const worker = new Worker(
      new URL('../workers/indexer.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerOutMsg>) => {
      const msg = event.data

      if (msg.type === 'progress') {
        dispatch({
          type: 'INDEX_PROGRESS',
          entries: msg.entries,
          indexed: msg.indexed,
          total: msg.total,
        })
      } else if (msg.type === 'complete') {
        dispatch({
          type: 'INDEX_COMPLETE',
          entries: msg.entries,
          indexed: msg.indexed,
          total: msg.total,
        })
        worker.terminate()
        workerRef.current = null
      } else if (msg.type === 'error') {
        // log error internally or leave out of production console
        dispatch({ type: 'SET_STATUS', value: `⚠ INDEXING ERROR: ${msg.message}` })
        worker.terminate()
        workerRef.current = null
      }
    }

    worker.onerror = (err) => {
      // uncaught worker error
      dispatch({ type: 'SET_STATUS', value: '⚠ WORKER ERROR — see console' })
    }

    const msg: WorkerInMsg = { type: 'index', fileMetas, matchesJson }
    worker.postMessage(msg)

  }, [dispatch])

  // ── Match full-load handler ───────────────────────────────────────────────

  const loadMatch = useCallback(async (realMatchId: string) => {
    // Check LRU cache first — instant if already loaded
    const cached = state.loadedMatches.get(realMatchId)
    if (cached) {
      // cache hit
      dispatch({ type: 'START_LOADING_MATCH' })
      dispatch({
        type: 'LOAD_MATCH',
        matchId: realMatchId,
        players: cached.players,
        allEvents: cached.allEvents,
        durationMs: cached.durationMs,
        mapId: cached.mapId,
      })
      return
    }

    const metadata = state.indexedMatches.get(realMatchId)
    if (!metadata) {
      // match not in index
      return
    }

    dispatch({ type: 'START_LOADING_MATCH' })
    dispatch({ type: 'SET_MATCH_LOAD_STATE', realMatchId, loadState: 'loading' })
    dispatch({ type: 'SET_STATUS', value: 'LOADING MATCH…' })

    // Resolve raw File objects for this match's file paths
    const playerFileDatas: PlayerFile[] = []
    const missing: string[] = []

    for (const fp of metadata.filePaths) {
      const basename = fp.split('/').pop()!
      const file = (
        fileMapRef.current.get(fp) ??
        fileMapRef.current.get(basename) ??
        fileMapRef.current.get(fp.replace(/\//g, '\\')) ??
        fileMapRef.current.get(fp.replace(/\\/g, '/'))
      )

      if (!file) {
        // file not in cache
        missing.push(basename)
        continue
      }

      try {
        // FULL JSON.parse happens ONLY here — on match click
        const text = await file.text()
        const parsed = JSON.parse(text) as PlayerFile
        if (parsed?.events?.length) {
          playerFileDatas.push(parsed)
        } else {
          // no events in file
          missing.push(basename)
        }
      } catch {
        // failed to parse file
        missing.push(basename)
      }
    }

    if (!playerFileDatas.length) {
      dispatch({ type: 'SET_MATCH_LOAD_STATE', realMatchId, loadState: 'error' })
      dispatch({
        type: 'SET_STATUS',
        value: `⚠ NO DATA FOR MATCH — ${missing.length} files missing`,
      })
      dispatch({
        type: 'LOAD_MATCH',
        matchId: realMatchId,
        players: [],
        allEvents: [],
        durationMs: 0,
        mapId: metadata.mapId,
      })
      return
    }

    // Full merge + event processing
    const { mapId, players, allEvents, durationMs } = mergeMatchFiles(playerFileDatas)

    // processed match successfully

    // Build full data object and store in LRU cache
    const fullData: MatchFullData = {
      realMatchId,
      mapId,
      players,
      allEvents,
      durationMs,
    }

    dispatch({ type: 'CACHE_FULL_MATCH', realMatchId, data: fullData })
    dispatch({ type: 'SET_MATCH_LOAD_STATE', realMatchId, loadState: 'loaded' })

    dispatch({
      type: 'LOAD_MATCH',
      matchId: realMatchId,
      players,
      allEvents,
      durationMs,
      mapId,
    })

    const statusMsg = missing.length > 0
      ? `LOADED (⚠ ${missing.length} FILES MISSING)`
      : `LOADED · ${players.filter(p => !p.isBot).length}H · ${players.filter(p => p.isBot).length}B`
    dispatch({ type: 'SET_STATUS', value: statusMsg })

  }, [state.indexedMatches, state.loadedMatches, dispatch])

  return { loadFiles, loadMatch }
}
