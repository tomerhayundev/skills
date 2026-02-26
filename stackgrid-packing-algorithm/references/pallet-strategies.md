# Pallet Packing Strategies — Deep Reference

## Table of Contents
1. [Strategy Selection Logic](#strategy-selection-logic)
2. [Strategy A: With Carton](#strategy-a-with-carton)
3. [Strategy B: Block (Multi-Part)](#strategy-b-block-multi-part)
4. [Strategy C: Optimize (2-Part Body/Lid)](#strategy-c-optimize-2-part-bodylid)
5. [Strategy D: Single Part (No Carton)](#strategy-d-single-part-no-carton)
6. [Pallet-in-Container Arrangement](#pallet-in-container-arrangement)
7. [Visualization Generation](#visualization-generation)

---

## Strategy Selection Logic

```
calculateWithCarton == true  ->  Strategy A
calculateWithCarton == false:
  parts.length > 1:
    palletMultiPartStrategy == 'block'    ->  Strategy B
    palletMultiPartStrategy == 'optimize' ->  Strategy C (only if parts.length === 2)
  parts.length == 1  ->  Strategy D
```

---

## Strategy A: With Carton

Items placed on pallet are **cartons**, not raw parts.

1. `deriveLayoutMetrics(cartonLayout, ...)` -> `{ internalCartonDimensions, productsInCarton }`
2. Add wall thickness: `carton_[l/w/h] = internal_[l/w/h] + walls[L/W/H] x thickness`
3. Generate all 6 orientation permutations of `[carton_l, carton_w, carton_h]`
4. For each unique **height** value (deduplicated), define one test orientation with that dim as the vertical axis
5. For each test orientation `(l, w, h)`:
   - Skip if `h > availableProductHeight`
   - If `upwardDimensionConstraint != 'none'`: compute `fillerOrientationsForLayer` (see Constraint section below)
   - `calculateOptimalLayerArrangement(palletL, palletW, l, w, fillerOrientations)` -> items per layer
   - `layers = 1 + floor((availableHeight - h) / h)` (cartons don't nest)
   - `itemsPerPallet = itemsPerLayer x layers`
6. Pick best orientation by `itemsPerPallet`
7. `productsPerPallet = itemsPerPallet x productsInCarton`

**Constraint propagation (`constraintScope`):**
- `'main'`: fillers can rotate but must share the same height `h`. Find all 3D orientations with `o[2] === h`, extract their bases `[o[0],o[1]]` and `[o[1],o[0]]`, deduplicate.
- `'all'`: fillers must also use only `[l, w]` or `[w, l]` (same orientation as main).

---

## Strategy B: Block (Multi-Part)

Treats the `palletBlockLayout` DAG as a pre-arranged block and places it as a single rigid unit.

1. `deriveLayoutMetrics(palletBlockLayout, ...)` -> `{ internalCartonDimensions: {l,w,h}, productsInBlock }`
2. `l_item = l, w_item = w, h_item = h`; block doesn't nest, so `stackingIncrement = h_item`
3. `layersPerPallet = 1 + floor((availableHeight - h_item) / stackingIncrement)`
4. `itemsPerLayer = calculateOptimalLayerArrangement(palletL, palletW, l_item, w_item).count`
5. `itemsPerPallet = itemsPerLayer x layersPerPallet`
6. `productsPerPallet = itemsPerPallet x productsInBlock`

Visualization: each block instance rendered using `derivedPalletBlockData.boxesFor3D` (individual parts inside), offset by block origin and layer.

---

## Strategy C: Optimize (2-Part Body/Lid)

Maximizes **complete sets** (body+lid pairs) on a single pallet. Parts must be exactly 2.

`parts[0]` = body (Part 1), `parts[1]` = lid (Part 2).

### Phase 1: Layer footprint
```
layerArrangement = calculateOptimalLayerArrangement(palletL, palletW, part1.length, part1.width)
totalStacksOnLayer = sum of (block.n[0] x block.n[1]) for all blocks
```

### Phase 2: Per-stack capacities
```
p1_stack_inc = part1.nest > 0 ? part1.nest : part1.height
p1_per_stack = 1 + floor((availableHeight - part1.height) / p1_stack_inc)

p2_stack_inc = part2.nest > 0 ? part2.nest : part2.height
p2_per_stack = 1 + floor((availableHeight - part2.height) / p2_stack_inc)
```

### Phase 3: Optimal split search
Iterate `numPureBodyStacks` from 0 to `totalStacksOnLayer`:
- `numPureLidStacks = totalStacks - numPureBodyStacks - 1` if mixed stack exists, else 0
- `p1_from_pure = numPureBodyStacks x p1_per_stack`
- `p2_from_pure = numPureLidStacks x p2_per_stack`

**For the mixed stack** (if `numPureBodyStacks < totalStacks`):
Iterate `k` (bodies in mixed stack) from 0 to `p1_per_stack`:
```
if k == 0:
  lidsOnTop = p2_per_stack
else:
  heightOfBodyStack = (k-1) x p1_stack_inc + part1.height
  topOfLastBody = palletHeight + heightOfBodyStack
  baseOfFirstLid = topOfLastBody - optimizePartOverlap
  topOfFirstLid = baseOfFirstLid + part2.height
  if topOfFirstLid <= maxHeight:
    lidsOnTop = 1 + floor((maxHeight - topOfFirstLid) / p2_stack_inc)
  else:
    lidsOnTop = 0
```
Pick `k` that minimizes `|p1_total - p2_total|`, tie-break by maximizing `p1+p2`.

### Phase 4: Best config selection
```
currentCompleteSets = min(finalP1, finalP2)
```
Best = max `completeSets`, tie-break: min `|p1-p2|`.

### Phase 5: Final result
```
equalCount = min(bestConfig.p1, bestConfig.p2)
productsPerPallet = equalCount x 2
stackBreakdown = { pureBody, pureLid, mixed: { count, bodies, lids } }
```

### Visualization (optimize strategy)
Iterates `layerArrangement.blocks` in order (pure body stacks first, then mixed, then pure lid stacks):
- Detects rotation: `isRotated = abs(itemL - part1.length) > 0.1`
- Part 2 viz dims respect rotation: `p2_viz_L = isRotated ? part2.width : part2.length`
- Draws each part at its exact `y_base` position accounting for stacking increment and overlap

---

## Strategy D: Single Part (No Carton)

Simplest path: place `parts[0]` directly.

```
l_item = part.length, w_item = part.width, h_item = part.height
stackInc = part.nest > 0 ? part.nest : h_item
layersPerPallet = 1 + floor((availableHeight - h_item) / stackInc)
itemsPerLayer = calculateOptimalLayerArrangement(palletL, palletW, l_item, w_item).count
itemsPerPallet = itemsPerLayer x layersPerPallet
productsPerPallet = itemsPerPallet
```

---

## Pallet-in-Container Arrangement

After computing `productsPerPallet` for any strategy:

```
bestArrangement = calculateOptimalPalletArrangement(
  container.length, container.width, palletL, palletW
)
palletsPerLayer = bestArrangement.count
totalPalletsInContainer = palletsPerLayer x (isPalletStackingEnabled ? palletStackingLayers : 1)
totalProducts = productsPerPallet x totalPalletsInContainer
```

**Stacking constraint:** if stacking enabled, skip this pallet/container combo if `maxHeight x palletStackingLayers > container.height`.

---

## Visualization Generation

`fullContainerDataFor3D` is built by iterating `bestArrangement.layout.rows`:
- Renders all pallets as brown boxes (`color: '#a1887f'`)
- **Optimization:** only populates products on the very first pallet in the first layer
- Handles pallet rotation: if `row.isRotated`, swaps X/Z coordinates and adds `Math.PI/2` to `rotationY`
- Layer offset: `layerOffsetY = layerIndex x maxHeight`

`actualPalletHeight` = `max(box.position[1] + box.size[1]/2)` across all product boxes in first pallet.
