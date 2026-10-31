# City skyline models (Drop Havoc peripheral backdrop)

Primary kit: **Polyfork New York City Kit** (`nyc-city-kit-fbca88`)
- License: free for commercial use in games (no attribution required per Polyfork; do not resell raw assets)
- Source: https://polyfork.dev/

Selected buildings (real-world scale GLB, instanced & scaled for distant skyline):
| File | Title | Page |
|------|-------|------|
| office-tower-8d148a.glb | Office Tower (~28 m; scaled up for skyline) | https://polyfork.dev/asset/office-tower-8d148a |
| brick-tenement-5257e9.glb | Brick Tenement | https://polyfork.dev/asset/brick-tenement-5257e9 |
| cast-iron-loft-d05908.glb | Cast Iron Loft | https://polyfork.dev/asset/cast-iron-loft-d05908 |
| brownstone-row-house-e58392.glb | Brownstone Row House | https://polyfork.dev/asset/brownstone-row-house-e58392 |

Note: An Innerscene CC0 40-floor glass skyscraper (more photoreal, ~12 MB) was preferred for realism but its direct GLB download was not available to the CLI at the time of selection; Polyfork NYC kit was chosen instead for reliable WebGL delivery and cohesive NYC look. If Innerscene GLB becomes fetchable, it can replace/supplement the office tower at higher scale.

Also downloaded for taller skyline (not NYC-kit but free Polyfork towers):
| File | Title | Height | Page |
|------|-------|--------|------|
| monolith-office-tower-422420.glb | Monolith Office Tower | ~41 m | https://polyfork.dev/asset/monolith-office-tower-422420 |
| capsule-residential-tower-80300b.glb | Capsule Residential Tower | ~31 m | https://polyfork.dev/asset/capsule-residential-tower-80300b |

**Primary choice for peripheral NYC skyline:** `office-tower-8d148a.glb` (NYC kit Office Tower) as the main silhouette, with Monolith Office Tower for extra height variety, plus brick tenement / cast-iron loft / brownstone for mid-rise urban fill. All scaled up when placed on the outer ring so the parachute view reads as a real city.
