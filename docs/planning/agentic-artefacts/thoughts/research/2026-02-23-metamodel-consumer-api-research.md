# Metamodel Consumer API Research — How the Codebase Uses the Metamodel

**Date:** 2026-02-23
**Purpose:** Inform type definitions for `TypeRoof/lib/js/metamodel/` by cataloging
how the metamodel APIs are **consumed** in `shell.mjs` and `components/`.

---

## 1. The Metamorphose Generator Protocol

The metamodel's central abstraction is a **coroutine-style generator protocol**
where `metamorphoseGen()` is the core state-transition primitive.

### Signature (from `base-model.ts:413-415`)

```typescript
public abstract metamorphoseGen(
    dependencies?: DependenciesMap,
): Generator<ResourceRequirement, this, unknown>;
```

**Contract:**
- **Yields:** `ResourceRequirement` objects (requests for external resources, e.g. fonts)
- **Receives via `.next()`:** The resolved resource (whatever the resolver returns)
- **Returns (final value):** The immutable state — either `this` (draft frozen) or `this[OLD_STATE]` (no change → reuse previous)

### Three Drivers

| Driver | Location | When Used |
|--------|----------|-----------|
| `driveResolverGenSync` | `base-model.ts:180` | Normal sync metamorphose — fails if any `ResourceRequirement` is yielded |
| `driveResolverGenSyncFailing` | `base-model.ts:299` | Convenience wrapper; used by `instance.metamorphose(deps)` |
| `driveResolveGenAsync` | `base-model.ts:196` | Shell uses this when fonts may need async loading |

### Shell's Async Path (`__asyncMetamorphoseState`)

```javascript
// shell.mjs:1413-1427
const draftState = draft === null ? this.state.getDraft() : draft
    , gen = draftState.metamorphoseGen(primedDependencies)
    , sharedState = {}
    , newState = await driveResolveGenAsync(
          this._asyncResolve.bind(this, sharedState), gen)
    ;
```

The `_asyncResolve` callback inspects the `ResourceRequirement.description` array:
```javascript
// shell.mjs:1336-1351
const [indicator, ...args] = resourceRequirement.description;
if (indicator instanceof ForeignKey) {
    const foreignKey = indicator
        , [targetContainer] = args;
    if (targetContainer.constructor === InstalledFontsModel)
        return await this._asyncResolveFont(foreignKey, ...args);
}
```

**Typing insight:** `ResourceRequirement.description` is an array where:
- `[0]` — a `ForeignKey` instance (the indicator)
- `[1]` — the target container (an `_AbstractOrderedMapModel` instance)
- `[2]` — the current key value (`string | undefined`)
- `[3]` — a default constraint symbol (`ForeignKey.SET_DEFAULT_FIRST` etc.)

### Shell's Sync Path (`_syncMetamorphoseState`)

```javascript
// shell.mjs:1379-1385
const draftState = draft === null ? this.state.getDraft() : draft;
return draftState.metamorphose(immutableDependencies);
```

### `createPrimalStateGen` — Bootstrap via Generator Delegation

```typescript
// base-model.ts:514-521
static *createPrimalStateGen(dependencies, serializedValue, options) {
    const instance = new Constructor(null, _DEFERRED_DEPENDENCIES, serializedValue, options);
    const gen = instance.metamorphoseGen(dependencies);
    return yield* gen;  // delegate all yields/sends to parent generator
}
```

Used in shell for initial state:
```javascript
// shell.mjs:935-938
const likeADraft = {
    metamorphoseGen: dependencies => ApplicationModel.createPrimalStateGen(dependencies)
};
await _initState(likeADraft);
```

**Typing insight:** The `likeADraft` object passed to `_initState` is a duck type
with a single `metamorphoseGen` method — it's NOT a real draft instance. This
suggests the type for the `draft` parameter in `_asyncMetamorphoseState` should
be a union or interface, not just the concrete draft class.

### `yield*` Propagation Through the Model Tree

A single top-level driver loop handles all `ResourceRequirement`s from any depth:

```
ShellController._asyncMetamorphoseState
  └─ driveResolveGenAsync(resolve, gen)
       └─ ApplicationModel.metamorphoseGen(deps)
            ├─ yield* child.metamorphoseGen(childDeps)     // struct fields
            ├─ yield* foreignKey.constraint(target, value)  // ForeignKey generators
            └─ yield* dynamicStruct.metamorphoseGen(deps)   // dynamic types
                 └─ yield* innerChild.metamorphoseGen(...)
```

---

## 2. `createClass` Patterns — How Models Are Defined

