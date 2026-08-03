# Capability: Player Controller

## Purpose
Define how TryMC controls the first-person player: pointer-lock mouse look, WASD movement with smoothing, sprint, jump, gravity, water buoyancy/swimming, axis-separated AABB collision against the voxel grid, head bob, and sprint FOV kick. The `PlayerController` owns the camera transform and integrates the player's position/velocity each frame.

## Scope
In scope:
- `PlayerController` (`src/player/PlayerController.ts`): state (`pos`, `vel`, `yaw`, `pitch`, `onGround`, `inWater`, `keys`), `addMouse`, `update`, `collideAxis`, water detection, safety net, head bob, FOV kick.
- Movement constants from `src/Constants.ts`.
- Collision with the voxel grid via `manager.getBlockWorld`.

Out of scope:
- Camera/lighting/environment (see `rendering`, `lighting`).
- Block targeting/breaking/placing (see `block-interaction`).
- Input wiring (keyboard/mouse events bind in `src/core/Game.ts`; the controller only receives SDK-driven calls).

## Functional Requirements

- **FR-PC-1** — `PlayerController` is constructed with a `THREE.PerspectiveCamera` and exposes `pos`, `vel`, `yaw`, `pitch`, `onGround`, `inWater`, `keys` (`PlayerController.ts:19-30`).
- **FR-PC-2** — `addMouse(dx, dy)` updates `yaw`/`pitch` with sensitivity `0.0022` and clamps `pitch` to `±1.55` rad (`PlayerController.ts:37-42`).
- **FR-PC-3** — `update(dt, manager)` reads input keys (`KeyW/KeyS/KeyD/KeyA`, `ShiftLeft/ShiftRight`, `Space`), computes a wish direction rotated by `yaw`, and normalizes it (`PlayerController.ts:44-62`).
- **FR-PC-4** — Movement speed is `SPRINT_SPEED` (5.9) when sprinting forward, else `WALK_SPEED` (4.35), multiplied by `0.55` in water (`PlayerController.ts:64`).
- **FR-PC-5** — Horizontal velocity is exponentially smoothed toward the wish velocity with a faster rate on the ground (`k = 1 - exp(-dt*12)` on ground, `1 - exp(-dt*2.2)` airborne) (`PlayerController.ts:65-67`).
- **FR-PC-6** — Gravity: when not in water, `vel.y -= GRAVITY*dt` (gravity 28), clamped to `-55`; jump sets `vel.y = JUMP_SPEED` (9.2) only when `onGround` (`PlayerController.ts:73-79`).
- **FR-PC-7** — Water: when in water, `vel.y` eases toward `4.2` (space) or `-2.5` (sink) with rate `min(1, dt*6)` (`PlayerController.ts:69-71`).
- **FR-PC-8** — Water detection (`isInWater`): `inWater` is true when the block at `floor(pos)` at `y + 0.6` or `y + 1.4` is `Block.Water` (`PlayerController.ts:109-116`).
- **FR-PC-9** — Collision is axis-separated and order Y → X → Z: `collideAxis(1, vel.y*dt, ...)` then `collideAxis(0, ...)` then `collideAxis(2, ...)` (`PlayerController.ts:83-85`).
- **FR-PC-10** — `collideAxis` only collides with solid (non-Air, non-Water) blocks, checks overlap on the other two axes, and resolves the position with an epsilon `1e-4`; Y-down collision sets `onGround = true`; velocity is zeroed on the resolved axis (`PlayerController.ts:118-160`).
- **FR-PC-11** — Safety net: if `pos.y < -16`, the player is teleported to `(0, 60, 0)` with zero velocity (`PlayerController.ts:88-91`).
- **FR-PC-12** — Camera: position = `pos + (0, EYE_HEIGHT + bob, 0)`; rotation `(pitch, yaw, 0, "YXZ")` (`PlayerController.ts:97-98`).
- **FR-PC-13** — Head bob: when moving on the ground, `bobPhase += dt * (sprint ? 13 : 10)`; bob offset `sin(bobPhase) * 0.055` (`PlayerController.ts:94-96`).
- **FR-PC-14** — Sprint FOV kick: `fov` eases toward `82` when sprinting forward and moving, else `75`, via `updateProjectionMatrix` (`PlayerController.ts:101-106`).

## Non-functional Requirements

- **NR-PC-1** — Near-instant ground response: ground smoothing rate `12` gives fast convergence; airborne rate `2.2` is slower for a floaty feel (`PlayerController.ts:65`).
- **NR-PC-2** — Pitch is clamped to `±1.55` rad to prevent over-the-shoulder inversion (`PlayerController.ts:40-41`).
- **NR-PC-3** — Collision is axis-separated so the player can slide along walls and step cleanly; Y is resolved first for stable ground contact (`PlayerController.ts:81-85`).
- **NR-PC-4** — **To be measured**: actual movement feel and deceleration handling are subjective; no quantitative responsiveness target is specified.

## Inputs and Outputs

Inputs:
- `dx, dy` mouse deltas to `addMouse`.
- `dt` and `manager: ChunkManager` to `update`.
- `keys: Set<string>` populated by the caller (`Game.bindEvents`).

Outputs:
- Mutated `pos`, `vel`, `yaw`, `pitch`, `onGround`, `inWater`, `bobPhase`.
- Camera `position`, `rotation`, `fov` (and `updateProjectionMatrix` calls).

