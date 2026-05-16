# LILA BLACK // ANALYST

> A browser-based player-journey visualization tool for the LILA BLACK extraction shooter.

![Tech](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript) ![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)

---

## Live Demo

> **[https://lila-analyst.vercel.app](https://lila-analyst.vercel.app)**  ← deployed URL

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
# → http://localhost:3000

# 3. Build for production
npm run build

# 4. Preview production build
npm run preview
```

No environment variables required. The app is fully client-side.

---

## How to Use the Tool

### Step 1 — Load your JSON data
Click or drag files into the **"Data Input"** upload zone in the left panel.

You need to load:
- `matches.json` — the match index file (output of the Python pipeline)
- Player JSON files — one or more `{user_id}_{match_id}.json` files

You can load all files at once (multi-select or drag a whole folder's contents).

### Step 2 — Load minimap images
Drag the minimap PNG/JPG images from the `minimaps/` folder directly onto the dark map area in the centre:
- `AmbroseValley_Minimap.png`
- `GrandRift_Minimap.png`
- `Lockdown_Minimap.jpg`

The tool detects which map from the filename automatically.

### Step 3 — Select a match
The match list (bottom of the left panel) shows all matches grouped by `match_id`, filtered to only those whose player JSON files you have loaded. Click any match to activate it.

### Step 4 — Explore

| Feature | How |
|---------|-----|
| **Player paths** | Drawn automatically. Human paths are colour-coded; bot paths are orange. |
| **Event markers** | ✕ red = kill, ● red = death, ◆ purple = storm death, ■ gold = loot |
| **Heatmap** | Blue→red heat overlay showing movement density |
| **Filter by map/date** | Dropdowns at the top of the match list |
| **Layer toggles** | PATHS / KILLS / LOOT / STORM / HEAT / BOTS buttons |
| **Timeline playback** | Scrub the bar or press ▶ to watch the match unfold in real time |
| **Playback speed** | 0.25× to 10× |
| **Show/hide players** | Click names in the right panel; ALL / NONE buttons |
| **Zoom & pan** | Scroll wheel to zoom, drag to pan, ⊙ to reset |

---

## Data Pipeline

The tool reads the JSON files produced by the Python pre-processing script. To regenerate:

```bash
cd pipeline/
pip install pyarrow pandas -r requirements.txt
python process.py --input /path/to/player_data/ --output ../public/data/
```

This writes:
- `public/data/matches.json` — index of all 1,243 player files
- `public/data/{folder}/{player}_{match}.json` — one file per player-in-match

> **Note:** For a hosted deployment, upload the output JSON files to your CDN or include them in the `public/data/` folder before building.

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React 18 + TypeScript | Type safety, component model |
| Build | Vite 5 | Fast HMR, zero-config |
| Rendering | HTML5 Canvas (2D) | Performant path drawing, heatmap blending |
| State | `useReducer` | Predictable, no extra deps |
| Styling | Plain CSS (custom properties) | Full control, no runtime overhead |
| Hosting | Vercel / Netlify | Drop-in for Vite output |

---

## Project Structure

```
src/
├── types/          # TypeScript interfaces for all data shapes
├── utils/
│   ├── mapUtils.ts    # Coord conversion, player colours, ts parsing
│   ├── dataLoader.ts  # JSON → typed data structures
│   └── renderer.ts    # Canvas drawing (paths, heatmap, markers)
├── hooks/
│   ├── useAppState.ts  # Central useReducer state machine
│   ├── useFileLoader.ts # File drag-drop + JSON parsing
│   └── usePlayback.ts   # rAF-based timeline animation
└── components/
    ├── Header.tsx
    ├── UploadZone.tsx
    ├── MatchList.tsx
    ├── LayerToggles.tsx
    ├── MapCanvas.tsx   # Minimap image + overlay canvas
    ├── Timeline.tsx
    └── StatsPanel.tsx  # Stats + player list
```