### `_AbstractStructModel.createClass`

The most common pattern. Takes a name string and field descriptors:

```javascript
// main-model.mjs:32-37
AvailableLayoutModel = _AbstractStructModel.createClass(
    'AvailableLayoutModel'
  , ['label', StringModel]
  , ['typeClass', LayoutTypeModel]
  , ['groupKey', LayoutGroupKeyModel]
)
```

Field descriptors are 2-tuples: `[fieldName: string, ModelClass | InternalizedDependency | ForeignKey | ValueLink | CoherenceFunction]`

**With CoherenceFunction (must be first):**
```javascript
// main-model.mjs:41-68
ApplicationModel = _AbstractStructModel.createClass(
    'ApplicationModel'
  , CoherenceFunction.create(['activeState', 'layoutTypeModel'], function checkTypes({activeState, layoutTypeModel}) { ... })
  , ['availableLayouts', new InternalizedDependency('availableLayouts', AvailableLayoutsModel)]
  , ['activeLayoutKey', new ForeignKey('availableLayouts', ForeignKey.NOT_NULL, ForeignKey.SET_DEFAULT_LAST)]
  , ['layoutTypeModel', new ValueLink('activeLayoutKey')]
  , ['activeState', _AbstractDynamicStructModel.createClass('DynamicLayoutModel', _BaseLayoutModel, 'layoutTypeModel', ['font', 'installedFonts'])]
  , ...
)
```

**Typing insight:** `createClass` returns a **class constructor** (not an instance).
The return type should be `typeof _AbstractStructModel` subclass with static
`createPrimalDraft`, `createPrimalState`, `createPrimalStateGen` methods,
and a `Model` property (for ordered maps/lists).

### `_AbstractGenericModel.createClass`

Simple wrapper for arbitrary values:
```javascript
// main-model.mjs:27-31
InstalledFontModel = _AbstractGenericModel.createClass('InstalledFontModel')
DeferredFontModel = _AbstractGenericModel.createClass('DeferredFontModel')
LayoutTypeModel = _AbstractGenericModel.createClass('LayoutTypeModel')
```

### `_AbstractOrderedMapModel.createClass`

Takes a name and a child model class:
```javascript
// main-model.mjs:38-40
AvailableLayoutsModel = _AbstractOrderedMapModel.createClass('AvailableLayoutsModel', AvailableLayoutModel)
AvailableFontsModel = _AbstractOrderedMapModel.createClass('AvailableFontsModel', DeferredFontModel)
InstalledFontsModel = _AbstractOrderedMapModel.createClass('InstalledFontsModel', InstalledFontModel)
```

With options:
```javascript
// actors/models.mjs:121-127
OpenTypeFeaturesModel = _AbstractOrderedMapModel.createClass('OpenTypeFeaturesModel', BooleanModel, {
    ordering: _AbstractOrderedMapModel.ORDER.KEYS_ALPHA,
    validateKeyFn: validateOpenTypeUIFeatureTag
})
```

### `_AbstractListModel.createClass`

Takes a name and a child model class:
```javascript
// actors/models.mjs:212-215
KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
TypographyKeyMomentsModel = _AbstractListModel.createClass('TypographyKeyMomentsModel', TypographyKeyMomentModel)
```

### `_AbstractDynamicStructModel.createClass`

Takes name, base type, type-selector field name, and dependency forwarding list:
```javascript
// main-model.mjs:72-76
_AbstractDynamicStructModel.createClass(
    'DynamicLayoutModel'
  , _BaseLayoutModel           // base type constraint
  , 'layoutTypeModel'          // field name that selects concrete type
  , ['font', 'installedFonts'] // dependencies to forward to inner struct
)
```

Used identically in actors, color, axes-math:
```javascript
// actors-base.mjs:55-58
_AbstractDynamicStructModel.createClass('DynamicActorModel'
  , _BaseActorModel, 'typeClass', ['font', 'installedFonts'])

// color.mjs:191-193
_AbstractDynamicStructModel.createClass('DynamicColorModel'
  , _BaseColorModel, 'typeClass', [])
```

### `_AbstractEnumModel.createClass`

Takes name, allowed values array, and default:
```javascript
// actors/models.mjs:163-178
TextAlignmentModel = _AbstractEnumModel.createClass('TextAlignmentModel', ['left', 'center', 'right', 'start', 'end'], 'left')
CSSPositioningVerticalModel = _AbstractEnumModel.createClass('CSSPositioningVerticalModel', ['top', 'bottom'], 'top')
CSSDirectionModel = _AbstractEnumModel.createClass('CSSDirectionModel', ['ltr', 'rtl', 'inherit'], 'inherit')
```

