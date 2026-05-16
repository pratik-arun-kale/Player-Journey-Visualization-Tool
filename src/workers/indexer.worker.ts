/**
 * indexer.worker.ts
 *
 * Web Worker: runs entirely off the main thread.
 * Receives file slice metadata, regex-extracts match metadata, posts progress.
 *
 * Communication protocol:
 *   Main → Worker:  WorkerInMsg
 *   Worker → Main:  WorkerOutMsg
 *
 * IMPORTANT: Map<> is not structured-cloneable. All registries are sent as
 * plain arrays of [key, value] tuples and reconstructed on the main thread.
 */

import {
  extractMetaFromSlice,
  groupFilesIntoMatches,
  type FileSliceMeta,
} from '../utils/matchIndexer'
import type { MatchInfo, MatchMetadata } from '../types'

// ── Message types ─────────────────────────────────────────────────────────────

export interface WorkerInMsg {
  type: 'index'
  /** Metadata + 50 KB slices for each file */
  fileMetas: FileSliceMeta[]
  /** Optional: parsed matches.json array for enrichment */
  matchesJson?: MatchInfo[]
}

export type WorkerOutMsg =
  | { type: 'progress'; entries: [string, MatchMetadata][]; indexed: number; total: number }
  | { type: 'complete'; entries: [string, MatchMetadata][]; indexed: number; total: number }
  | { type: 'error'; message: string }

// ── Worker message handler ────────────────────────────────────────────────────

const BATCH_SIZE = 8

self.onmessage = async (event: MessageEvent<WorkerInMsg>) => {
  const { type, fileMetas, matchesJson } = event.data

  if (type !== 'index') return

  const total = fileMetas.length
  let indexed = 0
  const allExtracted = []

  try {
    // Process files in batches of BATCH_SIZE
    for (let i = 0; i < fileMetas.length; i += BATCH_SIZE) {
      const batch = fileMetas.slice(i, i + BATCH_SIZE)

      for (const meta of batch) {
        try {
          const extracted = extractMetaFromSlice(meta)
          if (extracted) allExtracted.push(extracted)
        } catch (err) {
          // ignore extraction failures for production
        }
        indexed++
      }

      // Yield between batches: build current registry snapshot and post progress
      const currentRegistry = groupFilesIntoMatches(allExtracted, matchesJson)
      const entries = Array.from(currentRegistry.entries())

      const msg: WorkerOutMsg = { type: 'progress', entries, indexed, total }
      self.postMessage(msg)

      // Yield control back to event loop so browser stays responsive
      await new Promise<void>(r => setTimeout(r, 0))
    }

    // Final complete message with full registry
    const finalRegistry = groupFilesIntoMatches(allExtracted, matchesJson)
    const finalEntries = Array.from(finalRegistry.entries())

    const completeMsg: WorkerOutMsg = {
      type: 'complete',
      entries: finalEntries,
      indexed,
      total,
    }
    self.postMessage(completeMsg)

  } catch (err) {
    const errorMsg: WorkerOutMsg = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(errorMsg)
  }
}
