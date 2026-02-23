
## Proposed Refactoring Plan for `metamodel.ts`

### 1. **`links.ts`** (~100 lines)
Lines 82–215. The small dependency-descriptor classes:
- `_BaseLink`, `KeyValueLink`, `ValueLink`
- `FallBackValue`
- `InternalizedDependency`
- `StaticDependency`

These are self-contained data classes with no cross-dependencies to the big model classes.

### 2. **`topological-sort.ts`** (~120 lines)
Lines ~216–390. Pure utility logic:
- `topologicalSortKahn()`
- `collectDependencies()`
- Helper `_mapGetOrInit()`

Only depends on `FreezableSet` from `base-model.ts` and `_NOTDEF` from `util.ts`.

### 3. **`potential-write-proxy.ts`** (~350 lines)
Lines ~392–845. The `_PotentialWriteProxy` class plus:
- Private symbols (`_LOCAL_PROXIES`, `_OLD_TO_NEW_SLOT`, etc.)
- `_requiresPotentialWriteProxy()`
- `unwrapPotentialWriteProxy()`
- `objectEntriesAreEqual()`

This is a well-defined subsystem — the copy-on-write proxy machinery.

### 4. **`struct-model.ts`** (~1300 lines)
Lines ~917–2218. `_AbstractStructModel` — the biggest single class. Includes `createClass()` and the complex `_metamorphoseGen` / `_lockItem` / `_lockDependencies` logic.

### 5. **`list-model.ts`** (~580 lines)
Lines ~2219–2800. `_AbstractListModel` plus `toShuffle()`.

### 6. **`ordered-map-model.ts`** (~830 lines)
Lines ~2800–3656. `_AbstractOrderedMapModel` plus `MAP_ORDER`.

### 7. **`dynamic-struct-model.ts`** (~570 lines)
Lines ~3657–4231. `_AbstractDynamicStructModel`.

### 8. **`simple-models.ts`** (~920 lines)
Lines ~4232–5155. The simpler/leaf model classes:
- `_AbstractGenericModel`
- `_AbstractEnumModel`
- `_AbstractSimpleOrEmptyModel`
- `_AbstractNumberModel`
- `BooleanModel`, `BooleanDefaultTrueModel`

Could also be split further per class, but they're small individually.

### 9. **`type-utils.ts`** (~50 lines)
Lines ~5250–5300. Factory/helper functions:
- `createAvailableTypes()`
- `createDynamicType()`
- `getMinMaxRangeFromType()`
- `getFieldsByType()`

### 10. **`path.ts`** (~230 lines)
Lines ~5304–5530. The `Path` class — fully self-contained.

### 11. **`accessors.ts`** (~120 lines)
Lines ~5530–5650. The state access/mutation helpers:
- `getAllPathsAndValues()`
- `_getEntry()`, `getDraftEntry()`, `getEntry()`, `getValue()`
- `_getAllEntries()`, `getModel()`
- `applyTo()`, `pushEntry()`, `popEntry()`, `spliceEntry()`, `deleteEntry()`

### 12. **`compare.ts`** (~600 lines)
Lines ~5650–6251. The comparison subsystem:
- `CompareStatus`, `COMPARE_STATUSES`
- `rawCompare()`
- `compare()`
- `StateComparison`, `InitialStateComparison`

---

### Dependency flow (roughly):

```
base-model.ts, util.ts, coherence-function.ts   (already exist)
       ↓
links.ts, topological-sort.ts, path.ts          (no model deps)
       ↓
potential-write-proxy.ts                          (needs base-model)
       ↓
struct-model.ts, list-model.ts,                  (need proxy + links)
ordered-map-model.ts, dynamic-struct-model.ts
       ↓
simple-models.ts                                  (need base-model)
       ↓
type-utils.ts, accessors.ts                      (need models + path)
       ↓
compare.ts                                        (needs models + path)
```

A barrel `metamodel.ts` (or `index.ts`) would re-export everything so downstream consumers don't break.

