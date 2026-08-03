# Capability: User Interface

## Purpose
Define TryMC's user-facing interface: the DOM HUD, loading/click-to-play/fatal overlays, the hotbar, and the crosshair. The UI is pure DOM/CSS (no canvas HUD); it reads status from the game and exposes the interaction affordances (pointer lock entry, loading progress, debug overlay). Bootstrap and fatal-failure handling are part of this capability because they define the user's first impression of startup.

## Scope
In scope:
- `HUD` (`src/ui/HUD.ts`): FPS, XYZ position, chunk counter, day/night indicator, debug overlay (F3), slot canvases and selection highlight, loading progress, pointer-lock click-to-play overlay.
- DOM structure and ids in `index.html`.
- Styling in `src/style.css`.
- Bootstrap and fatal-error overlay in `src/main.ts`.
- Window-resize handling in `src/core/Game.ts`.

Out of scope:
- Inventory selection logic (see `inventory`).
- Game loop / world state (see `chunk-streaming`, `rendering`).
- In-game settings menus, chat, key rebinding — none exist.

## Functional Requirements

- **FR-UI-1** — `index.html` provides the canvases and overlays: `#game` (WebGL canvas), `#crosshair`, `#hud` (`#fps`, `#pos`, `#chunks`, `#cycle`, `#debug`), `#hotbar`, `#loading` (`#loadtext`, `#loadbar`/`#loadbarfill`), `#clickToPlay`, `#fatal` (`index.html:11-44`).
- **FR-UI-2** — `main.ts` validates all 12 required DOM ids on startup and throws on any missing one; the failure is caught and rendered into the `#fatal` overlay with the error message (`main.ts:6-25, 39-59`).
- **FR-UI-3** — A successful boot constructs `HUD` and `Game`, starts the game, and exposes `window.__mc` for automated validation (`main.ts:27-37`).
- **FR-UI-4** — `HUD` (`new HUD()`) builds 9 hotbar slots with a 40×40 canvas icon, slot number, and block name; slot 0 is selected initially (`HUD.ts:40-58`).
- **FR-UI-5** — `setFps(fps)` renders `FPS <n>`; `setPos` renders `XYZ <x> <y> <z>` (floored); `setChunks(n)` renders `Chunks <n>`; `setCycle(on)` renders "Day/night: ON"/"Day/night: OFF" (`HUD.ts:73-88`).
- **FR-UI-6** — `setDebug` renders "pending gen N · pending mesh N · edited N · tris N" into `#debug`; `toggleDebug()` hides/shows the `#debug` element (F3, default visible) (`HUD.ts:89-100`).
- **FR-UI-7** — `setLoadingProgress(p)` (0..1) sets `#loadbarfill` width and `#loadtext` percentage; reaching 1.0 calls `finishLoading()` which hides `#loading` (`HUD.ts:106-115`).
- **FR-UI-8** — `setLocked(locked)` hides/shows `#clickToPlay` when pointer lock engages (`HUD.ts:102-104`); the canvas click requests pointer lock (`Game.ts:125-127`).
- **FR-UI-9** — The game loop refreshes HUD fields every frame: FPS (4×/second), XYZ, chunk count, and debug stats (`Game.ts:199-214`); `setLoadingProgress` is driven by `loadedCount() / 25` until 25 chunks load (`Game.ts:11-12, 216-220`).
- **FR-UI-10** — Window resize updates the HUD indirectly through the renderer (`renderer.resize`, `Game.ts:128-129`); the DOM overlays are CSS-positioned and adapt automatically.
- **FR-UI-11** — `#fatal` (hidden by default) is revealed with the error message and hides `#clickToPlay`/`#loading` when initialization fails (`main.ts:44-58`).
- **FR-UI-12** — The crosshair is rendered via CSS pseudo-elements (`#crosshair::before/::after`) and has no pointer capture (`style.css:23-51`).

## Non-functional Requirements

- **NR-UI-1** — The loading overlay must hide within a short time after boot: it completes once `loadedCount() >= 25` chunks are resident (`Game.ts:216-220`).
- **NR-UI-2** — The UI must not block the WebGL canvas: HUD/overlays are `pointer-events: none` except interactive elements (`style.css:57, 105-111, 113-127`).
- **NR-UI-3** — Text must remain legible over any terrain: white monospace with black text-shadow, high z-index layering (`style.css:105-110`).
- **NR-UI-4** — **To be measured**: no performance targets for DOM updates (9 text writes/frame is negligible); FPS HUD reads are authoritative.

## Inputs and Outputs

Inputs:
- DOM events: `keydown`/`keyup` (digits, N, F3), `wheel`, `mousedown` (0/2), `click`, `contextmenu`, `mousemove`, `pointerlockchange`, `resize` (`Game.ts:87-129`).
- `attachAtlas(atlas)` typing and `setSelected(i)`/`setLocked(locked)`/`setLoadingProgress(p)` calls from the game.
- `setFps`/`setPos`/`setChunks`/`setCycle`/`setDebug` calls from `Game.update`.