### `_AbstractSimpleOrEmptyModel.createClass`

Takes a wrapped model class (no name):
```javascript
// actors/models.mjs:115,159-162
FontSizeModel = _AbstractSimpleOrEmptyModel.createClass(NumberModel)
BooleanOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(BooleanModel)
StringOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(StringModel)
NumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(NumberModel)
TextAlignmentOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(TextAlignmentModel)
```

---

## 3. Dependencies Object — Shape and Construction

### The Shape

Dependencies are **plain objects** mapping string keys to immutable model instances:
```typescript
type DependenciesMap = { [key: string]: _BaseModel }
// e.g. { availableFonts: AvailableFontsModel, installedFonts: InstalledFontsModel, ... }
```

### Shell Constructs Dependencies Three Ways

**1. Sync path — `_collecStateDependencies()`:**
```javascript
// shell.mjs:1222-1237
for (const [key, [referenceCounter, draft]] of this._stateDependenciesDrafts) {
    if (referenceCounter <= 0)
        dependencies[key] = draft.metamorphose({});  // draft → immutable
}
```

**2. Async path — `__asyncMetamorphoseState`:**
```javascript
// shell.mjs:1389-1404
primedDependencies['installedFonts'] = InstalledFontsModel.createPrimalDraft({});  // fresh empty
primedDependencies['availableFonts'] = this._requireStateDependencyDraft(key);     // existing draft
primedDependencies['availableLayouts'] = this._readStateDependency(key);           // read-only
```

**3. Component code — from parent model's `.dependencies`:**
```javascript
// Various component files
const newMoment = keyMoments.constructor.Model.createPrimalDraft(keyMoments.dependencies);
const draft = GridPropertiesModel.createPrimalDraft(dependencies);
```

**Typing insight:** `createPrimalDraft` and `createPrimalState` both accept
a `DependenciesMap` (often just `{}`). Component code often passes
`existingModel.dependencies` to create siblings of the same type.

### Three Dependency Categories in the Shell

| Key | Model Class | Mutation |
|-----|-------------|----------|
| `availableFonts` | `AvailableFontsModel` | Draft shared across font ops |
| `installedFonts` | `InstalledFontsModel` | Fresh empty draft for async; populated by resolver |
| `availableLayouts` | `AvailableLayoutsModel` | Read-only after init |

---

## 4. State Access Patterns

### `get(fieldName)` — Accessing Struct Fields

Returns the child model instance at that field:
```javascript
// shell.mjs:900-902 — Writing to draft fields
availableLayout.get('typeClass').value = LayoutModule.Model;
availableLayout.get('label').value = label;

// shell.mjs:1010 — Deep draft access
this.draftState.get('activeFontKey').value = fontName;

// shell.mjs:203 — Reading immutable
const deferredFont = availableFonts.get(fontName).value;
```

**Typing insight:** `get()` on a struct draft returns the child model (which may
also be a draft). The `.value` property is the inner JS value. On
`_AbstractGenericModel`, `.value` can be anything. On `NumberModel` it's a number, etc.

### `set(key, entry)` — Setting Entries in OrderedMap

```javascript
// shell.mjs:206
installedFontsDraft.set(fontName, fontState);

// shell.mjs:321
availableFontsDraft.set(deferredFont.fullName, fontState);
```

### `has(key)` / `keys()` / `delete(key)` — Map-like Operations

```javascript
// shell.mjs:197,201,208,222,278,334,338,1282,1289
availableFonts.has(fontName)
installedFontsDraft.has(fontName)
installedFontsDraft.delete(fontName)
[...installedFonts.keys()]
new Set(availableFontsDraft.keys())
```

### `push(...entries)` — Appending to OrderedMap/List

```javascript
// shell.mjs:545 — OrderedMap push with [key, entry] tuples
availableFontsDraft.push(...keyEntriesInOriginalLoadOrder);

// shell.mjs:903 — OrderedMap push
availableLayoutsDraft.push([key, availableLayout]);

// actors-base.mjs:149
availableActorTypesDraft.push([key, availableActorType]);

// task-automations/simple-clock.mjs:87 — List push (no key, just entry)
activeActors.push(containerActorDraft);
```

**Typing insight:** `push()` on OrderedMap takes `[key, entry]` tuples.
`push()` on List takes bare entries. Both accept variadic args.

### `getEntry(state, path)` / `getDraftEntry(state, path)` — Path-Based Access

