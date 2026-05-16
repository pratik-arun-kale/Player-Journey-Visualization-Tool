import { useEffect, useRef, useCallback } from 'react'
import type { Action } from './useAppState'

type Dispatch = (action: Action) => void

export function usePlayback(
  isPlaying: boolean,
  timelineCurrent: number,
  durationMs: number,
  playSpeed: number,
  dispatch: Dispatch
) {
  const rafRef    = useRef<number>(0)
  const lastTsRef = useRef<number>(0)
  const stateRef  = useRef({ isPlaying, timelineCurrent, durationMs, playSpeed })

  // Keep ref in sync so the RAF loop always sees latest values
  stateRef.current = { isPlaying, timelineCurrent, durationMs, playSpeed }

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    lastTsRef.current = performance.now()

    function tick(now: number) {
      const dt = (now - lastTsRef.current) * stateRef.current.playSpeed
      lastTsRef.current = now
      const next = stateRef.current.timelineCurrent + dt

      if (next >= stateRef.current.durationMs) {
        dispatch({ type: 'SET_TIMELINE', ms: stateRef.current.durationMs })
        dispatch({ type: 'SET_PLAYING', value: false })
        return
      }
      dispatch({ type: 'SET_TIMELINE', ms: next })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, dispatch])

  const play = useCallback(() => {
    if (timelineCurrent >= durationMs) dispatch({ type: 'SET_TIMELINE', ms: 0 })
    dispatch({ type: 'SET_PLAYING', value: true })
  }, [timelineCurrent, durationMs, dispatch])

  const pause = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', value: false })
  }, [dispatch])

  const rewind = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', value: false })
    dispatch({ type: 'SET_TIMELINE', ms: 0 })
  }, [dispatch])

  const seek = useCallback((ms: number) => {
    dispatch({ type: 'SET_TIMELINE', ms })
  }, [dispatch])

  return { play, pause, rewind, seek }
}
