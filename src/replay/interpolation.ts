export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

// Find surrounding position events and interpolate to get smooth position at time `ts`
function getPoint(pos: { px: number; py: number }) {
  return { x: pos.px, y: pos.py }
}

export function interpolatePosition(
  posEvents: { tsRel: number; px: number; py: number }[],
  ts: number
) {
  if (!posEvents || posEvents.length === 0) return null

  // If before first event
  if (ts <= posEvents[0].tsRel) {
    const firstPoint = getPoint(posEvents[0])
    return { x: firstPoint.x, y: firstPoint.y, t: 0 }
  }

  // If after last event
  const last = posEvents[posEvents.length - 1]
  if (ts >= last.tsRel) {
    const lastPoint = getPoint(last)
    return { x: lastPoint.x, y: lastPoint.y, t: 1 }
  }

  // Binary search for interval
  let lo = 0, hi = posEvents.length - 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (posEvents[mid].tsRel === ts) {
      const midPoint = getPoint(posEvents[mid])
      return { x: midPoint.x, y: midPoint.y, t: 0 }
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
  const p1 = getPoint(e1)
  const p2 = getPoint(e2)
  return { x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t), t }
}
