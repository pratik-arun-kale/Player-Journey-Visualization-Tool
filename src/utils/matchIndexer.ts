/**
 * matchIndexer.ts
 *
 * Pure utility functions for fast match metadata extraction.
 * These run inside the Web Worker — NO DOM, NO React, NO JSON.parse of full files.
 *
 * Strategy: read only the first 50 KB of each file (a "slice") and
 * regex-extract the lightweight metadata we need for the index.
 */

import type { MatchMetadata, MapIdOrUnknown, MatchInfo } from '../types'
import { parseRealMatchId, isHuman } from './mapUtils'

// ── Constants ─────────────────────────────────────────────────────────────────

const KNOWN_MAPS: readonly string[] = ['AmbroseValley', 'GrandRift', 'Lockdown']

// ── Regex extraction from 50 KB slice ────────────────────────────────────────

export interface FileSliceMeta {
  /** Original file name (basename) */
  name: string
  /** Full path or webkitRelativePath */
  path: string
  /** Folder name extracted from path (e.g. "February_10") */
  folder: string
  /** First 50 KB text content */
  slice: string
}

export interface ExtractedFileMeta {
  name: string
  path: string
  folder: string
  realMatchId: string
  mapId: MapIdOrUnknown
  userId: string
  isBot: boolean
  /** Rough event count (regex hits in first 50 KB — undercount for large files) */
  estimatedEvents: number
}

/**
 * Extract lightweight metadata from a 50 KB file slice using regex only.
 * Never calls JSON.parse. Returns null if file is not a valid player file.
 */
export function extractMetaFromSlice(meta: FileSliceMeta): ExtractedFileMeta | null {
  const { name, path, folder, slice } = meta

  // Must look like a player JSON file (has "events" and "match_info")
  if (!slice.includes('"events"') || !slice.includes('"match_info"')) {
    return null
  }

  // Extract map_id — take the first occurrence
  const mapRaw = slice.match(/"map_id"\s*:\s*"([^"]+)"/)?.[1] ?? ''
  const mapId: MapIdOrUnknown = KNOWN_MAPS.includes(mapRaw)
    ? (mapRaw as MapIdOrUnknown)
    : 'Unknown'

  // Extract user_id — take the first occurrence
  const userId = slice.match(/"user_id"\s*:\s*"([^"]+)"/)?.[1] ?? ''

  if (!userId) return null  // can't group without a user id

  // Extract realMatchId from filename
  let realMatchId: string
  try {
    // Try to get source_file from match_info first
    const sourceFileMatch = slice.match(/"source_file"\s*:\s*"([^"]+)"/)
    if (sourceFileMatch) {
      realMatchId = parseRealMatchId(sourceFileMatch[1])
    } else {
      realMatchId = parseRealMatchId(name)
    }
  } catch {
    realMatchId = parseRealMatchId(name)
  }

  if (!realMatchId) return null

  // Rough event count: count occurrences of `"event":` in the slice
  const estimatedEvents = (slice.match(/"event"\s*:/g) ?? []).length

  return {
    name,
    path,
    folder,
    realMatchId,
    mapId,
    userId,
    isBot: !isHuman(userId),
    estimatedEvents,
  }
}

// ── Group extracted file metas into MatchMetadata entries ─────────────────────

/**
 * Group file-level metadata into per-match MatchMetadata entries.
 *
 * If matchesJson is provided (from matches.json), it is used to:
 *   - Confirm human/bot counts
 *   - Improve folder detection
 * But it is never required — the system works without it.
 */
export function groupFilesIntoMatches(
  fileMetas: ExtractedFileMeta[],
  matchesJson?: MatchInfo[],
): Map<string, MatchMetadata> {
  const registry = new Map<string, MatchMetadata>()

  // Build a quick lookup from matches.json if available
  const jsonLookup = new Map<string, MatchInfo>()
  if (matchesJson) {
    for (const entry of matchesJson) {
      const rid = parseRealMatchId(entry.source_file)
      jsonLookup.set(rid, entry)
    }
  }

  for (const meta of fileMetas) {
    const { realMatchId, mapId, isBot, folder, path, estimatedEvents } = meta

    const existing = registry.get(realMatchId)
    if (!existing) {
      registry.set(realMatchId, {
        realMatchId,
        mapId,                        // 'Unknown' if not detected
        humanCount: isBot ? 0 : 1,
        botCount:   isBot ? 1 : 0,
        folder:     folder || jsonLookup.get(realMatchId)?.folder || 'Unknown',
        totalEvents: estimatedEvents,
        filePaths:  [path],
      })
    } else {
      // Merge into existing group
      existing.filePaths.push(path)
      if (isBot) existing.botCount++
      else existing.humanCount++
      existing.totalEvents += estimatedEvents

      // Upgrade mapId from Unknown if we now have a confirmed value
      if (existing.mapId === 'Unknown' && mapId !== 'Unknown') {
        existing.mapId = mapId
      }
    }
  }

  // Enrich folders from matchesJson where missing
  if (matchesJson) {
    for (const [rid, group] of registry) {
      if (group.folder === 'Unknown') {
        const info = jsonLookup.get(rid)
        if (info?.folder) group.folder = info.folder
      }
    }
  }

  // Sort filePaths deterministically within each group
  for (const group of registry.values()) {
    group.filePaths.sort()
  }

  return registry
}

// ── Folder detection from file path ───────────────────────────────────────────

/** Extract folder name (e.g. "February_10") from a file's webkitRelativePath */
export function folderFromPath(path: string): string {
  // Path looks like: "February_10/someFile.json" or "LILA_GAME/February_10/someFile.json"
  const parts = path.replace(/\\/g, '/').split('/')
  for (const part of parts) {
    if (/^February_\d+$/i.test(part)) return part
  }
  // Fallback: second-to-last segment (parent folder)
  return parts.length >= 2 ? parts[parts.length - 2] : 'Unknown'
}
