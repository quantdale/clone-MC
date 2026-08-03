# Capability: Inventory

## Purpose
Define TryMC's player inventory model: a fixed 9-slot hotbar of placeable block types, how the active selection changes (number keys, scroll wheel, with 90-degree wrap-around), and how the selection drives block placement. The inventory is intentionally simple — there are no item quantities or persistence; the hotbar is the complete inventory.

## Scope
In scope:
- `HOTBAR` definition (`src/blocks/Blocks.ts:67-77`).
- Hotbar selection state (`Game.selected`) and `select()` (`src/core/Game.ts:132-135`).
- Selection inputs: `Digit1..Digit9` keys and the wheel handler with modular wrap (`Game.ts:88-95, 110-118`).
- `placeBlock` using the selected block (`Game.ts:158-179`).
- HUD hotbar slots synchronization (`setSelected` in `src/ui/HUD.ts`).

Out of scope:
- Item quantities, stacks, crafting, dropping, inventory UI beyond the hotbar (see `user-interface`).
- Breaking/placing mechanics (see `block-interaction`).

## Functional Requirements

- **FR-INV-1** — `HOTBAR` is a fixed 9-entry `readonly Block[]`: Grass, Dirt, Stone, Sand, Log, Leaves, Water, Bedrock, Brick (`Blocks.ts:67-77`).
- **FR-INV-2** — `Game.selected` holds the current hotbar index; `select(i)` sets it and calls `hud.setSelected(i)` (`Game.ts:132-135`).
- **FR-INV-3** — `Digit1`–`Digit9` key presses select slots 0–8; digits outside `1..HOTBAR.length` are ignored (`Game.ts:90-92`).
- **FR-INV-4** — The mouse wheel wraps the selection: `(selected + dir + HOTBAR.length) % HOTBAR.length` with `dir = +1`/`-1` by `deltaY` sign; `preventDefault` is applied (`Game.ts:110-118`).
- **FR-INV-5** — `placeBlock` places `HOTBAR[this.selected]` at the hit face's adjacent cell (`Game.ts:161`).
- **FR-INV-6** — `HUD` builds 9 slot elements (div.slot with 40×40 canvas, slot number, and block name) and highlights the selected slot via the `selected` class (`HUD.ts:40-58, 68-71`).
- **FR-INV-7** — `HUD.attachAtlas(atlas)` draws each slot's canvas icon from the texture atlas (`representativeTex`: Grass→GrassTop, Log→LogSide, others→BLOCKS[b].textures[0]) (`HUD.ts:4-13, 60-66`).

## Non-functional Requirements

- **NR-INV-1** — Selection must wrap 90 degrees continuously around the 9-slot bar, in both scroll directions (`Game.ts:115`).
- **NR-INV-2** — Slot selection is index-based; all 9 block types are always placeable (unlimited), matching the sandbox design.
- **NR-INV-3** — **To be measured**: n/a — no performance constraints apply to inventory state; it is a single integer + DOM classes.

## Inputs and Outputs

Inputs:
- `DigitN` keydown events.
- `wheel` events (deltaY).
- `attachAtlas(textureAtlas)` at startup (from `Game`).
- `setSelected(i)` / `setLocked(locked)` / `toggleDebug()` from `Game`.

Outputs:
- `Game.selected` mutation; `hud.selected` mirror.
- Selected slot highlight (CSS class on `.slot.selected`).
- Slot canvas icons (pixels on 40×40 canvases).

## Core Data Structures
- `HOTBAR: readonly Block[]` (`Blocks.ts:67-77`).
- `Game.selected: number` (`Game.ts:20`).
- `HUD.selected: number`; `HUD.slotEls: HTMLElement[]` (`HUD.ts:24-36`).
- `BlockDef.name` for slot labels (`Blocks.ts:31`).

## Dependencies
- `src/core/Game.ts` → `src/blocks/Blocks.ts` (`HOTBAR`, `BLOCKS`), `src/ui/HUD.ts`.
- `src/ui/HUD.ts` → `src/blocks/Blocks.ts`, `src/blocks/TextureAtlas.ts` (`TextureAtlas.drawTile`).
- `src/main.ts` → `new HUD()` and `Game(canvas, hud)` wiring (`src/main.ts:31-33`).

## Error and Edge-Case Behavior
- **Out-of-range digit**: keys outside `1..9` are ignored; no wrap on number keys (`Game.ts:91-92`).
- **Wheel wrap**: the modulo expression is positive for both scroll directions, so selection can never go out of `[0, 8]` (`Game.ts:115`).
- **Missing DOM**: slot elements are created dynamically by `HUD`; a missing `#hotbar` is a fatal init error caught by `main.ts` (`main.ts:6-19, 39-59`).
- **Canvas 2D unavailable**: `attachAtlas` uses `getContext("2d")` non-null assertion — a null context would throw during startup and surface via the fatal overlay; the atlas build itself throws on a missing context (`TextureAtlas.ts:33-35`).
- **Pointer unlock**: `Game` clears `player.keys` on unlock; selection state is independent of lock state and persists.

## Performance Expectations
- Slot icons are painted once at startup (9 × `drawImage` of 16×16 source at 40×40), negligible.
- Per-frame inventory work: none beyond the already-shared HUD update loop.
- **To be measured**: n/a.

## Acceptance Criteria
- **AC-INV-1** — The hotbar contains exactly the 9 blocks of `HOTBAR`, in order.
- **AC-INV-2** — Pressing `Digit1`–`Digit9` selects the matching slot and highlights it in the HUD.
- **AC-INV-3** — Scrolling up/down cycles selection and wraps seamlessly from slot 8 → 0 and 0 → 8.
- **AC-INV-4** — `placeBlock` places the block type of the currently selected slot.
- **AC-INV-5** — Each slot shows a pixelated icon matching the block's representative texture (grass top for Grass, log side for Log, first-face texture otherwise).
- **AC-INV-6** — Exactly one slot is highlighted as selected at all times.

## Verification Method
- **AC-INV-1**: Unit — import `HOTBAR` and assert length 9 and member order. (No unit tests exist yet; create under `tests/**/*.test.ts`.)
- **AC-INV-2 / AC-INV-3**: Manual — press 1–9 and scroll; observe highlight. E2E — dispatch `keydown` `Digit1`..`Digit9` on `window` and read `window.__mc.selected`; dispatch `wheel` events and assert wrap behavior.
- **AC-INV-4**: E2E — select a slot, right-click a block, and read `getBlockWorld` at the placement cell; assert it equals `HOTBAR[selected]`.
- **AC-INV-5**: Visual — screenshot/eyeball the hotbar icons; assert `image-rendering: pixelated` on `.slot canvas` (`src/style.css:79-82`).
- **AC-INV-6**: E2E — assert `document.querySelectorAll(".slot.selected").length === 1` after several selection changes.