## Core Data Structures
- `pos: THREE.Vector3`, `vel: THREE.Vector3` (player feet position and velocity) (`PlayerController.ts:21-22`).
- `yaw`, `pitch` (radians), `onGround`, `inWater` (bools), `keys: Set<string>` (`PlayerController.ts:23-27`).
- `bobPhase` (private), `half = PLAYER_HALF_WIDTH` (0.3), `sensitivity = 0.0022` (`PlayerController.ts:29-31`).
- Constants: `EYE_HEIGHT=1.62`, `PLAYER_HEIGHT=1.8`, `PLAYER_HALF_WIDTH=0.3`, `GRAVITY=28`, `JUMP_SPEED=9.2`, `WALK_SPEED=4.35`, `SPRINT_SPEED=5.9` (`src/Constants.ts:7-13`).

## Dependencies
- `src/player/PlayerController.ts` → `three`, `src/blocks/Blocks.ts` (`Block`), `src/Constants.ts`, `src/world/ChunkManager.ts` (type only).
- `src/core/Game.ts` → `PlayerController` (constructs with `this.renderer.camera`, calls `update`/`addMouse`).

## Error and Edge-Case Behavior
- **Out-of-world fall**: `pos.y < -16` triggers the safety net teleport to `(0, 60, 0)` (`PlayerController.ts:88-91`).
- **Missing chunks**: `isInWater` and `collideAxis` call `getBlockWorld`, which returns `Block.Air` for missing chunks — so the player falls through a not-yet-loaded chunk rather than colliding with nothing; `onGround` simply stays false. This is the intended streaming behavior.
- **Water/air boundary**: water blocks are non-solid for collision (`id === Block.Water` is skipped), so the player swims through them; `inWater` is computed from the head/body water blocks (`PlayerController.ts:136, 109-116`).
- **Zero delta**: `collideAxis` returns immediately when `delta === 0` (`PlayerController.ts:119`).
- **Pitch clamp**: input beyond ±1.55 rad is clamped, not wrapped (`PlayerController.ts:40-41`).
- **Key clear on unlock**: `Game` clears `player.keys` on pointer-lock loss so stale keys are not held (`src/core/Game.ts:120-124`).

## Performance Expectations
- Collision is O(overlapping cells) over the player's AABB footprint (up to `3×3×3` cells checked per axis), each via a single `getBlockWorld` lookup.
- No per-frame allocations of note; `update` runs once per frame.
- **To be measured**: no standalone performance target; the controller is expected to be negligible relative to the render/chunk budgets.

## Acceptance Criteria
- **AC-PC-1** — `addMouse` updates `yaw`/`pitch` and clamps `pitch` to `[-1.55, 1.55]`.
- **AC-PC-2** — Holding `KeyW` moves the player forward along the yaw direction; `KeyA`/`KeyD` strafe; `KeyS` moves backward.
- **AC-PC-3** — Sprinting (`ShiftLeft`/`ShiftRight`) while moving forward raises speed to `SPRINT_SPEED` and constantizes `fov` toward 82.
- **AC-PC-4** — `Space` jumps only when `onGround`; falling applies gravity and the player returns to the ground and rests (`onGround` true).
- **AC-PC-5** — In water, gravity is replaced by buoyancy: the player floats up when holding `Space` and sinks when not; `inWater` is true.
- **AC-PC-6** — The player cannot pass through solid blocks (AABB collision); walking into a wall stops the X/Z velocity and the player slides along it.
- **AC-PC-7** — Walking off a cliff leads to a fall; the safety net teleports the player if `pos.y < -16`.
- **AC-PC-8** — The camera tracks the player position plus `EYE_HEIGHT` and rotates with `yaw`/`pitch`; head bob is applied while moving.
- **AC-PC-9** — Camera projection is updated when FOV changes (no perspective distortion lag).

## Verification Method
- **AC-PC-1**: Unit — construct `PlayerController` with a stub camera, call `addMouse` with large deltas, assert `pitch` is clamped to `±1.55` and `yaw`/`pitch` change by `dx*0.0022` / `dy*0.0022`. (No unit tests exist yet; create under `tests/**/*.test.ts`.)
- **AC-PC-2 / AC-PC-3 / AC-PC-4**: Manual — play with WASD/Shift/Space and observe movement, sprint speed, and jump. E2E — drive `keys` via `window.__mc.player.keys` and assert `pos` changes over successive `update` calls.
- **AC-PC-5**: Manual — walk into water, observe floating/sinking and `inWater` toggling. Unit — set `pos` under water and assert `isInWater`/buoyancy behavior.
- **AC-PC-6**: Unit — place a solid block in front of the player, run `update`, assert X/Z velocity is zeroed and the player does not penetrate the block. Manual — walk into a wall.
- **AC-PC-7**: Unit — set `pos.y = -20`, run `update`, assert `pos` becomes `(0, 60, 0)` and `vel` is zero.
- **AC-PC-8 / AC-PC-9**: E2E — verify `camera.position` equals `pos + (0, EYE_HEIGHT, 0)` (plus bob) and `camera.rotation` matches `yaw`/`pitch`; verify `camera.fov` returns to 75 after sprint ends.