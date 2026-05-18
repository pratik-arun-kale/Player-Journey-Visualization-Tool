import React from 'react'
import type { MatchAnalytics } from '../analytics/analyticsEngine'
import type { AnalyticsPhase } from '../analytics/analyticsLoader'

const AdvancedAnalytics = React.lazy(() => import('./AdvancedAnalytics').then(m => ({ default: m.AdvancedAnalytics })))

const stageLabels: Record<AnalyticsPhase, string> = {
  idle: 'Ready to start',
  parsing: 'Parsing telemetry',
  metrics: 'Computing lightweight metrics',
  classification: 'Analyzing playstyles',
  heatmap: 'Building heatmap overlays',
  done: 'Rendering analytics',
  failed: 'Analytics failed',
}

interface Props {
  activeMatch: boolean
  analytics?: MatchAnalytics
  phase: AnalyticsPhase
  progress: number
  message: string
  error?: string
  onGenerate: () => void
  onRetry: () => void
}

export function AnalyticsShell({
  activeMatch,
  analytics,
  phase,
  progress,
  message,
  error,
  onGenerate,
  onRetry,
}: Props) {
  const stageOrder: AnalyticsPhase[] = ['parsing', 'metrics', 'classification', 'heatmap', 'done']
  const getStageState = (stage: AnalyticsPhase) => {
    if (phase === 'failed') return 'failed'
    if (phase === stage) return 'active'
    if (stageOrder.indexOf(stage) < stageOrder.indexOf(phase)) return 'complete'
    return 'pending'
  }

  if (!activeMatch) {
    return (
      <div className="analytics-placeholder">
        <div className="panel-title">// Analytics Ready</div>
        <div className="analytics-disabled-text">
          Select a loaded match to generate advanced insights without blocking replay.
        </div>
      </div>
    )
  }

  if (phase === 'idle' || phase === 'failed') {
    return (
      <div className="analytics-placeholder">
        <div className="panel-title">// Analytics Ready</div>
        <div className="analytics-disabled-text">
          {phase === 'failed'
            ? error || 'Analytics failed to generate. Replay remains fully available.'
            : 'Generate advanced gameplay intelligence without interrupting playback.'}
        </div>
        <button className="view-action-btn" onClick={phase === 'failed' ? onRetry : onGenerate}>
          {phase === 'failed' ? 'Retry Analytics' : 'Generate Analytics'}
        </button>
      </div>
    )
  }

  const progressItems = stageOrder.map(stage => {
    const state = getStageState(stage)
    return (
      <li key={stage} className={`analytics-stage-item ${state}`}>
        <span className="stage-icon">{state === 'complete' ? '✔' : state === 'active' ? '⏳' : '•'}</span>
        <span>{stageLabels[stage]}</span>
      </li>
    )
  })

  const isReady = phase === 'done' && analytics

  if (isReady) {
    return (
      <React.Suspense fallback={<div className="empty-state"><div className="es-icon">⟳</div></div>}>
        <AdvancedAnalytics analytics={analytics} />
      </React.Suspense>
    )
  }

  return (
    <div className="analytics-panel">
      <div className="analytics-loading-banner">
        <div>
          <div className="panel-title">// Generating Gameplay Intelligence</div>
          <div className="analytics-loading-meta">{message}</div>
        </div>
        <div className="analytics-loading-progress">{progress}%</div>
      </div>

      <div className="analytics-progress-list">
        {progressItems}
      </div>

      {phase !== 'done' && !analytics ? (
        <div className="analytics-placeholder">
          <div className="analytics-disabled-text">Analytics are being prepared. This will not block replay rendering.</div>
        </div>
      ) : (
        <React.Suspense fallback={<div className="empty-state"><div className="es-icon">⟳</div></div>}>
          <AdvancedAnalytics analytics={analytics!} />
        </React.Suspense>
      )}
    </div>
  )
}