```javascript
// shell.mjs:1083-1110 — widgetBus.getEntry: tries draft first, falls back to immutable
getEntry: path => {
    let entry = null;
    if (this.draftState) {
        try { entry = getDraftEntry(this.draftState, path); }
        catch(error) { if (!isDraftKeyError(error)) throw error; }
    }
    if (entry === null)
        entry = getEntry(this.state, path);
    return entry;
}

// shell.mjs:960 — Direct path-based value setting
getEntry(this.draftState, 'activeState/playing', {value: undefined}).value = uiFlags.has('autoplay');
```

**Typing insight:** `getEntry` and `getDraftEntry` take a root state and a
string path (slash-separated). They return a model instance. The third
`{value: ...}` parameter in `getEntry` appears to be a default/options object.

### `getDraft()` — Creating Mutable Copies

```javascript
// shell.mjs:1182 — Start of a change transaction
const draft = this.state.getDraft();

// shell.mjs:1481 — Re-draft after async metamorphose
return this._syncMetamorphoseState(newState.getDraft());

// Components: common pattern
const newMoment = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft();
```

### `.isDraft` — Draft Detection

```javascript
// shell.mjs:1104 — Safety check
if (!this.draftState && (entry.isDraft || _PotentialWriteProxy.isProxy(entry)))
    throw new Error('ASSERTION FAILED entry must not be draft...');

// shell.mjs:1580 — State validation
if (newState.isDraft)
    throw new Error('VALUE ERROR new state must be immutable, but is a draft.');
```

---

## 5. StateComparison & COMPARE_STATUSES

### Construction

```javascript
// shell.mjs:1583-1584
const compareResult = new StateComparison(this.state, newState)
    , statuses = new Set(compareResult.map(([status,,]) => status))
    ;
```

### Usage in Shell

```javascript
// shell.mjs:1590 — Short-circuit if nothing changed
if (statuses.size === 1 && statuses.has(COMPARE_STATUSES.EQUALS))
    return;

// shell.mjs:1595 — Pass to UI for differential update
this._ui.update(compareResult);
```

### Usage in Components (`basics.mjs`)

```javascript
// basics.mjs:945-987 — UI widget update cycle
update(compareResult) {
    const requiresFullInitialUpdate = this._provisionWidgets(compareResult);
    this._update(compareResult, requiresFullInitialUpdate, false);
}

// basics.mjs:958-960 — Creating initial comparison for new widgets
const _compareResult = (!isInitialUpdate && requiresFullInitialUpdate)
    ? StateComparison.createInitial(compareResult.newState, widgetWrapper.dependencyMapping)
    : compareResult;

// basics.mjs:1118-1119 — Destructuring status constants
const {LIST_NEW_ORDER, EQUALS, MOVED, NEW, CHANGED} = StateComparison.COMPARE_STATUSES;
```

**Typing insight:** `StateComparison` is array-like (has `.map()`). Each entry
is a tuple `[status, oldPath?, newPath?]`. It has properties:
- `.newState` — the new state
- `.isInitial` — boolean
- `.getChangedMap(dependencyMapping, toLocal)` — returns a map of changes
- Static: `StateComparison.createInitial(state, deps)`
- Static: `StateComparison.COMPARE_STATUSES` (same as exported `COMPARE_STATUSES`)

---

## 6. ForeignKey + ResourceRequirement — The Async Resolution Pattern

### ForeignKey Constraint Generators

ForeignKey supports a `CUSTOM` constraint that is a **generator function**:

```javascript
// main-model.mjs:149-161
['activeFontKey', new ForeignKey('installedFonts', ForeignKey.NOT_NULL, ForeignKey.CUSTOM,
    function* (targetContainer, currentKeyValue) {
        const key = yield new ResourceRequirement(
            this,                           // the ForeignKey instance
            targetContainer,                // OrderedMap model
            currentKeyValue,                // string | undefined
            ForeignKey.SET_DEFAULT_FIRST    // fallback strategy
        );
        if (!targetContainer.has(key)) {
            if (this.allowNull) return ForeignKey.NULL;
            throw keyConstraintError(new Error(`CONSTRAINT ERROR...`));
        }
        return key;
    }
)]
```

### ResourceRequirement Constructor

```typescript
// base-model.ts:169-178
export class ResourceRequirement {
    public description: unknown[];
    constructor(...description: unknown[]) {
        this.description = description;
    }
}
```

**Typing insight:** `ResourceRequirement` is deliberately loosely typed — it's
a bag of arguments. The shell's `_asyncResolve` destructures it by convention:
`[foreignKey, targetContainer, currentKey, defaultConstraint]`. A stricter
type could be defined but might be premature given the current flexibility.

