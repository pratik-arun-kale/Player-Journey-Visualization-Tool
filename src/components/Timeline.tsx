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
    <div className="timeline-section">
      <div className="panel-title">// Timeline</div>

      <div className="tl-time">{timeStr} <span className="dim">/ {totalStr}</span></div>

      <div
        ref={barRef}
        className="tl-bar"
        onMouseDown={onBarMouseDown}
        onClick={onBarClick}
      >
        {/* event markers */}
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

      <div className="pb-controls">
        {/* Navigation Controls Group */}
        <div className="pb-group pb-group-nav">
          <button
            className="pb-btn pb-btn-nav"
            onClick={onRewind}
            title="Jump to beginning"
          >
            <span className="pb-icon">⏮</span>
            <span className="pb-label">Start</span>
          </button>
          
          <button
            className="pb-btn pb-btn-nav"
            onClick={() => onSeek(Math.max(0, current - 250))}
            title="Step backward 250ms (← Arrow)"
          >
            <span className="pb-icon">⬅</span>
            <span className="pb-label">Step</span>
          </button>
          
          {isPlaying
            ? <button
                className="pb-btn pb-btn-nav active"
                onClick={onPause}
                title="Pause (Space)"
              >
                <span className="pb-icon">⏸</span>
                <span className="pb-label">Pause</span>
              </button>
            : <button
                className="pb-btn pb-btn-nav"
                onClick={onPlay}
                title="Play (Space)"
              >
                <span className="pb-icon">▶</span>
                <span className="pb-label">Play</span>
              </button>
          }
          
          <button
            className="pb-btn pb-btn-nav"
            onClick={() => onSeek(Math.min(duration, current + 250))}
            title="Step forward 250ms (→ Arrow)"
          >
            <span className="pb-icon">➡</span>
            <span className="pb-label">Step</span>
          </button>
        </div>
        
        {/* Speed & Mode Controls Group */}
        <div className="pb-group pb-group-mode">
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
            <option value={5}>5×</option>
            <option value={10}>10×</option>
          </select>

          <label
            className={`pb-cinematic ${cinematicEnabled ? 'active' : ''}`}
            title="Enable cinematic mode: Auto-focus combat areas with smooth camera"
          >
            <input
              type="checkbox"
              checked={cinematicEnabled}
              onChange={e => onToggleCinematic && onToggleCinematic(e.target.checked)}
            />
            <span className="pb-icon">🎬</span>
            <span className="pb-label">Cinematic</span>
          </label>
        </div>
      </div>
    </div>
  )
}
