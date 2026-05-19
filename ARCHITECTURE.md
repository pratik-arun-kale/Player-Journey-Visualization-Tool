# Architecture — Lila Analyst Webapp

## Overview

This repository implements a client-side replay viewer and a staged analytics engine for telemetry-driven gameplay intelligence. Core capabilities:

- Replay playback and visualization on a normalized 1024×1024 canvas.
- Event overlays (kills, loot, storm, etc.), interpolated player paths and heatmaps.
- Telemetry preprocessing and sanitization (coordinate normalization, event canonicalization).
- Staged analytics pipeline (lightweight metrics → classification → heatmap generation) that runs progressively and off the main render path.

Primary user flows: load match JSON files → normalized events → interactive map playback → optionally generate analytics (safe, incremental).

## Tech stack & rationale

- React + TypeScript: UI is componentized (`src/components/*`) with strong typing (`src/types/index.ts`) to catch telemetry shape issues early.
- Vite: fast dev/workflow (project scaffolding shows `vite.config.ts` and `package.json`).
- Canvas 2D rendering: used in `src/utils/renderer.ts` for heatmaps, event markers, and path drawing—chosen for lightweight, immediate pixel rendering of dense telemetry.
- Lightweight in-app analytics engine in TypeScript: `src/analytics/analyticsEngine.ts` and `src/analytics/analyticsLoader.ts` implement progressive analytics without external dependencies so analytics are easily sandboxed and cacheable.

Why these choices:
- React + TS provides predictable component state for playback and UI controls.
- Canvas gives efficient raster rendering for thousands of sampled points and blur passes (used for the visual heatmap).
- Implementing analytics in the client enables staged loading and avoids shipping heavyweight server-side infra for this prototype.

## Data flow

Parquet/Raw telemetry (authoring pipeline) → preprocessing → normalized JSON files → frontend loader → coordinate normalization → replay renderer → optional analytics engine.

Concrete pieces in the repo:
- Preprocessing / ingestion: `src/utils/dataLoader.ts` calls `normalizeEventsByWorld` to normalize coordinates and merge per-player files.
- Telemetry sanitization: `src/utils/mapUtils.ts` exposes `sanitizeTelemetryData`, `processEvents`, and `normalizeEventsByWorld` which:
  - canonicalize event names, parse timestamps, and validate coordinates
  - convert raw world `x`,`z` to normalized pixel `px`,`py`
- Replay playback: `src/hooks/usePlayback.ts` drives RAF-based timeline updates, `Timeline.tsx` and `MapCanvas.tsx` present controls and canvas.
- Rendering: `src/utils/renderer.ts` composes `drawHeatmap`, `drawPaths`, and `drawEventMarkers` based on enabled layers and cutoff time.
- Analytics: `src/analytics/analyticsEngine.ts` provides deterministic computations (`computePlayerAnalytics`, `computeMapAnalytics`) while `src/analytics/analyticsLoader.ts` manages staged, chunked computation with idle callbacks and sampling.

Short diagram:

Preprocessed JSON → `useFileLoader` → `mergeMatchFiles` → `normalizeEventsByWorld` → App state (`allEvents`, `players`) → `MapCanvas` & `renderer.renderFrame`

Optional Analytics: App triggers `generateMatchAnalytics` → incremental updates (metrics → classification → heatmap) → results cached in App state and consumed by `AnalyticsShell` and `AdvancedAnalytics`.

## Coordinate mapping (detailed)

Coordinate mapping is centralized in `src/utils/mapUtils.ts` and follows a conservative normalization strategy to avoid assumptions about absolute world bounds.

