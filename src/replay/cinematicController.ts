import type { ProcessedEvent } from '../types'
import { isSlowMotionTrigger } from './eventFeedStore'

interface Options {
  dispatch: (a: any) => void
  events: ProcessedEvent[]
  getPlaySpeed: () => number
  cinematicEnabled: () => boolean
}

export function createCinematicController(opts: Options) {
  const lastTrigger = { ts: -Infinity }
  let restoreTimeout: number | null = null

  function clearRestore() {
    if (restoreTimeout != null) {
      window.clearTimeout(restoreTimeout)
      restoreTimeout = null
    }
  }

  function rampSpeed(from: number, to: number, duration: number) {
    const start = performance.now()
    let frameId: number | null = null

    const step = (timestamp: number) => {
      const t = Math.min(1, (timestamp - start) / duration)
      const eased = 1 - Math.pow(1 - t, 2)
      opts.dispatch({ type: 'SET_PLAY_SPEED', value: from + (to - from) * eased })
      if (t < 1) frameId = window.requestAnimationFrame(step)
    }

    window.cancelAnimationFrame(frameId ?? 0)
    frameId = window.requestAnimationFrame(step)
    return () => { if (frameId != null) window.cancelAnimationFrame(frameId) }
  }

  function onTimeUpdate(prevTs: number, nowTs: number) {
    if (!opts.cinematicEnabled()) return
    const evs = opts.events.filter(e => e.tsRel > prevTs && e.tsRel <= nowTs)
    for (const e of evs) {
      if (isSlowMotionTrigger(e)) {
        const now = performance.now()
        if (now - lastTrigger.ts < 3000) continue
        lastTrigger.ts = now

        const original = opts.getPlaySpeed()
        const target = 0.15
        clearRestore()
        const cancelRamp = rampSpeed(original, target, 180)

        restoreTimeout = window.setTimeout(() => {
          cancelRamp()
          rampSpeed(target, original, 200)
          restoreTimeout = null
        }, 2000)

        break
      }
    }
  }

  function dispose() { clearRestore() }

  return { onTimeUpdate, dispose }
}
