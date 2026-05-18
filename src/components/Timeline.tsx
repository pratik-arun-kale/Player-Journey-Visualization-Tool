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
  events?: { tsRel: number; event: string }[]
  cinematicEnabled?: boolean
  onToggleCinematic?: (v: boolean) => void
}

export function Timeline({
  current, duration, isPlaying, playSpeed,
  onSeek, onPlay, onPause, onRewind, onSpeedChange,
  events = [], cinematicEnabled = false, onToggleCinematic,
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
    <div className="timeline-footer">
      <div className="timeline-top-row">
        <div className="timeline-meta">
          <div className="tl-time">{timeStr}</div>
          <div className="timeline-duration">/ {totalStr}</div>
        </div>

        <div className="pb-controls">
          <button className="pb-btn" onClick={onRewind} title="Restart replay">⏮</button>
          <button className="pb-btn" onClick={() => onSeek(Math.max(0, current - 250))} title="Step back 250ms">◀</button>
          <button
            className={`pb-btn ${isPlaying ? 'active' : ''}`}
            onClick={isPlaying ? onPause : onPlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="pb-btn" onClick={() => onSeek(Math.min(duration, current + 250))} title="Step forward 250ms">▶</button>

          <select
            className="pb-speed"
            value={playSpeed}
            onChange={e => onSpeedChange(parseFloat(e.target.value))}
            title="Playback speed"
          >
            <option value={0.1}>0.1×</option>
            <option value={0.25}>0.25×</option>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>

          <label className={`pb-cinematic ${cinematicEnabled ? 'active' : ''}`} title="Enable cinematic mode">
            <input
              type="checkbox"
              checked={cinematicEnabled}
              onChange={e => onToggleCinematic && onToggleCinematic(e.target.checked)}
            />
            <span>🎬</span>
          </label>
        </div>
      </div>

      <div className="timeline-bar-wrapper">
        <div className="timeline-bar-inner">
          <div
            ref={barRef}
            className="tl-bar"
            onMouseDown={onBarMouseDown}
            onClick={onBarClick}
          >
            {events.map((ev, i) => {
              const left = duration > 0 ? Math.max(0, Math.min(100, (ev.tsRel / duration) * 100)) : 0
              const color = ev.event === 'Loot' ? '#ffd700' : (ev.event === 'KilledByStorm' ? '#bf5fff' : '#ff3333')
              const title = `${ev.event} · ${formatMs(ev.tsRel)}`
              return (
                <div
                  key={i}
                  className="tl-event-marker"
                  style={{ left: `${left}%`, background: color }}
                  title={title}
                />
              )
            })}

            <div className="tl-fill" style={{ width: `${pct}%` }} />
            <div className="tl-thumb" style={{ left: `calc(${pct}% - 5px)` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
