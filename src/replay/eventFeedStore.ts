import type { ProcessedEvent } from '../types'

export type EventListener = (events: ProcessedEvent[]) => void

// Minimal store: holds events and allows filtering by time.
export function getEventsUpTo(events: ProcessedEvent[], tsRel: number) {
  return events.filter(e => e.tsRel <= tsRel && e.event !== 'Position' && e.event !== 'BotPosition')
}

export function importantEventTypes() {
  return new Set(['Kill', 'BotKill', 'Killed', 'BotKilled', 'KilledByStorm', 'Loot'])
}

export function isSlowMotionTrigger(event: ProcessedEvent) {
  return event.event === 'Kill' || event.event === 'BotKill' || event.event === 'KilledByStorm'
}
