# Gameplay Insights — Lila Analyst Webapp

This document contains three evidence-backed gameplay insights derived from the codebase's telemetry handling, heatmap generation and analytics heuristics. All observations reference concrete implementation details (heatmap grid, clustering thresholds, chokepoint scoring) rather than external datasets.

---

## Insight 1 — Persistent narrow-path chokepoints concentrate combat

What was observed

- The analytics pipeline identifies chokepoint candidates using cell visit density and unique visitor counts: in `src/analytics/analyticsLoader.ts`/`computeMapAnalyticsChunked` chokepoints are scored as `movementHeatmap[cell.y][cell.x] * visitSetSize`.
- The map analytics engine (`src/analytics/analyticsEngine.ts`) also ranks chokepoints by movement visits and visit diversity.

Evidence

- Implementation selects chokepoints by combining per-cell movement frequency with number of distinct players visiting the cell, which explicitly surfaces narrow traversal corridors where many unique players pass repeatedly.
- The core heatmap grid is 32×32 (`GRID_SIZE = 32` in `analyticsEngine.ts`) while the renderer uses a 40×40 visualization grid — both are coarse enough to aggregate repeated path traffic into stable hotspots.
- The chokepoint code favors cells with both high movement counts and a higher distinct-visitor count, implying the detection is robust to single-player activity spikes.

Actionable impact

- Level designers should inspect flagged chokepoints: they likely correspond to map geometry funnels (bridges, corridors, gate entrances).
- Balancing options: add alternate routes, redistribute high-value loot away from chokepoints, or soften lethal cover at those locations to reduce repeated high-intensity engagements.
- Metrics to monitor: `combat frequency` around chokepoints, `engagement duration`, and `player path overlap`.

Why designers should care

- Chokepoints create repeated high-variance engagements that can dominate match pacing and reduce traversal diversity. Reducing chokepoints or adding meaningful alternatives increases tactical variety and reduces frustration.

---

## Insight 2 — Hotspots defined by multi-event intensity indicate tactical centers, not just loot sites

What was observed

- Hotspots are selected where `cell.count > 3` and cells are scored with `score = count + loot*2 + combat*3` (see `src/analytics/analyticsLoader.ts` and `src/analytics/analyticsEngine.ts`).
- This score weights combat and loot higher than raw visitation, prioritizing tactical relevance over mere traffic.

Evidence

- Heatmap generation applies a blur and normalizes by maximum intensity in `src/utils/renderer.ts` (`drawHeatmap`) producing visible regions that correlate with `movementHeatmap` and event-dense cells computed in analytics.
- The hotspot scoring emphasizes combat (`*3`) and loot (`*2`), so high-score regions in analytics are where engagements and supply interactions co-occur.

Actionable impact

- Use hotspot overlays (the analytics heatmap layer) to relocate or stagger high-value rewards so they do not always induce combat in the same locations.
- Introduce dynamic or time-split loot spawns to reduce persistent contest zones.
- Track downstream metrics: `engagement rate` per hotspot, `average survival time` when entering hotspots, and `hotspot recurrence` across matches.

Why designers should care

- Hotspots that combine loot and combat create predictable pressure points. If those zones repeatedly decide match outcomes, they reduce emergent play and increase perceived unfairness.

---

## Insight 3 — Player movement clustering threshold (40 units / 30 s) identifies short-duration local clusters

What was observed

- The analytics engine computes cluster sizes by checking events within 40 units spatially and 30,000 ms temporally (`clusterSize` in `src/analytics/analyticsEngine.ts`).
- This heuristic finds short-lived local groupings (looting squabbles, transient fights) rather than long-route overlaps.

Evidence

- `clusterSize` counts nearby events where `Math.hypot(dx,dy) <= 40` and `Math.abs(dt) <= 30000`, then averages cluster sizes to estimate local clustering.
- Combined with heatmap and chokepoint analysis, this reveals whether hotspots are multi-player engagements (clustered) or single-player traffic (low cluster size).

Actionable impact

- Distinguish hotspot remediation strategies: clusters indicate contested hotspots (balance by spread or risk-reward tuning), while non-clustered hotspots imply popular traversal that might benefit from route choices.
- Consider adjusting spawn pacing or cover at cluster-prone cells to encourage staggered encounters.
- Metrics to monitor: `cluster size distribution`, `cluster duration`, and `cluster-to-combat conversion rate`.

Why designers should care

- Clustering insight helps prioritize interventions: large clusters → immediate balance changes; small/local clusters → design tweaks to flow or rewards.

---

## Notes on evidence and limitations

- These insights are derived from the codebase's analytic heuristics (grid size, thresholds, scoring weights) rather than a specific dataset. They reflect how the product computes and surfaces patterns.
- For numeric thresholds or tuning, collect production telemetry and compute summary statistics (percentiles of cell counts, cluster sizes, chokepoint scores) to make data-driven threshold adjustments.

---

*Files referenced*: `src/analytics/analyticsLoader.ts`, `src/analytics/analyticsEngine.ts`, `src/utils/renderer.ts`, `src/utils/mapUtils.ts`, `src/components/AnalyticsShell.tsx`, `src/components/AdvancedAnalytics.tsx`.
