import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useAppState } from './hooks/useAppState'
import { useFileLoader } from './hooks/useFileLoader'
import { usePlayback } from './hooks/usePlayback'
import { formatMs } from './utils/mapUtils'

import { Header }       from './components/Header'
import { UploadZone }   from './components/UploadZone'
import { LayerToggles } from './components/LayerToggles'
import { MatchList }    from './components/MatchList'
const MapCanvas = React.lazy(() => import('./components/MapCanvas').then(m => ({ default: m.MapCanvas })))
const Timeline = React.lazy(() => import('./components/Timeline').then(m => ({ default: m.Timeline })))
const StatsPanel = React.lazy(() => import('./components/StatsPanel').then(m => ({ default: m.StatsPanel })))
const PlayerList = React.lazy(() => import('./components/StatsPanel').then(m => ({ default: m.PlayerList })))
const EventLog = React.lazy(() => import('./components/EventLog').then(m => ({ default: m.EventLog })))
const AdvancedAnalytics = React.lazy(() => import('./components/AdvancedAnalytics').then(m => ({ default: m.AdvancedAnalytics })))
import { createCinematicController } from './replay/cinematicController'
import { computeMatchAnalytics } from './analytics/analyticsEngine'

import type { FilterMap, FilterDate, Layers } from './types'

const MAP_DISPLAY: Record<string, string> = {
  AmbroseValley: 'AMBROSE',
  GrandRift:     'GRAND RIFT',
  Lockdown:      'LOCKDOWN',
  Unknown:       'UNKNOWN',
}

