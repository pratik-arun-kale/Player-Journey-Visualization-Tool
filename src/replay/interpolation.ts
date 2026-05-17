export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

// Find surrounding position events and interpolate to get smooth position at time `ts`
export function interpolatePosition(posEvents: { tsRel: number; px: number; py: number }[], ts: number) {
  if (!posEvents || posEvents.length === 0) return null

  // If before first event
  if (ts <= posEvents[0].tsRel) {
    return { x: posEvents[0].px, y: posEvents[0].py, t: 0 }
  }

  // If after last event
  const last = posEvents[posEvents.length - 1]
  if (ts >= last.tsRel) {
    return { x: last.px, y: last.py, t: 1 }
  }

  // Binary search for interval
  let lo = 0, hi = posEvents.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (posEvents[mid].tsRel === ts) {
      return { x: posEvents[mid].px, y: posEvents[mid].py, t: 0 }
    }
    if (posEvents[mid].tsRel < ts) lo = mid + 1
    else hi = mid - 1
  }

  const i1 = Math.max(0, lo - 1)
  const e1 = posEvents[i1]
  const e2 = posEvents[i1 + 1]
  const span = e2.tsRel - e1.tsRel
  const rawT = span > 0 ? (ts - e1.tsRel) / span : 0
  const t = easeOutCubic(Math.max(0, Math.min(1, rawT)))
  return { x: lerp(e1.px, e2.px, t), y: lerp(e1.py, e2.py, t), t }
}
