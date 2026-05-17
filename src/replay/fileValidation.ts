// Lightweight file validation for replay uploads
export interface InvalidFileReason {
  name: string
  reason: string
}

export function isJsonByName(file: File) {
  return file.name.toLowerCase().endsWith('.json')
}

export function isJsonByMime(file: File) {
  if (!file.type) return false
  return file.type === 'application/json' || file.type === 'text/json'
}

export async function tryParseJson(file: File): Promise<{ ok: boolean; error?: string }>{
  try {
    const txt = await file.text()
    JSON.parse(txt)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function validateReplayFiles(files: File[]) {
  const valid: File[] = []
  const invalid: InvalidFileReason[] = []

  for (const f of files) {
    const byName = isJsonByName(f)
    const byMime = isJsonByMime(f)
    if (!byName && !byMime) {
      invalid.push({ name: f.name, reason: 'Unsupported file type' })
      continue
    }

    // Try parsing to catch corrupted JSON
    const parsed = await tryParseJson(f)
    if (!parsed.ok) {
      invalid.push({ name: f.name, reason: `Failed to parse JSON: ${parsed.error}` })
      // continue without adding to valid
      continue
    }

    valid.push(f)
  }

  return { valid, invalid }
}