### Variants in Components

```javascript
// actors/models.mjs:228-236 — nullable font key, different default
['activeFontKey', new ForeignKey('installedFonts', ForeignKey.ALLOW_NULL, ForeignKey.CUSTOM,
    function* (targetContainer, currentKeyValue) {
        if (this.allowNull && (!currentKeyValue || currentKeyValue === ForeignKey.NULL))
            return ForeignKey.NULL;
        const key = yield new ResourceRequirement(this, targetContainer, currentKeyValue,
            this.allowNull ? ForeignKey.SET_NULL : ForeignKey.NO_ACTION);
        ...
    }
)]
```

---

## 7. Model Inheritance Patterns

### Subclassing Abstract Models

```javascript
// main-model.mjs:25
export class _BaseLayoutModel extends _AbstractStructModel {}

// actors-base.mjs (inferred)
export class _BaseActorModel extends _AbstractStructModel {}
```

These marker classes serve as the `BaseType` constraint for `_AbstractDynamicStructModel`.

### Using `.constructor.Model` for Dynamic Type Access

```javascript
// Components frequently access the child model type through the constructor:
keyMoments.constructor.Model.createPrimalDraft(keyMoments.dependencies)
keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft()
```

**Typing insight:** The `.constructor.Model` property is the child model class
set by `createClass`. For `_AbstractListModel` and `_AbstractOrderedMapModel`,
`Model` is the model class for entries. This is a static property on the
generated class.

---

## 8. `unwrapPotentialWriteProxy` Usage

```javascript
// main-model.mjs:47
const WrappedType = unwrapPotentialWriteProxy(activeState).WrappedType;

// shell.mjs:1104
_PotentialWriteProxy.isProxy(entry)
```

**Typing insight:** `unwrapPotentialWriteProxy` returns the underlying model
instance (strips the Proxy wrapper if present). The return type should be
the same model type. `_PotentialWriteProxy.isProxy()` is a type guard.

---

## 9. `InternalizedDependency` and `ValueLink`

### InternalizedDependency

Makes an external dependency appear as a struct field:
```javascript
// main-model.mjs:69,77-78
['availableLayouts', new InternalizedDependency('availableLayouts', AvailableLayoutsModel)]
['availableFonts', new InternalizedDependency('availableFonts', AvailableFontsModel)]
['installedFonts', new InternalizedDependency('installedFonts', InstalledFontsModel)]
```

### ValueLink

Dereferences a ForeignKey to provide the actual entry:
```javascript
// main-model.mjs:71,162
['layoutTypeModel', new ValueLink('activeLayoutKey')]
['font', new ValueLink('activeFontKey')]
```

---

## 10. Summary of Key Typing Insights for the Metamodel

| Area | Insight | Affects |
|------|---------|---------|
| `metamorphoseGen` return | `Generator<ResourceRequirement, T, unknown>` where T is the concrete model type | All model files |
| `createClass` return type | Returns a class constructor with static methods, not an instance | All `*-model.ts` files |
| `DependenciesMap` | `Record<string, _BaseModel>` or more specific per-model | `base-model.ts`, all models |
| `createPrimalDraft(deps)` | Takes `DependenciesMap`, returns a draft instance | All model classes |
| `.value` property | Type varies: `any` on GenericModel, `number` on NumberModel, `string` on StringModel, enum value on EnumModel | All simple models |
| `.get(field)` on struct | Returns child model instance at field | struct-model, dynamic-struct-model |
| `.get(key)` on map | Returns entry model instance for key | ordered-map-model |
| `.has()`/`.keys()`/`.set()`/`.delete()`/`.push()` | Map-like interface on OrderedMap; List has push but not key-based ops | ordered-map-model, list-model |
| `ResourceRequirement.description` | Array: `[ForeignKey, targetContainer, currentKey, defaultConstraint]` | base-model, foreign-key |
| `StateComparison` | Array-like with `.map()`, entries are `[status, oldPath?, newPath?]` | compare.ts |
| `.constructor.Model` | Static property — the child model class for list/map containers | list-model, ordered-map-model |
| `.dependencies` | Frozen object on immutable instances, writable on drafts | All models |
| `unwrapPotentialWriteProxy` | Returns underlying model, stripping Proxy if present | potential-write-proxy, util |
| `isDraft` property | Boolean — `true` on mutable draft, `false` on frozen immutable | All models |
| Duck-typed draft | Shell passes `{ metamorphoseGen: fn }` as "like a draft" for initial state | base-model typing consideration |
