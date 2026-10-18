# CHANGE-004 verification

| Check | Command / evidence | Result |
| ----- | ------------------ | ------ |
| Types | `npx tsc --noEmit` | clean |
| Lint | `npx eslint . --max-warnings 0` | clean |
| Unit | `npx vitest run` | 57/57 pass |
| E2E | `npx playwright test` | 23/23 pass, 1 skipped (prod smoke on dev project) |
| Visual | `docs/screenshot-fixed.png`, `docs/screenshot-overview.png` | checkerboard gone; textures tile per block; sky gradient + clouds; sparse trees; HUD/hotbar correct |
| Atlas | `docs/atlas.png` | 14 tiles painted, nearest sampling |
| Perf | `docs/shot-stats.json` | settled 169-chunk view ~47k tris, 0 pending gen/mesh |

## Confirmed fixes vs. the filed screenshot

| Symptom in `terriblemc.png` | Status |
| --------------------------- | ------ |
| Checkerboard/black voids on merged faces | fixed — shader tile sampling |
| Flat gray sky | fixed — gradient sky dome + horizon-matched fog |
| Spiky noisy terrain | fixed — smoother heightmap, low-amplitude detail |
| Trees as dense blobs | fixed — forest clustering, oak/spruce shapes |
| Holes in cliff faces | fixed — caves sealed near cliff columns |
| Leaf holes as voids | fixed — culling honors the `opaque` flag |
| 21 FPS with runaway triangle counts | fixed — merges restored; ~47k tris |
| World carpeted in foliage | fixed — `hash2` returned ~53% negative values |
