# Gameplay Telemetry Replay & Analytics Platform

> Replay visualization · telemetry intelligence · analytics dashboard

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)

---

## Project Overview

This repository provides a client-side replay viewer for gameplay telemetry. The application loads replay-ready JSON, renders matches on a minimap, and exposes interactive telemetry analytics.

Key capabilities:

* timeline-based replay playback
* zoomable minimap rendering
* event marker overlays and player traces
* heatmap analytics and map intelligence
* on-demand analytics generation with staged progress

The frontend is intentionally lightweight: raw Parquet telemetry is converted externally into replay JSON via the provided Google Colab notebook.

---

## Features

* JSON replay upload with folder drag/drop
* Match selection and map/date filtering
* Interactive minimap playback with zoom/pan controls
* Timeline scrubber and playback speed controls
* Layer toggles for paths, kills, loot, storm, heat, and bots
* Progressive analytics view with player and map metrics
* Heatmap, hotspot, chokepoint, and dead-zone detection
* Player playstyle scoring and movement analysis
* Safe telemetry sanitization and coordinate normalization
* Built-in static minimap assets for known maps

---

## Tech Stack

* React 18 — UI composition and lazy-loaded components
* TypeScript — typed telemetry, rendering, and analytics code
* Vite 5 — fast local development server and production build
* HTML5 Canvas — efficient 2D rendering for the map overlay
* CSS — custom theme and responsive interface styling

---

## Installation & Setup

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production bundle:

```bash
npm run preview
```

No backend services or environment variables are required for frontend execution.

---

## How to Use The App

### Step 1 — Process Parquet Files

Raw telemetry input should be converted before use. The frontend does not parse Parquet directly.

Use the provided Google Colab notebook:

https://colab.research.google.com/drive/1-Vxbe1GsLACg7VR8lOc92WGLIi1Ic31s#scrollTo=main

Workflow:

1. Upload raw `.parquet` gameplay files to the notebook.
2. Extract telemetry events and normalize coordinates.
3. Generate replay-ready JSON.
4. Download the JSON output for upload.

### Step 2 — Upload Replay JSON

Open the left sidebar upload area and drag or select JSON files.

The upload control supports folder drag/drop and validates replay JSON before parsing.

After upload, available matches populate the sidebar list.

### Step 3 — Open Replay

Select a match from the sidebar to load it into the central replay canvas.

The viewer renders player paths, event markers, heatmaps, and the map background.

### Step 4 — Use Replay Controls

* Play/pause the replay.
* Scrub the timeline to move through match time.
* Cycle playback speed between 0.1×, 0.25×, 0.5×, 1×, and 2×.
* Toggle layer visibility for telemetry overlays.
* Zoom and pan on the map for deeper inspection.

### Step 5 — Open Analytics View

Switch to Analytics View to compute match analytics.

Analytics are generated on demand and provide:

* player scoring and movement statistics
* map heatmaps for movement, loot, and combat
* hotspot and chokepoint detection
* summary metrics for the active match

---

## Coordinate Mapping Approach

The viewer normalizes raw world coordinates into a fixed 1024×1024 canvas.

Implementation details:

* raw world coordinates are validated and sanitized before rendering
* per-match min/max normalization maps positions into pixel space
* invalid positions are clamped to prevent off-map rendering
* minimap backgrounds are selected from `public/minimaps/` for known maps

This keeps rendering stable while preserving relative player movement and event placement.

---

## Architecture Overview

```text
Raw Parquet Telemetry
    ↓
Google Colab Preprocessing
    ↓
Replay JSON
    ↓
Upload Zone
    ↓
Match Loader + Map Renderer
    ↓
Analytics Engine
```

The frontend is organized as:

* left sidebar — upload controls and match list
* central panel — map canvas and timeline playback
* right/analytics area — generated insights and player metrics

---

## Performance & Stability

* Telemetry is sanitized and normalized before rendering.
* Analytics load lazily with progressive phase updates.
* The replay viewer maintains responsive playback under analysis.
* Error boundaries isolate UI failures from the core replay flow.
* The platform is replay-first, keeping visualization stable.

---

## Known Limitations

* Raw Parquet preprocessing is external to this repository.
* Coordinate normalization is approximate and depends on per-match bounds.
* Analytics are client-side heuristics rather than backend models.
* Map intelligence is currently limited to known built-in minimap assets.

---

## Future Improvements

* calibrated world bounds for more precise projection
* Web Worker-based analytics computation
* GPU-accelerated heatmap rendering
* richer temporal and team-level analytics
* expanded map support and dynamic map assets

---

## Screenshots

### Replay Viewer
![Replay Viewer](./screenshots/replay.png)

### Analytics Dashboard
![Analytics](./screenshots/analytics.png)