Outputs:
- Mutated DOM text/classes: `#fps`, `#pos`, `#chunks`, `#cycle`, `#debug`, `#loadbarfill` width, `#loadtext`, `#loading` hidden, `#clickToPlay` hidden, `.slot.selected`, `#fatal` shown.
- Pointer-lock request on canvas click.

## Core Data Structures
- `HUD` fields: `selected`, private element refs (`fpsEl`, `posEl`, `chunkEl`, `cycleEl`, `lockEl`, `loadEl`, `loadBar`, `loadText`, `hotbarEl`, `slotEls`, `debugEl`, `debugOn`) (`HUD.ts:24-38`).
- `REQUIRED_IDS` (12 ids) in `main.ts` (`main.ts:6-19`).
- `INITIAL_TARGET = 25` loading threshold in `Game.ts` (`Game.ts:12`).
- Slot: `div.slot` containing `canvas[40×40]`, `span.num`, `span.name` (`HUD.ts:41-54`).

## Dependencies
- `src/ui/HUD.ts` → `src/blocks/Blocks.ts`, `src/blocks/TextureAtlas.ts` (type).
- `src/main.ts` → `./style.css`, `src/core/Game.ts`, `src/ui/HUD.ts`.
- `index.html` → `/src/main.ts` (module entry).
- `src/core/Game.ts` → `src/ui/HUD.ts` (drives status fields).

## Error and Edge-Case Behavior
- **Missing DOM id**: `getRequired` throws; `main.ts` reveals `#fatal` with the message and hides `#clickToPlay`/`#loading`; falls back to `alert` if `#fatal` is itself missing (`main.ts:44-58`).
- **WebGL / atlas failure**: `TextureAtlas.build` throws when the 2D context is unavailable (`TextureAtlas.ts:33-35`); propagated through `Game` constructor → `main.ts` fatal path.
- **Loading progress bounds**: `clampPct` clamps input to `[0,1]` so `#loadbarfill` never exceeds 100% (`HUD.ts:118-120`).
- **F3 toggle**: `#debug` starts visible (`debugOn = true`); `toggleDebug()` returns the new state (`HUD.ts:96-100`).
- **Pointer lock already active**: `isLocked()` guards mouse/click handlers; locking on an unlocked canvas re-requests (idempotent) (`Game.ts:223-225, 125-127`).
- **Right-click suppression**: `contextmenu` is prevented globally so placement doesn't open the browser menu (`Game.ts:119`).

## Performance Expectations
- Status fields are updated per frame via `textContent` (reflow-free for positioned fixed elements); FPS throttled to ~4 updates/second (`Game.ts:199-205`).
- Slot icons are painted once at startup.
- **To be measured**: none — DOM overhead is expected to be sub-millisecond per frame.

## Acceptance Criteria
- **AC-UI-1** — On boot the loading overlay appears with "Generating world…" and a progress bar that fills to 100% and hides once ≥ 25 chunks load.
- **AC-UI-2** — Missing any of the 12 required DOM ids at startup surfaces the error in `#fatal` (no silent crash).
- **AC-UI-3** — After loading, `#fps`, `#pos`, `#chunks`, `#cycle` show live values that change as the player moves.
- **AC-UI-4** — F3 toggles the `#debug` overlay; default state is visible; it shows `pending gen/mesh`, `edited`, and `tris`.
- **AC-UI-5** — `#clickToPlay` is visible before pointer lock and hidden after the canvas is clicked.
- **AC-UI-6** — The hotbar shows 9 slots with icons, numbers 1–9, and exactly one selected highlight; selection follows number keys/scroll.
- **AC-UI-7** — The crosshair is centered and does not intercept mouse events.
- **AC-UI-8** — Resizing the window keeps the layout fault-free (overlays stay fixed, canvas fills the viewport).
- **AC-UI-9** — `window.__mc` is defined after boot and exposes the `Game` instance for validation.

## Verification Method
- **AC-UI-1**: Manual/E2E — observe `#loading` progress counting up and hiding; assert `#loading` has the `hidden` class once `window.__mc.manager.loadedCount() >= 25`.
- **AC-UI-2**: E2E — temporarily remove a required element (DevTools), reload, assert `#fatal` appears with a message.
- **AC-UI-3**: E2E — read `#fps`/`#pos`/`#chunks`/`#cycle` textContent after boot; move and assert `#pos` and `#chunks` change.
- **AC-UI-4**: E2E — dispatch `KeyF3` and assert `#debug` classList toggles `hidden`.
- **AC-UI-5**: E2E — assert `#clickToPlay` visible before pointer lock; click the canvas and assert hidden (or request pointer lock in a headed browser).
- **AC-UI-6**: E2E — assert `document.querySelectorAll(".slot").length === 9` and `.slot.selected` count is 1; dispatch `Digit5` and assert slot index 4 selected.
- **AC-UI-7**: CSS/manual — assert `#crosshair` has `pointer-events: none` and is centered (`style.css:23-32`).
- **AC-UI-8**: Manual — resize window and confirm no layout breakage.
- **AC-UI-9**: E2E — evaluate `typeof window.__mc !== "undefined"` in the page context.