# Data Flow: StackGrid Packing Engine

## Table of Contents
1. [Type Definitions](#type-definitions)
2. [Container Mode Flow](#container-mode-flow)
3. [Pallet Mode Flow](#pallet-mode-flow)
4. [Key Input Types](#key-input-types)
5. [Key Output Types](#key-output-types)

---

## Type Definitions

All types live in `packages/shared/src/types.ts`. Key ones:

```typescript
// A physical product component
ProductPart {
  id, sku, color
  length, width, height  // mm
  weight                 // grams
  nest                   // mm — nesting decrement per item
  isOuterCartonDimensions?: boolean  // raw nest mode
  stl?: File             // optional 3D model (stripped before worker)
}

// One group of stacked parts in a layout
CartonLayoutGroup {
  id: string
  partId: string
  quantity: number
  stackDirection: 'length' | 'width' | 'height'
  relativeToId: string   // 'origin' or another group's id
  placement: 'above' | 'beside' | 'right-of' | 'infront' | 'in-front-of'
  alignment: { horizontal: 'start'|'center'|'end', vertical: 'start'|'center'|'end' }
  spacing: number        // mm gap between groups
}

// Carton wall settings
CartonSettings {
  thickness: number      // mm — single wall thickness
  wallsLength: number    // number of walls along length (typically 2)
  wallsWidth: number
  wallsHeight: number
}

// A single box for 3D rendering
BoxData {
  position: [x, y, z]   // center point in mm (X=Length, Y=Height, Z=Width)
  size: [l, h, w]        // [L, H, W] in mm
  color: string
  isProduct?: boolean
  partId?: string
  rotationY?: number     // radians
  isRotatedOnLayer?: boolean
}
```

---

## Container Mode Flow

```
User action (wizard)
  -> calculationStore.calculate()
  -> POST /api/calculate/container
  -> Hono route handler (apps/worker/src/routes/calculate.ts)
     |
     +-> computeContainerScenarioSummaries(input)
     |     layoutMetrics.deriveLayoutMetrics()  [get carton box size]
     |     For each container preset:
     |       Try all 6 orientations as main
     |       packZone() x7 remainder zones
     |     -> ContainerScenarioSummary[]
     |
     +-> computeContainerDetail(input)  [for selected container]
           layoutMetrics.deriveLayoutMetrics()
           packZone() main + 7 fills
           generateVisualizationData()  -> BoxData[]
           buildArrangementDetails()    -> ArrangementDetail[]
           -> CalculationResult
```

### `CalculationResult` fields
```typescript
{
  id: string
  cartonDimensions: { l, w, h }
  totalCartons: number
  totalProducts: number
  productsWeightInCarton: number    // grams
  emptyCartonWeight: number         // grams
  totalCartonWeight: number         // kg
  bestOrientation: string           // human-readable
  arrangementDetails: ArrangementDetail[]
  boxesFor3D: BoxData[]
  utilization: number               // 0-100%
  containerType: string
  containerDimensions: { l, w, h }
  partsBreakdown: PartBreakdown[]   // only if parts.length > 1
  totalSets: number                 // = totalCartons
}
```

---

## Pallet Mode Flow

```
User action (wizard)
  -> palletStore.calculate()
  -> POST /api/calculate/pallet
  -> Hono route handler
     |
     +-> computePalletScenarioSummaries(input)
     |     For each pallet x container combo:
     |       calculateOptimalLayerArrangement()
     |       calculateOptimalPalletArrangement()
     |     -> PalletScenarioSummary[]
     |
     +-> computePalletDetail(input)  [for selected combo]
           deriveLayoutDataWithBoxes()  [internal: full viz data for carton layout]
           Strategy selection:
             calculateWithCarton -> carton as unit
             block               -> palletBlockLayout as unit
             optimize            -> 2-part body/lid algorithm
             single              -> part directly
           calculateOptimalLayerArrangement()  -> layer result
           calculateOptimalPalletArrangement() -> pallet arrangement
           Build fullContainerDataFor3D         -> BoxData[] (all pallets + products on first)
           -> PalletCalculationResult
```

### `PalletCalculationResult` fields
```typescript
{
  id: string
  palletDimensions: { l, w }
  palletHeight: number
  palletsInContainer: number
  productsPerLayer: number
  layersPerPallet: number
  productsPerPallet: number
  totalProducts: number
  layerArrangementDetails: ArrangementDetail[]
  boxesFor3D: BoxData[]                    // products on first pallet only
  fullContainerDataFor3D?: BoxData[]       // all pallets + products on first
  palletBaseFor3D: { x, y }               // pallet footprint for wireframe
  containerType: string
  containerDimensions: { l, w, h }
  cartonDimensions?: { l, w, h }          // if calculateWithCarton
  palletStrategy: 'single' | 'block' | 'optimize'
  stackBreakdown?: StackBreakdown          // optimize strategy only
  totalSets?: number
  actualPalletHeight?: number             // mm, computed from visualization
  partsBreakdown: PartBreakdown[]
  palletArrangementDetails: string        // formatted human-readable
  palletArrangementDetailsKey: PalletArrangementDetailsKey
}
```

---

## Key Input Types

### Container mode input
```typescript
{
  layout: CartonLayoutGroup[]
  parts: Omit<ProductPart, 'stl'>[]
  cartonSettings: CartonSettings
  selectedContainerPresets: string[]     // e.g. ['20FT', 'CUSTOM']
  container: ContainerProperties         // used when preset === 'CUSTOM'
  upwardDimensionConstraint: 'length' | 'width' | 'height' | 'thinCarton' | 'none'
  constraintScope: 'main' | 'all'
}
```

### Pallet mode input (detail)
```typescript
{
  parts: Omit<ProductPart, 'stl'>[]
  cartonLayout: CartonLayoutGroup[]
  palletBlockLayout: CartonLayoutGroup[]
  cartonSettings: CartonSettings
  calculateWithCarton: boolean
  pallet: PalletProperties
  containerPreset: string
  palletModeContainer: ContainerProperties
  palletMultiPartStrategy: 'block' | 'optimize'
  optimizePartOverlap: number            // mm — how much lids overlap bodies in mixed stack
  upwardDimensionConstraint: ...
  constraintScope: ...
  isPalletStackingEnabled: boolean
  palletStackingLayers: number
}
```
