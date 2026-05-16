import React, { useRef, useCallback } from 'react'
import { formatMs } from '../utils/mapUtils'

interface Props {
  current: number
  duration: number
  isPlaying: boolean
  playSpeed: number
  onSeek: (ms: number) => void
  onPlay: () => void
  onPause: () => void
  onRewind: () => void
  onSpeedChange: (v: number) => void
}

export function Timeline({
  current, duration, isPlaying, playSpeed,
  onSeek, onPlay, onPause, onRewind, onSpeedChange,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null)

  const pct     = duration > 0 ? (current / duration) * 100 : 0
  const timeStr = formatMs(current)
  const totalStr = formatMs(duration)

  const seekFromEvent = useCallback((e: React.MouseEvent) => {
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(frac * duration)
  }, [duration, onSeek])

  const onBarClick = useCallback((e: React.MouseEvent) => {
    seekFromEvent(e)
  }, [seekFromEvent])

  // drag-to-scrub
  const dragging = useRef(false)
  const onBarMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    seekFromEvent(e)
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const bar = barRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      onSeek(frac * duration)
    }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [seekFromEvent, duration, onSeek])

  return (
    <div className="timeline-section">
      <div className="panel-title">// Timeline</div>

      <div className="tl-time">{timeStr} <span className="dim">/ {totalStr}</span></div>

      <div
        ref={barRef}
        className="tl-bar"
        onMouseDown={onBarMouseDown}
        onClick={onBarClick}
      >
        <div className="tl-fill" style={{ width: `${pct}%` }} />
        <div className="tl-thumb" style={{ left: `calc(${pct}% - 5px)` }} />
      </div>

      <div className="pb-controls">
        <button className="pb-btn" onClick={onRewind} title="Rewind">⏮</button>
        {isPlaying
          ? <button className="pb-btn active" onClick={onPause} title="Pause">⏸</button>
          : <button className="pb-btn" onClick={onPlay}  title="Play">▶</button>
        }
        <select
          className="pb-speed"
          value={playSpeed}
          onChange={e => onSpeedChange(parseFloat(e.target.value))}
        >
          <option value={0.25}>0.25×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={5}>5×</option>
          <option value={10}>10×</option>
        </select>
      </div>
    </div>
  )
}
