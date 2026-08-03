# Capability: Lighting

## Purpose
Define TryMC's lighting model: the light rig (directional sun, hemisphere, ambient), the optional day/night cycle with a 240-second orbit, per-face baked brightness in the mesher, and sky/fog color blending. Lighting is what makes the terrain legible (face shading) and gives the world a day/night rhythm; it is deliberately simple (no dynamic AO, no torchlight).

## Scope
In scope:
- Light rig construction: `DirectionalLight` (sun), `HemisphereLight`, `AmbientLight` (`src/render/WorldRenderer.ts:52-58`).
- Day/night cycle: `cycleOn`, `timeOfDay`, `update(dt, playerPos)` sun orbit, intensity interpolation, sky/fog color blending, sun mesh (`WorldRenderer.ts:92-120`).
- Texture atlas color space (`SRGBColorSpace`) and material color handling (`src/blocks/TextureAtlas.ts:46`).
- Per-face vertex brightness baked by the mesher (`src/world/Mesher.ts:30-37`).

Out of scope:
- Block-edit light propagation (there is none — lighting is static per face).
- Shadows, AO, emissive materials, volumetric effects.
- The renderer/camera pipeline (see `rendering`).

## Functional Requirements

- **FR-L-1** — The scene contains a `DirectionalLight` (sun, color `0xfff3d6`, initial intensity `1.3`) with a `sunTarget` Object3D, a `HemisphereLight` (`0xbcd7ff` / `0x5c5c50`, intensity `0.9`), and an `AmbientLight` (`0xffffff`, intensity `0.25`) (`WorldRenderer.ts:52-58`).
- **FR-L-2** — `cycleOn` defaults to `true`; `toggleCycle()` flips it and `Game`/`HUD` reflect the state in the `#cycle` HUD element (`WorldRenderer.ts:88-90`, `Game.ts:93-95`).
- **FR-L-3** — `timeOfDay` starts at `0.27` ("just after sunrise") and advances by `dt / DAY_CYCLE_SECONDS mod 1` only while `cycleOn` (`WorldRenderer.ts:23, 92-95`).
- **FR-L-4** — The sun orbits the player: `sun.position = playerPos + normalize(cos(ang), sin(ang), 0.35) * 300`; the sun target sits at the player (`WorldRenderer.ts:107-109`).
- **FR-L-5** — Light intensities are interpolated continuously: `sun.intensity = 0.06 + max(sunH, 0) * 1.4`, `hemi.intensity = 0.18 + dayF * 0.8`, `amb.intensity = 0.15 + dayF * 0.3`, where `dayF = smoothstep(-0.15, 0.35, sunH)` and `sunH = sin(timeOfDay * 2π)` (`WorldRenderer.ts:97-99, 111-113`).
- **FR-L-6** — Dawn tint: `dawnF = max(0, 1 - |sunH| / 0.3)` blends sky toward `0xff9d4d` (`*0.5`) and sun color toward `0xff9d4d` (`*0.6`) near sunrise/sunset (`WorldRenderer.ts:100, 114-115`).
- **FR-L-7** — Sky and fog colors track each other: scene background and `Fog.color` are both set from the day/night-blended `skyColor` (`WorldRenderer.ts:102-105`).
- **FR-L-8** — The visible sun sphere (`SphereGeometry(14)`, `MeshBasicMaterial`, `fog: false`, `renderOrder: -1`) follows the sun light and is visible only when `sunH > -0.08` (`WorldRenderer.ts:60-65, 117-119`).
- **FR-L-9** — Per-face baked brightness (vertex colors) from the mesher: top faces 1.0, bottom 0.5, +x/−x 0.72, +z/−z 0.84 (`Mesher.ts:30-37`); materials use `vertexColors: true` (`WorldRenderer.ts:70-84`).
- **FR-L-10** — The atlas texture is marked `colorSpace = SRGBColorSpace` so colors render correctly (`TextureAtlas.ts:46`).

## Non-functional Requirements

- **NR-L-1** — The day/night cycle must complete in exactly `DAY_CYCLE_SECONDS` = 240 s of simulated (real) time (`src/Constants.ts:16`, `WorldRenderer.ts:94`).
- **NR-L-2** — Lighting changes must be smooth (continuous lerps, `smoothstep` day factor); no discontinuities at day/night/dawn boundaries (`WorldRenderer.ts:97-103`).
- **NR-L-3** — Sun/sky/fog transition must be perceptually correct: full night darkens the world but never to pure black (ambient floor `0.15` + hemisphere `0.18`) (`WorldRenderer.ts:111-113`).
- **NR-L-4** — **To be measured**: no quantitative brightness/lux targets; subjective appearance is the acceptance bar.

## Inputs and Outputs

Inputs:
- `dt` (frame delta) and `playerPos` (world position) to `WorldRenderer.update`.
- `cycleOn` boolean (via `toggleCycle`).
- Atlas `THREE.Texture` (color space applied at build).