export default function App() {
  const { state, dispatch, filteredMatches, mapCounts } = useAppState()
  const { loadFiles, loadMatch }                        = useFileLoader(state, dispatch)

  const { play, pause, rewind, seek } = usePlayback(
    state.isPlaying,
    state.timelineCurrent,
    state.durationMs,
    state.playSpeed,
    dispatch
  )

  const [viewMode, setViewMode] = useState<'map' | 'analytics'>('map')
  const analytics = useMemo(
    () => computeMatchAnalytics(state.players, state.allEvents, state.durationMs, state.mapId),
    [state.players, state.allEvents, state.durationMs, state.mapId]
  )

  // Cinematic mode controller
  const [cinematicEnabled, setCinematicEnabled] = useState(false)
  const cinematicRef = useRef<any | null>(null)
  const prevTimeRef = useRef<number>(state.timelineCurrent)

  useEffect(() => {
    cinematicRef.current?.dispose?.()
    cinematicRef.current = createCinematicController({
      dispatch,
      events: state.allEvents,
      getPlaySpeed: () => state.playSpeed,
      cinematicEnabled: () => cinematicEnabled,
    })
    return () => cinematicRef.current?.dispose?.()
  }, [state.allEvents, dispatch, cinematicEnabled, state.playSpeed])

  useEffect(() => {
    const prev = prevTimeRef.current
    const now = state.timelineCurrent
    cinematicRef.current?.onTimeUpdate?.(prev, now)
    prevTimeRef.current = now
  }, [state.timelineCurrent])

  // Space to toggle play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (state.isPlaying) pause()
        else play()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.isPlaying, play, pause])



  const filtered  = filteredMatches()
  const counts    = mapCounts()

  // Human player count across active match events
  const humanSet = new Set(
    state.allEvents.filter(e => !e.isBot).map(e => e.userId)
  )

  const activeMapDisplay =
    state.activeMatchId && state.mapId
      ? MAP_DISPLAY[state.mapId] || state.mapId
      : '—'

  return (
    <div className="app">
      <Header
        matchCount={state.indexedMatches.size}
        playerCount={humanSet.size}
        eventCount={state.allEvents.length}
        activeMap={activeMapDisplay}
        status={state.status}
        indexingState={state.indexingState}
        indexedCount={state.indexedCount}
        totalFileCount={state.totalFileCount}
      />

      <div className="app-body">
        {/* ── LEFT PANEL ── */}
        <aside className="left-panel">
          <div className="panel-section">
            <div className="panel-title">// Data Input</div>
            <UploadZone onFiles={(f: File[]) => loadFiles(f)} />
          </div>

          <LayerToggles
            layers={state.layers}
            onToggle={(layer: keyof Layers) => dispatch({ type: 'TOGGLE_LAYER', layer })}
          />

          <MatchList
            matches={filtered}
            activeMatchId={state.activeMatchId}
            filterMap={state.filterMap}
            filterDate={state.filterDate}
            mapCounts={counts}
            matchLoadStates={state.matchLoadStates}
            indexingState={state.indexingState}
            onSelectMatch={loadMatch}
            onFilterMap={(v: FilterMap) => dispatch({ type: 'SET_FILTER_MAP', value: v })}
            onFilterDate={(v: FilterDate) => dispatch({ type: 'SET_FILTER_DATE', value: v })}
            totalCount={state.indexedMatches.size}
          />
        </aside>

        <main className="center-panel">
          <div className="view-switch-bar">
            <div className="view-buttons">
              <button
                className={`view-button ${viewMode === 'map' ? 'active' : ''}`}
                onClick={() => setViewMode('map')}
              >
                Map View
              </button>
              <button
                className={`view-button ${viewMode === 'analytics' ? 'active' : ''}`}
                onClick={() => setViewMode('analytics')}
              >
                Analytics View
              </button>
            </div>

            <div className="view-actions">
              <div className="view-action-group">
                <button className="view-action-btn" onClick={rewind} title="Jump to beginning">⏮</button>
                <button
                  className={`view-action-btn ${state.isPlaying ? 'active' : ''}`}
                  onClick={state.isPlaying ? pause : play}
                  title={state.isPlaying ? 'Pause' : 'Play'}
                >
                  {state.isPlaying ? '⏸' : '▶'}
                </button>
                <button className="view-action-btn" onClick={() => seek(Math.min(state.durationMs, state.timelineCurrent + 250))} title="Step forward">➡</button>
              </div>
              <div className="view-action-meta">
                {formatMs(state.timelineCurrent)} / {formatMs(state.durationMs)}
              </div>
            </div>
          </div>

          <div className="center-main">
            <React.Suspense fallback={<div className="empty-state"><div className="es-icon">⟳</div></div>}>
              {viewMode === 'map' ? (
                <MapCanvas
                  mapId={state.mapId}
                  players={state.players}
                  allEvents={state.allEvents}
                  selectedPlayers={state.selectedPlayers}
                  cutoffRel={state.timelineCurrent}
                  layers={state.layers}
                  hasMatch={!!state.activeMatchId}
                  isLoading={state.isLoadingMatch}
                  cinematicEnabled={cinematicEnabled}
                />
              ) : (
                <AdvancedAnalytics analytics={analytics} />
              )}
            </React.Suspense>
          </div>

          <div className="center-footer">
            <Timeline
              current={state.timelineCurrent}
              duration={state.durationMs}
              isPlaying={state.isPlaying}
              playSpeed={state.playSpeed}
              onSeek={seek}
              onPlay={play}
              onPause={pause}
              onRewind={rewind}
              onSpeedChange={(v: number) => dispatch({ type: 'SET_PLAY_SPEED', value: v })}
              events={state.allEvents.map(e => ({ tsRel: e.tsRel, event: e.event }))}
              cinematicEnabled={cinematicEnabled}
              onToggleCinematic={(v: boolean) => setCinematicEnabled(v)}
            />
          </div>
        </main>

        <aside className="right-panel">
          <React.Suspense fallback={null}>
            <div className="panel-section">
              <div className="panel-title">// Event Feed</div>
            </div>

            <div className="right-panel-main">
              <EventLog
                events={state.allEvents}
                currentTime={state.timelineCurrent}
                isPlaying={state.isPlaying}
                players={state.players}
                onSeek={seek}
              />
            </div>

            <div className="right-panel-stats">
              <StatsPanel
                players={state.players}
                allEvents={state.allEvents}
                cutoffRel={state.timelineCurrent}
              />

              <PlayerList
                players={state.players}
                selectedPlayers={state.selectedPlayers}
                onToggle={(uid: string) => dispatch({ type: 'TOGGLE_PLAYER', userId: uid })}
                onSelectAll={() => dispatch({ type: 'SELECT_ALL_PLAYERS' })}
                onDeselectAll={() => dispatch({ type: 'DESELECT_ALL_PLAYERS' })}
              />
            </div>
          </React.Suspense>
        </aside>
      </div>
    </div>
  )
}
