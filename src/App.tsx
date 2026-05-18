import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppState } from './hooks/useAppState'
import { useFileLoader } from './hooks/useFileLoader'
import { usePlayback } from './hooks/usePlayback'
import { formatMs } from './utils/mapUtils'
import type { MatchAnalytics } from './analytics/analyticsEngine'
import { generateMatchAnalytics, type AnalyticsPhase } from './analytics/analyticsLoader'

import { Header }       from './components/Header'
import { UploadZone }   from './components/UploadZone'
import { LayerToggles } from './components/LayerToggles'
import { MatchList }    from './components/MatchList'
import { ErrorBoundary } from './components/ErrorBoundary'
const MapCanvas = React.lazy(() => import('./components/MapCanvas').then(m => ({ default: m.MapCanvas })))
const Timeline = React.lazy(() => import('./components/Timeline').then(m => ({ default: m.Timeline })))
const AnalyticsShell = React.lazy(() => import('./components/AnalyticsShell').then(m => ({ default: m.AnalyticsShell })))
const StatsPanel = React.lazy(() => import('./components/StatsPanel').then(m => ({ default: m.StatsPanel })))
const PlayerList = React.lazy(() => import('./components/StatsPanel').then(m => ({ default: m.PlayerList })))
const EventLog = React.lazy(() => import('./components/EventLog').then(m => ({ default: m.EventLog })))
import { createCinematicController } from './replay/cinematicController'

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

  const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1, 2]
  const cyclePlaySpeed = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(state.playSpeed)
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length
    dispatch({ type: 'SET_PLAY_SPEED', value: SPEED_OPTIONS[nextIndex] })
  }, [dispatch, state.playSpeed])

  const speedLabel = state.playSpeed === 0.1
    ? '0.1×'
    : state.playSpeed === 0.25
      ? '0.25×'
      : state.playSpeed === 0.5
        ? '0.5×'
        : `${state.playSpeed}×`

  type AnalyticsLoadStatus = 'idle' | 'loading' | 'done' | 'error'
  const [analyticsState, setAnalyticsState] = useState<{
    status: AnalyticsLoadStatus
    phase: AnalyticsPhase
    progress: number
    message: string
    analytics?: MatchAnalytics
    error?: string
  }>({
    status: 'idle',
    phase: 'idle',
    progress: 0,
    message: 'Analytics ready to generate',
    analytics: undefined,
    error: undefined,
  })
  const analyticsRunRef = useRef(0)

  useEffect(() => {
    analyticsRunRef.current += 1
    setAnalyticsState({
      status: 'idle',
      phase: 'idle',
      progress: 0,
      message: 'Analytics ready to generate',
      analytics: undefined,
      error: undefined,
    })
  }, [state.activeMatchId, state.mapId, state.allEvents.length])

  const loadAnalytics = useCallback(async () => {
    if (!state.activeMatchId) return
    const runId = ++analyticsRunRef.current
    setAnalyticsState({ status: 'loading', phase: 'parsing', progress: 5, message: 'Preparing analytics engine', analytics: undefined, error: undefined })

    try {
      const analytics = await generateMatchAnalytics(
        state.players,
        state.allEvents,
        state.durationMs,
        state.mapId,
        (update) => {
          if (runId !== analyticsRunRef.current) return
          setAnalyticsState(prev => ({
            status: 'loading',
            phase: update.phase,
            progress: update.progress,
            message: update.message,
            analytics: update.analytics ?? prev.analytics,
            error: undefined,
          }))
        }
      )

      if (runId !== analyticsRunRef.current) return
      setAnalyticsState({ status: 'done', phase: 'done', progress: 100, message: 'Analytics ready', analytics, error: undefined })
    } catch (error: any) {
      if (runId !== analyticsRunRef.current) return
      console.error('Analytics generation failed', error)
      setAnalyticsState({ status: 'error', phase: 'failed', progress: 0, message: 'Analytics failed to generate', analytics: undefined, error: error?.message || 'Unknown analytics error' })
    }
  }, [state.activeMatchId, state.allEvents, state.durationMs, state.mapId, state.players])

  const retryAnalytics = useCallback(() => {
    loadAnalytics()
  }, [loadAnalytics])

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
    <ErrorBoundary
      fallbackTitle="Replay Viewer Error"
      fallbackMessage="The replay crashed during rendering. Return to Match List."
      onReset={() => window.location.reload()}
    >
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
                <button className="view-action-btn" onClick={cyclePlaySpeed} title="Cycle playback speed">
                  {speedLabel}
                </button>
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
                <AnalyticsShell
                  activeMatch={!!state.activeMatchId}
                  analytics={analyticsState.analytics}
                  phase={analyticsState.phase}
                  progress={analyticsState.progress}
                  message={analyticsState.message}
                  error={analyticsState.error}
                  onGenerate={loadAnalytics}
                  onRetry={retryAnalytics}
                />
              )}
            </React.Suspense>
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

            <div className="right-panel-footer">
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
    </ErrorBoundary>
  )
}
