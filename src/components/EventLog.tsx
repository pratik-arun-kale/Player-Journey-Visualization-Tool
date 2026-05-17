import React, { useEffect, useRef } from 'react'
import type { ProcessedEvent } from '../types'
import { getEventsUpTo } from '../replay/eventFeedStore'
import '../styles/EventLog.css'

interface Player {
  userId: string
  alias?: string
  isBot: boolean
}

interface EventLogProps {
  events: ProcessedEvent[]
  currentTime: number // ms
  isPlaying: boolean
  players: Player[]
  onSeek?: (ms: number) => void
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getPlayerName(userId: string, players: Player[]): string {
  const player = players.find(p => p.userId === userId)
  return player?.alias || player?.userId?.slice(0, 8) || 'Unknown'
}

function formatEventText(event: ProcessedEvent, players: Player[]): string {
  const playerName = getPlayerName(event.userId, players)
  
  switch (event.event) {
    case 'Kill':
    case 'BotKill':
      return `${playerName} found a kill`
    case 'Killed':
    case 'BotKilled':
      return `${playerName} was eliminated`
    case 'KilledByStorm':
      return `${playerName} died to storm`
    case 'Loot':
      return `${playerName} looted an item`
    default:
      return `${playerName} - ${event.event}`
  }
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'Kill':
    case 'BotKill':
      return '#ff3333' // red
    case 'Killed':
    case 'BotKilled':
      return '#ff6666' // light red
    case 'KilledByStorm':
      return '#bf5fff' // purple
    case 'Loot':
      return '#ffd700' // gold
    default:
      return '#999999' // gray
  }
}

function getEventIcon(eventType: string): string {
  switch (eventType) {
    case 'Kill':
    case 'BotKill':
      return '✕ '
    case 'Killed':
    case 'BotKilled':
      return '●'
    case 'KilledByStorm':
      return '◆'
    case 'Loot':
      return '◇'
    default:
      return '•'
  }
}

export function EventLog({ events, currentTime, isPlaying, players, onSeek }: EventLogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // Filter events that have occurred up to currentTime
  const visibleEvents = getEventsUpTo(events, currentTime)



  // Auto-scroll to bottom during playback
  useEffect(() => {
    if (!containerRef.current) return

    if (isPlaying && shouldAutoScroll.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [visibleEvents.length, isPlaying])

  // Brief highlight for newest event
  const newest = visibleEvents.length ? visibleEvents[visibleEvents.length - 1] : null
  const isNew = (ev: ProcessedEvent) => newest ? (currentTime - newest.tsRel) < 2500 && ev === newest : false

  // Detect manual scroll to disable auto-scroll temporarily
  const handleScroll = () => {
    if (!containerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10

    shouldAutoScroll.current = isAtBottom || !isPlaying
  }

  return (
    <div className="event-log-container">
      <div className="event-log-header">
        <h3>Event Log</h3>
        <span className="event-count">{visibleEvents.length}</span>
      </div>

      <div
        className="event-log-content"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {visibleEvents.length === 0 ? (
          <div className="event-log-empty">No events yet</div>
        ) : (
          <ul className="event-list">
            {visibleEvents.map((event, index) => (
              <li
                key={`${event.tsMs}-${index}`}
                className={`event-item ${isNew(event) ? 'event-new' : ''}`}
                style={{ borderLeftColor: getEventColor(event.event) }}
                onClick={() => onSeek && onSeek(event.tsRel)}
                title={`${formatTime(event.tsRel)} · ${event.event}`}
              >
                <div className="event-meta">
                  <span className="event-time">{formatTime(event.tsRel)}</span>
                  <span
                    className="event-icon"
                    style={{ color: getEventColor(event.event) }}
                  >
                    {getEventIcon(event.event)}
                  </span>
                </div>
                <div className="event-text">
                  {formatEventText(event, players)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