Key facts from the implementation:
- The canonical telemetry fields are `worldX` and `worldZ` (from raw `x`,`z`) and normalized pixel coordinates `px`,`py` defined on a 1024×1024 canvas (`CANVAS_SIZE` used by the renderer).
- Normalization algorithm (in `normalizeEventsByWorld`):
  - Collect finite `worldX` and `worldZ` values across events.
  - Compute bounds: `minX = min(worldX)`, `maxX = max(worldX)`, `minZ = min(worldZ)`, `maxZ = max(worldZ)`.
  - Compute width/height and clamp to avoid zero: `width = Math.max(1, maxX - minX)`, `height = Math.max(1, maxZ - minZ)`.
  - For each event with valid world coordinates:

    xNorm = clamp((worldX - minX) / width, 0, 1)
    zNorm = clamp((worldZ - minZ) / height, 0, 1)

    px = clamp(xNorm * CANVAS_SIZE, 0, CANVAS_SIZE)
    py = clamp((1 - zNorm) * CANVAS_SIZE, 0, CANVAS_SIZE)

  - If world coords are missing/invalid, fallback to canvas center: `px = CANVAS_SIZE/2`, `py = CANVAS_SIZE/2`.

- Rationale and trade-offs:
  - Dynamic normalization (per-match bounds) prevents reliance on brittle global world-space constants and ensures the replay fills the viewport regardless of map origin or world coordinate scale.
  - This approach was chosen after removing legacy backend `map_x/map_y` fields — the client computes pixel projection from raw world coordinates to keep rendering consistent and reduce backend coupling.
  - Using a 1−zNorm mapping flips the Z axis to canvas Y (top-down) to match typical minimap orientation.

- Practical considerations implemented:
  - Bounds fallback when no valid world coords exist.
  - Pixel clamping to ensure off-map or noisy coordinates don't produce NaNs.
  - Normalization is performed once during file merge (`mergeMatchFiles`) for runtime efficiency.

## Assumptions and ambiguity handling

The code documents and implements several defensive strategies:

- Malformed timestamps and event names are normalized in `sanitizeTelemetryData` and `normalizeEventType` (mapping to canonical types, defaulting to `Position`).
- Missing or invalid `x`/`z` values are detected and remapped to canvas center; `VALID_COORD` checks exist in analytics to avoid NaNs.
- Unknown map ids map to `Unknown` and minimap images are optional — rendering gracefully handles missing minimaps.
- Analytics functions guard against empty inputs and return a safe `createEmptyMatchAnalytics` to avoid runtime errors.

## Tradeoffs (summary table)

- Dynamic normalization vs fixed world bounds
  - Chosen: dynamic normalization per-match. Reason: robust to varying origin and map coordinate shifts, better visual fit.
- Canvas 2D vs WebGL
  - Chosen: Canvas 2D. Reason: simpler implementation for overlay, performant enough for 1024×1024 heatmap grid and line paths; avoids WebGL complexity for prototype.
- Client-side analytics vs server-side
  - Chosen: client-side, staged. Reason: enables manual load, progressive feedback, no backend infra required; tradeoff of compute limited by client CPU (mitigated by idle callbacks and sampling).
- Eager analytics vs lazy/staged
  - Chosen: lazy, staged pipeline (`AnalyticsShell` + `analyticsLoader`) to preserve replay responsiveness.

## Future improvements (brief)

- Offload heavy heatmap builds to Web Worker to guarantee non-blocking UI.
- GPU-accelerated heatmap / tile-backed visualizations for very large telemetry sets.
- Calibrated per-map transforms (if map-specific projection metadata becomes available) instead of min/max normalization.
- Temporal heatmaps and interactive filtering (time-slicing) to analyze pacing and engagement windows.

---
*Files referenced*: `src/utils/mapUtils.ts`, `src/utils/dataLoader.ts`, `src/utils/renderer.ts`, `src/analytics/analyticsEngine.ts`, `src/analytics/analyticsLoader.ts`, `src/components/AnalyticsShell.tsx`, `src/components/AdvancedAnalytics.tsx`, `src/components/MapCanvas.tsx`, `src/hooks/usePlayback.ts`.