Outputs:
- Mutated light intensities/colors/positions, scene background, fog color, sun mesh visibility.
- Vertex-color attributes in chunk geometry (from `Mesher`).
- `timeOfDay` and `cycleOn` state for the HUD `#cycle` element.

## Core Data Structures
- Light fields: `sun: THREE.DirectionalLight`, `sunTarget`, `hemi: THREE.HemisphereLight`, `amb: THREE.AmbientLight`, `sunMesh: THREE.Mesh` (`WorldRenderer.ts:25-29`).
- Color fields: `sunColor`, `skyColor`, `skyDay` (`0x87ceeb`), `skyNight` (`0x0d1226`), `skyDawn` (`0xff9d4d`) (`WorldRenderer.ts:31-35`).
- State: `cycleOn: boolean = true`, `timeOfDay: number = 0.27` (`WorldRenderer.ts:22-23`).
- Face brightness table: six `DirSpec.brightness` values in `DIRS` (`Mesher.ts:30-37`).

## Dependencies
- `src/render/WorldRenderer.ts` → `three`, `src/Constants.ts` (`DAY_CYCLE_SECONDS`), `src/utils/MathUtils.ts` (`smoothstep`).
- `src/world/Mesher.ts` → `three`, block/atlas constants (bakes `brightness` into vertex colors).
- `src/core/Game.ts` → `WorldRenderer` (`toggleCycle`, `cycleOn`, `update`).

## Error and Edge-Case Behavior
- **Cycle toggled mid-frame**: `update` only advances `timeOfDay` when `cycleOn`; toggling mid-orbit holds the current time — no jump (`WorldRenderer.ts:93-94`).
- **timeOfDay wraparound**: `% 1` keeps `timeOfDay ∈ [0, 1)` indefinitely (`WorldRenderer.ts:94`).
- **Night sky**: `sunMesh` is hidden when `sunH <= -0.08` to avoid showing a sun below the horizon (`WorldRenderer.ts:118`).
- **Sun below horizon**: `max(sunH, 0)` floors sun intensity at `0.06` — the world is never fully black (`WorldRenderer.ts:111`).
- **Player far from origin**: sun and target follow `playerPos`, so directional light remains correct at any coordinate; the 300-unit offset keeps the light within the scene.
- **Fog vs. cycle**: fog color is updated with sky color every frame, so distance haze matches the current sky (`WorldRenderer.ts:105`).

## Performance Expectations
- Lighting is per-frame constant-cost: a handful of scalar lerps and one `normalize` per frame — negligible.
- Vertex colors add 3 floats per vertex to chunk geometry (baked, not per-frame) (`Mesher.ts:80`).
- **To be measured**: no lighting-specific timing targets; the whole `update` is covered by the render budget in the `performance` spec.

## Acceptance Criteria
- **AC-L-1** — The world is lit with visible directional shading (top faces brighter than sides, `+z`/`-z` middle, sides per `DIRS.brightness`).
- **AC-L-2** — With the cycle on, the sky/sun brighten and darken smoothly over 240 s and the sun visibly moves.
- **AC-L-3** — Toggling the cycle (N key) freezes `timeOfDay`; toggling back on continues from the frozen time.
- **AC-L-4** — At dawn/dusk the sky and sun take on a warm orange tint.
- **AC-L-5** — At night the world darkens appreciably but remains visible (non-black).
- **AC-L-6** — The `#cycle` HUD element reads "Day/night: ON"/"Day/night: OFF" matching `renderer.cycleOn`.
- **AC-L-7** — Fog color matches the sky color at all times of day.
- **AC-L-8** — The sun sphere is visible above the horizon and hidden below it.

## Verification Method
- **AC-L-1**: E2E — inspect a solid chunk mesh's `color` attribute: top-face vertices ≈ 1.0, side ≈ 0.72/0.84, bottom ≈ 0.5. Visual — confirm face shading.
- **AC-L-2**: E2E — read `window.__mc.renderer.timeOfDay` repeatedly over ~30 s and observe monotonic increase; `renderer.cycleOn === true`. Manual — watch the sky over a full cycle.
- **AC-L-3**: E2E — capture `timeOfDay`, dispatch `KeyN`, sleep, assert unchanged; dispatch `KeyN` again, assert it resumes advancing.
- **AC-L-4 / AC-L-5 / AC-L-7**: Manual/e2e — set `timeOfDay` to dawn (~0.92) and night (~0.35) via `window.__mc.renderer.timeOfDay = v`, screenshot, and compare `scene.background` vs `scene.fog.color` equality.
- **AC-L-6**: E2E — assert `document.getElementById("cycle").textContent` matches after N-key toggling.
- **AC-L-8**: E2E — at `timeOfDay ≈ 0.35` (night) assert `sunMesh.visible === false`; during day assert visible.