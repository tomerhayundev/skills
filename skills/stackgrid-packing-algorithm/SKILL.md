---
name: stackgrid-packing-algorithm
description: >
  Deep knowledge of the StackGrid packing algorithm system — the proprietary core of the
  container/pallet optimization engine. Use this skill when working on any task that involves:
  (1) modifying or debugging packing calculation logic in apps/worker/src/algorithms/,
  (2) understanding how carton/pallet results are computed or why they differ,
  (3) extending the algorithm with new strategies (e.g. new constraint types, multi-part modes),
  (4) debugging 3D visualization data (boxesFor3D) that comes from container or pallet calculations,
  (5) understanding the CartonLayoutGroup DAG traversal and how internal carton dimensions are derived,
  (6) performance or correctness analysis of the packing engine.
  Triggers on keywords: "packing algorithm", "calculation result", "utilization", "carton dimensions",
  "packZone", "guillotine", "layerArrangement", "palletDetail", "containerDetail", "layout metrics",
  "nesting", "upwardDimensionConstraint", "optimize strategy", "mixed stack", "boxesFor3D".
---

# StackGrid Packing Algorithm

## Architecture Overview

All algorithm files live in `apps/worker/src/algorithms/` — server-side only, never copy to frontend.

| File | Role |
|------|------|
| `layoutMetrics.ts` | Derives internal carton dimensions from a `CartonLayoutGroup[]` DAG |
| `packingAlgorithms.ts` | Core 2D guillotine packer + pallet-in-container optimizer |
| `containerPacking.ts` | Container mode: cartons packed into a shipping container |
| `palletPacking.ts` | Pallet mode: items/cartons on pallets, pallets in container |

**Read order for unfamiliar tasks:** `layoutMetrics` -> `packingAlgorithms` -> (`containerPacking` or `palletPacking`)

## Coordinate System (Critical)

**X = Length, Y = Height, Z = Width** — consistent across all files and Three.js rendering.

- `internalCartonDimensions`: `{ l, w, h }` maps to `{ x, z, y }` from the bounding box
- `BoxData.position`: center point in mm; Three.js scales by 0.001 (mm -> meters)

---

## Key Algorithms

### 1. Layout Metrics (`layoutMetrics.ts`)

`deriveLayoutMetrics(layout, parts, partsMap?)` traverses `CartonLayoutGroup[]` as a DAG.

- **Start:** groups with `relativeToId === 'origin'`
- **BFS:** for each group: compute `groupDim` (bounding box of stacked parts), then position origin relative to parent bounds
- **Placements:** `above` (Y+), `beside` (X+), `infront` (Z+) — each with `horizontal`/`vertical` alignment (`start`/`center`/`end`)
- **Stack directions:** `length` (X+), `width` (Z+), `height` (Y+, default)
- **Nesting formula:** `total_dim = base_dim + (qty - 1) * increment`; increment = `nest` if `nest > 0`, else full dim; `isOuterCartonDimensions=true` forces `increment = nest` for all axes
- **Sanity guard:** `sanityCheck < layout.length * 2` prevents infinite loops on cyclic/orphaned groups
- Returns bounding box as `{ l: finalDims.x, w: finalDims.z, h: finalDims.y }`

### 2. Core 2D Layer Packer (`packingAlgorithms.ts`)

#### `packLayer(spaceL, spaceW, itemOrientations)`
Guillotine cut packer for a single 2D space:
1. Maintains a queue of free rectangles
2. For each space: picks orientation that maximizes `areaUsed / spaceArea`
3. After placing best fit (nx x ny grid): splits remainder into 2 non-overlapping spaces (right strip + bottom strip)
4. Returns `{ count, blocks[] }` — blocks have `{ dims, n, origin }`

#### `calculateOptimalLayerArrangement(palletL, palletW, prodL, prodW, fillerOrientations?)`
1. For each unique main orientation: fill the main grid (nx x ny)
2. Compute 2 remainder spaces; pack each with `packLayer` (using `fillerOrientations` when constrained)
3. Returns the orientation giving highest total count with its block list

#### `calculateOptimalPalletArrangement(containerL, containerW, palletL, palletW)`
Tests 4 strategies: all non-rotated, all rotated, mixed starting non-rotated rows, mixed starting rotated rows. Returns `PalletArrangement` with `layout.rows[]` (each row: `{ isRotated, palletCount, palletSize }`).

### 3. Container Packing (`containerPacking.ts`)

#### 3D `packZone(spaceL, spaceW, spaceH, orientations)`
- Spaces sorted by volume desc each iteration (greedy largest-first)
- Best fit by volume efficiency; splits into 3 remainder zones: top (`+H`), right (`+L`), front (`+W`)
- Safety break at 200 iterations

#### Main optimization loop
For each main orientation -> pack main `(nx, ny, nz)` grid -> fill **7 surrounding remainder zones** (X, Y, Z, XY, XZ, YZ, XYZ) -> pick max total across all main orientations.

#### Carton dimensions formula
```
carton_l = internal_l + wallsLength x thickness
carton_w = internal_w + wallsWidth  x thickness
carton_h = internal_h + wallsHeight x thickness
```

#### `upwardDimensionConstraint` filtering
Filters which orientations are allowed as main orientation (and optionally fillers):
- `'none'` -> all 6 permutations allowed
- `'thinCarton'` -> only orientations where `p[1] === min(dims)` (thinnest dim faces up)
- `'length'|'width'|'height'` -> only orientations where `p[2]` equals the named carton dimension

`constraintScope: 'all'` means remainder zones also use the same constrained orientations.

#### Visualization (`boxesFor3D`)
Representative boxes only (not full grid) for 3D performance:
- First row `[i, 0, 0]`, first column `[0, j, 0]`, vertical stack `[0, 0, k]`
- `position` = center point; `size` = `[L, H, W]`; `color` from `ORIENTATION_COLORS` map

#### Carton weight estimate
`emptyCartonWeightGrams = 2 x (l x w + l x h + w x h) x 0.0007` (surface area x density factor)

### 4. Pallet Packing (`palletPacking.ts`)

Three strategies selected by input flags. See `references/pallet-strategies.md` for full detail.

**Quick reference:**
- `calculateWithCarton: true` -> cartons as packing units; tests unique height orientations
- `palletMultiPartStrategy: 'block'` -> multi-part block treated as single unit
- `palletMultiPartStrategy: 'optimize'` (2-part only) -> body/lid co-optimization with mixed stacks
- Single part (default) -> direct layer arrangement with nesting increment

After computing `productsPerPallet`, calls `calculateOptimalPalletArrangement` to get pallets per container layer, then multiplies by `palletStackingLayers`.

---

## Common Debugging Patterns

See `references/debugging.md`.

## Data Flow

See `references/data-flow.md` for the full request -> store -> API -> algorithm -> response chain.
