# Debugging Guide — StackGrid Packing Algorithm

## Table of Contents
1. [Zero Results / Empty Response](#zero-results--empty-response)
2. [Wrong Carton Dimensions](#wrong-carton-dimensions)
3. [Utilization Seems Off](#utilization-seems-off)
4. [3D Visualization Misaligned](#3d-visualization-misaligned)
5. [Optimize Strategy Not Balancing Parts](#optimize-strategy-not-balancing-parts)
6. [Layout Metrics Returns Zero Dimensions](#layout-metrics-returns-zero-dimensions)
7. [Constraint Filtering Produces No Results](#constraint-filtering-produces-no-results)
8. [Pallet Strategy Silently Skips](#pallet-strategy-silently-skips)

---

## Zero Results / Empty Response

**Container mode returns `[]` or `null`:**
1. `productsInCarton <= 0` -> check `layout` has groups, all `partId`s exist in `parts`
2. `internalCartonDimensions` has a zero dimension -> check `quantity > 0` for all groups
3. `carton_[l/w/h] <= 0` -> wall settings are producing negative internal dims? (thickness x walls > internal)
4. No orientation fits in container -> items might be larger than container; check dimensions
5. `mainOrientations.length === 0` after constraint filtering -> constraint may be impossible (see Constraint Filtering section)

**Pallet mode returns `null`:**
- `activePallets.length === 0` or `selectedPalletContainerPresets.length === 0`
- `availableProductHeight = maxHeight - palletHeight <= 0` -> pallet itself taller than max height
- Strategy-specific: `itemsPerPallet === 0` -> items too large for pallet footprint or height

---

## Wrong Carton Dimensions

The carton external dimensions are:
```
carton_l = internal_l + wallsLength x thickness
carton_w = internal_w + wallsWidth  x thickness
carton_h = internal_h + wallsHeight x thickness
```

`internal_*` comes from `deriveLayoutMetrics`. Verify:
- `cartonSettings.wallsLength/Width/Height` are wall **counts** (e.g. 2 for both sides), not total thickness
- `cartonSettings.thickness` is the thickness of ONE wall in mm
- `isOuterCartonDimensions` flag: if true on a part, its `nest` value applies as the increment for ALL axes

**Coordinate remapping:** `deriveLayoutMetrics` returns `{ l: finalDims.x, w: finalDims.z, h: finalDims.y }` — the Y axis (height) maps to `h`, the Z axis (width) maps to `w`. If you see l and w swapped, check if the layout groups use the right `stackDirection`.

---

## Utilization Seems Off

Utilization = `packedVolume / containerVolume x 100`.

`packedVolume` sums `n[0] x n[1] x n[2] x (dims[0] x dims[1] x dims[2])` for every block in all zones (main + 7 fills). If it's unexpectedly low:
- Check if the main block is leaving large remainder zones that aren't being filled (the 7-zone fill should handle this)
- Check if `upwardDimensionConstraint` is preventing efficient orientations
- The guillotine cut approach is not globally optimal — for pathological dimensions, there may be inherent waste

---

## 3D Visualization Misaligned

**`BoxData` coordinate system:**
- `position` = center of box in mm: `[X, Y, Z]` = `[Length, Height, Width]`
- `size` = `[L, H, W]` (not `[L, W, H]`)
- Three.js renders: `position[0]` -> Three.js X, `position[1]` -> Three.js Y, `position[2]` -> Three.js Z

**Container visualization:**
Uses representative L-shape + vertical line rendering (not full grid). If boxes look sparse, this is intentional for performance. The count shown is still the full calculated count.

**Pallet visualization:**
- Products only drawn on first pallet in first layer; other pallets show as empty brown boxes
- `rotationY` is cumulative: `(box.rotationY || 0) + (row.isRotated ? Math.PI/2 : 0)`
- Block strategy: each block instance uses `derivedPalletBlockData.boxesFor3D` offset by `(blockOrigin.x + partPos.x, ...)` where `partPos` already includes a centering offset of `(l_item/2, h_item/2, w_item/2)`

**Origin mismatch for container boxes:**
In `generateBoxesFromZone`, positions are `[zoneOx + blockOx + i*L + L/2, zoneOz + blockOz + k*H + H/2, zoneOy + blockOy + j*W + W/2]` — note `zoneOy` maps to the Z coordinate (width), and `zoneOz` maps to the Y coordinate (height). This matches the X=Length, Y=Height, Z=Width convention.

---

## Optimize Strategy Not Balancing Parts

The 'optimize' strategy minimizes `|p1 - p2|` but the final result enforces strict equality:
```
equalCount = min(bestConfig.p1, bestConfig.p2)
productsPerPallet = equalCount x 2
```
So even if the algorithm finds p1=5, p2=6, the result is 5 bodies + 5 lids = 10 products.

If the balance seems wrong:
1. Check `optimizePartOverlap` (mm): higher value means lids can sit lower (overlapping bodies), fitting more lids in a mixed stack
2. Check `part.nest` values: higher nest increment means more items per stack (smaller increment = more height consumed per item)
3. The mixed stack is always the LAST stack slot explored; pure body stacks are numbered first. If `numPureBodyStacks = totalStacks`, there is NO mixed stack.

---

## Layout Metrics Returns Zero Dimensions

`deriveLayoutMetrics` returns `{ l:0, w:0, h:0 }` when:
1. `layout.length === 0` or `parts.length === 0`
2. No groups have `relativeToId === 'origin'` (no starting node) AND the sanity fallback still can't find any group
3. All groups have `quantity === 0`
4. All `partId`s are missing from `partsMap`

The sanity check `sanityCheck < layout.length * 2` will exit early on cyclic references — this produces partial bounding boxes and potentially wrong dimensions.

---

## Constraint Filtering Produces No Results

`mainOrientations.length === 0` happens when the constraint can't be satisfied with the carton's dimensions:
- `upwardDimensionConstraint: 'thinCarton'` but all permutations have the same min dim in position `p[1]` (i.e. the carton is a cube) -> the filter still works (returns all orientations where the cube side faces up)
- `upwardDimensionConstraint: 'length'` but `carton_l` is not present in any permutation's `p[2]` position -> impossible; function returns `null`/`[]`

Fix: verify that the named dimension actually exists in the carton's dimension set.

---

## Pallet Strategy Silently Skips

`computePalletDetail` uses a nested IIFE that returns early in many places with `return null` or `continue`. The outer function only sees the final `resultList`. Breakpoints to add mentally:

1. `availableProductHeight <= 0` -> `continue` inside pallet loop
2. `maxHeight > selectedContainer.height` -> `continue`
3. `isPalletStackingEnabled && (maxHeight x layers) > container.height` -> `continue`
4. Strategy-specific: `productsInCarton <= 0` -> `return null` (exits entire IIFE)
5. `bestSetup.itemsPerPallet <= 0` (carton mode) -> `continue`
6. `itemsPerPallet === 0` (single/block) -> `continue`
7. `productsPerPallet === 0` (non-optimize) -> `continue`
8. `palletsPerLayerInContainer <= 0` -> no result pushed

Use `console.warn` in the worker (they appear in `wrangler dev` logs) to trace which gate is triggering.
