# harfbuzzjs v1.x Upgrade + opentype.js Replacement Implementation Plan

- Research: `~/thoughts/research/2026-08-20-1445-harfbuzzjs-upgrade-opentypejs-replacement.md`
- harfbuzzjs checkout: `/var/lib/agent/harfbuzzjs` (main == origin/main == `cfe067c`, v1.6.0, HarfBuzz 14.3.1)
- TypeRoof: branch `fix/modern-font-parsing`, commit `c2ad58a2`

## Overview

opentype.js (unmaintained upstream) crashes on valid fonts (`parseSTATTable`: "STAT axis count
must be greater than or equal to fvar axis count"). We (1) upgrade the vendored harfbuzzjs from
the v0.x-based `graphicore/TypeRoof-main` fork to upstream v1.x (all fork deltas are absorbed
upstream), then (2) replace all opentype.js parsing with a harfbuzzjs-based metadata shim in
`lib/js/font-info.mjs`, keeping only the fork's `opentype.woffToOTF`. The legacy app gets the
same replacement.

## Operator decisions (2026-08-20)

1. **fvar named instances**: parse via `Face.referenceTable('fvar')` — the format is fixed and
   trivial (~40 lines). Code must carry a comment that binding `hb_ot_var_named_instance_*`
   upstream (graphicore branch → PR) is the good alternative if this ever grows.
   Only if implementation proves non-trivial: add the binding to a branch on the graphicore
   remote instead (operator may PR it).
2. **Vendoring**: keep the `lib/js/vendor/harfbuzzjs/` pattern. emscripten is NOT installed for
   the agent (`which emcc` empty) → operator provides the `dist/` build of
   `/var/lib/agent/harfbuzzjs` main (or builds in-place there).
3. **ascender/descender**: keep opentype.js semantics (hhea values) — harfbuzz `Font.hExtents()`
   at scale=upem. Only revisit if issues arise.
4. **`widgetBus.harfbuzz` shape**: pass the v1.x module namespace directly, drop the
   `{hbjs, Module}` wrapper (simpler; the raw `Module` was only needed for `_getExtents`, which
   becomes `Font.hExtents()`).
5. **Shim location**: `lib/js/font-info.mjs`, must NOT depend on `lib/js/components`
   (vendor imports are fine). Shared between main and legacy app.

## Current State Analysis

- harfbuzzjs v0.x vendored at `lib/js/vendor/harfbuzzjs/` (`hb.wasm`, `hb.mjs`, `hbjs.mjs`,
  `hbjs.js`, `harfbuzz.mjs` loader, `build.sh` pointing at `graphicore/harfbuzzjs` branch
  `TypeRoof-main`). Loaded via `shell.mjs:48,676-683` into the `harfbuzz` initial dependency,
  exposed as `widgetBus.harfbuzz = {hbjs, Module}` (`shell.mjs:1145`).
- opentype.js (graphicore fork submodule, `lib/js/vendor/opentype.js`) imported only at
  `lib/js/shell.mjs:1` (main) and `lib/js/legacy/videoproof-controller.mjs:3` (legacy).
  Used APIs: `_parse.getTag`, `woffToOTF`, `parse` (all in `parseFont`, `shell.mjs:54-73`;
  legacy: only `parse`, `videoproof-controller.mjs:3862-3887`).
- Downstream reads of the opentype font object (the shim's compatibility surface):
  - names: `getEnglishName(key)`, `names.{unicode,macintosh,windows}[key][lang]`
    (`model/font.mjs:250-257`; legacy `:449-454`)
  - fvar axes: `tables.fvar.axes` → `{tag, name.en, minValue, maxValue, defaultValue}`
    (`model/font.mjs:7-23`; `dev-layouts/videoproof-array.mjs:681`; legacy `:196-209,:5192`)
  - fvar instances: `tables.fvar.instances` → `{name: {en,...}, coordinates: {tag: value}}`
    (`model/font.mjs:380-396`; legacy `:533-543`)
  - GSUB/GPOS: `tables.{gsub,gpos}.{scripts,features}`, `defaultLangSys`, `langSysRecords`,
    `featureIndexes`, `feature.uiName`/`featUiLabelName` (`model/font.mjs:44-117`; legacy
    `:3238-3290`)
  - cmap: `tables.cmap.glyphIndexMap` (`ui-char-groups.mjs:193` — gids ARE consumed at
    `ui-char-groups.mjs:239-240`; legacy `:856,:870`)
  - metrics: `fontObject.unitsPerEm/ascender/descender` (`line-of-text.mjs:103-105`,
    `videoproof-array.mjs:510`, `type-tools-grid.mjs:1942-1944`,
    `type-spec.typeroof.jsx:283-294,733-741`)

### Key Discoveries

- All three fork deltas are upstream in v1.6.0: stack runtime methods (`em.runtime`),
  `_hb_font_get_glyph_extents`/`_hb_font_get_h_extents` (`harfbuzz.symbols`), and the
  Uint16Array alignment fix (obsolete: `HEAPU16.subarray(ptr/2)`, `src/helpers.ts:110-118`).
  Upstream `config-override.h` (CFF/draw/paint/color/name/metrics/avar2/var-composites) is
  wired into the `Makefile:20`. **No fork branch needs porting.**
- v1.x package: ESM `dist/index.mjs`, WASM init via top-level await (`src/index.ts:16`),
  classes `Blob/Face/Font/Buffer/Feature/Variation`, no `.destroy()` (FinalizationRegistry),
  `Buffer.json()` removed → `getGlyphInfosAndPositions()`
  (`{codepoint, cluster, flags, xAdvance, yAdvance, xOffset, yOffset}`), string features →
  `Feature[]` (`Feature.fromString('+liga')`).
- Build: `make` in harfbuzzjs repo → `dist/{harfbuzz.js,harfbuzz.wasm}` via em++
  (`MODULARIZE+EXPORT_ES6`, wasm located via `import.meta.url` — Vite-compatible), then
  `npx tsdown` → `dist/index.mjs` (`harfbuzz.js` kept external via `deps.neverBundle`).
  Vite `build.target: "esnext"` (vite.config.js:99) → top-level await OK.
- v1.x `Font.hExtents()` → `{ascender, descender, lineGap}` (`src/font.ts:184`) replaces the
  raw-Module `_hb_font_get_h_extents` + `Pointer32StackAlloc`/`Pointer32Malloc` machinery
  (`videoproof-array.mjs:598-630,1177-1212`).
- GSUB/GPOS facade from v1.x: `getTableScriptTags` → per script index `getScriptLanguageTags`
  (explicit languages only) and `getLanguageFeatureTags(table, scriptIndex, 0xFFFF)` for the
  default LangSys (`HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX`); feature indexes = position in
  `getTableFeatureTags(table)` order (matches `hb_ot_layout_feature_get_name_ids` indexing);
  `getFeatureNameIds(table, featureIndex).uiLabelNameId` + `getName(nameId, lang)` replaces
  opentype's `feature.uiName` for ssXX/cvXX (`model/font.mjs:26-42`).
- fvar named instances: NOT bound in v1.x → parse `Face.referenceTable('fvar')`.
- `_hbShapeExample` is debug-only code (`videoproof-array.mjs:917-953`, caller
  `_hbDebugDumpSVG`); `_getCellsWidths` line 1093 passes the font model to `buffer.json()`
  (harmless no-op arg today; drop on rewrite).
- Tests exist via vitest (`npm test`, e.g. `lib/js/metamodel/compare.test.mjs`); wawoff2
  supports node; harfbuzzjs v1.x dist works in node (`examples/harfbuzz.example.node.js`) →
  `font-info.mjs` is unit-testable against `lib/assets/fonts/RobotoFlex[...].woff2`.

## Desired End State

- `lib/js/vendor/harfbuzzjs/` contains upstream v1.x build artifacts (`index.mjs`,
  `index.d.mts`, `harfbuzz.js`, `harfbuzz.wasm`) + updated provenance script; the loader
  re-exports the v1.x namespace.
- `widgetBus.harfbuzz` is the v1.x namespace; all call sites migrated (no `hbjs`, no
  `Module`, no `.destroy()`, no `buffer.json()`).
- `lib/js/font-info.mjs` provides container decompression + an opentype.js-shaped facade
  built purely on harfbuzzjs; `opentype.parse` and `opentype._parse.getTag` are gone from
  both apps; only `woffToOTF` remains imported from the opentype.js fork.
- The STAT-crashing font loads in main and legacy app.
- `npm run typecheck`, `npm run eslint`, `npm test`, `npm run build:app` pass.

### How to verify

- Automated: the four commands above + new `lib/js/font-info.test.mjs`.
- Manual: dev server, load Roboto Flex (URL + file drop) and the previously crashing font;
  check font name/version in the select menu, axis UI (axes + instances), OpenType features
  UI, char groups, type-spec/type-tools-grid rendering, and legacy.html equivalents.

## What We're NOT Doing

- Not replacing `woffToOTF` (kept from the graphicore opentype.js fork).
- Not adding `hb_ot_var_named_instance_*` bindings to harfbuzzjs (unless
  `referenceTable('fvar')` parsing proves non-trivial — see operator decision 1).
- Not changing ascender/descender semantics (stays hhea).
- Not refactoring consumers off the facade object shape (`font.fontObject...` reads stay;
  a future cleanup can migrate them to a cleaner API incrementally).
- Not touching `vendor/fbdemo`, the wawoff2 vendoring, or `docs/` build output.
- Not re-basing any graphicore/harfbuzzjs branch (nothing to port).

## Implementation Approach

Facade-first: `font-info.mjs` builds an opentype.js-shaped object from harfbuzzjs so that
`VideoProofFont` (main + legacy), the UI consumers, and the feature/axis/cmap code keep
working unchanged. This contains the blast radius to: the vendored harfbuzzjs, the harfbuzz
call sites (few), `shell.mjs`/`videoproof-controller.mjs` (parseFont), and one new module.

---

## Phase 1: Vendor harfbuzzjs v1.x and migrate harfbuzz call sites

### Overview

Replace the vendored v0.x artifacts with an upstream v1.x build, rewire the loader and the
`harfbuzz` initial dependency to the module namespace, and migrate all call sites
(factory API → classes, `json()` → accessors, string features → `Feature[]`, raw-Module
extents → `Font.hExtents()`). After this phase the app works exactly as before, still with
opentype.js for metadata.

### Changes Required

#### 1. Build harfbuzzjs (OPERATOR STEP — emscripten required)

**Repo**: `/var/lib/agent/harfbuzzjs` (branch `main`, tracks `origin/main`; verify
`git fetch origin && git status` shows no divergence)

```bash
cd /var/lib/agent/harfbuzzjs && git checkout main && git pull --ff-only origin main
make        # requires em++; produces dist/harfbuzz.{js,wasm} + dist/index.{mjs,d.mts}
```

#### 2. Replace vendored artifacts

**Dir**: `lib/js/vendor/harfbuzzjs/`
**Changes**: delete `hb.mjs`, `hbjs.mjs`, `hbjs.js`, `hb.wasm`; copy in from the harfbuzzjs
build: `dist/index.mjs`, `dist/index.d.mts` (helps `npm run typecheck`), `dist/harfbuzz.js`,
`dist/harfbuzz.wasm`. Keep `.gitignore` (artifacts stay committed, as before).

**File**: `lib/js/vendor/harfbuzzjs/build.sh`
**Changes**: rewrite as provenance/update documentation: clone upstream
`https://github.com/harfbuzz/harfbuzzjs.git` main, `make`, copy the four files listed above.

#### 3. Rewrite the loader

**File**: `lib/js/vendor/harfbuzzjs/harfbuzz.mjs`
**Changes**: v1.x self-initializes at import (top-level await), so the loader becomes a pure
re-export (kept as the single import point, and for Vite to resolve `harfbuzz.wasm` relative
to `harfbuzz.js` via `import.meta.url`):

```js
// harfbuzzjs v1.x: WASM initializes at module load (top-level await).
export * from './index.mjs';
```

#### 4. shell.mjs init: namespace instead of `{hbjs, Module}`

**File**: `lib/js/shell.mjs`
**Changes**:
- `:48` → `import * as harfbuzz from './vendor/harfbuzzjs/harfbuzz.mjs';`
- `:676-683` → replace `getHarfbuzz().then(result => ...)` with a synchronous
  `this.setInitialDependency('harfbuzz', harfbuzz);` (the import already awaited WASM init;
  keep the `harfbuzz` key in the `_externalPromises` list so the resource flow is unchanged).
- `:1145` → `harfbuzz: this.harfbuzz // harfbuzzjs v1.x module namespace`
- `get harfbuzz()` (`:1158-1161`) unchanged.

#### 5. VideoProofFont hbFace cache

**File**: `lib/js/model/font.mjs`
**Changes** (`:399-415`):

```js
get hbFace() {
    if(this._hbCache === null) {
        const blob = new this._widgetBus.harfbuzz.Blob(this.buffer)
          , face = new this._widgetBus.harfbuzz.Face(blob, 0)
          ;
        this._hbCache = {blob, face};
    }
    return this._hbCache.face;
}

destroy() {
    this._document.fonts.delete(this.fontFace);
    // v1.x: no .destroy(), objects are reclaimed via FinalizationRegistry.
    this._hbCache = null;
    // ...existing FIXME comment stays
}
```

#### 6. videoproof-array.mjs

**File**: `lib/js/components/actors/videoproof-array.mjs`
**Changes**:
- Delete `Pointer32Malloc` and `Pointer32StackAlloc` (`:598-630`) — no remaining users.
- `_getExtents` (`:1177-1212`): replace the whole raw-Module block with:

```js
const hbFont = new harfbuzz.Font(hbFace);
hbFont.setVariations(variationsToArray(variations)); // see helper below
const {ascender, descender, lineGap} = hbFont.hExtents(); // scale defaults to upem
result[actorIndex] = {ascender, descender: Math.abs(descender), lineGap, upem: hbFace.upem};
```

  (verify `new Font(face)` default scale == upem; if not, `hbFont.setScale(hbFace.upem, hbFace.upem)` first)
- `_getCellsWidths` (`:1054-1104`): `harfbuzz.createFont/createBuffer/shape` →
  `new harfbuzz.Font(hbFace)` / `new harfbuzz.Buffer()` / `harfbuzz.shape(hbFont, hbBuffer,
  [harfbuzz.Feature.fromString(features)])`; `hbBuffer.json(font)` →
  `hbBuffer.getGlyphInfosAndPositions()`; `_getAdvance` (`:1026-1031`) sums `item.xAdvance`
  instead of `item.ax`; drop all `.destroy()` calls.
- `_hbShapeExample` (`:917-953`, debug-only): same migration (`x.g` → `x.codepoint`;
  `face.getAxisInfos()`, `glyphName`, `glyphToPath` unchanged in v1.x).
- Add a small local helper for the variations object → `Variation[]` conversion:

```js
const toVariations = (harfbuzz, obj) =>
    Object.entries(obj).map(([tag, value]) => new harfbuzz.Variation(tag, value));
```

#### 7. videoproof-contextual

**File**: `lib/js/components/actors/videoproof-contextual/layout.mjs`
**Changes** (`measureWordWidths`, `:43-65`): same migration; `buffer.json(hbFont)` →
`buffer.getGlyphInfosAndPositions()`; `item.ax` → `item.xAdvance`; features param
(default `'+liga'`) → `[harfbuzz.Feature.fromString(features)]`; drop `.destroy()`;
update the `@param {Object} harfbuzz` docstring ("harfbuzz.hbjs object" → "harfbuzzjs v1.x
module namespace"). Accept the full namespace instead of `hbjs` (call-site change below).

**File**: `lib/js/components/actors/videoproof-contextual/index.typeroof.jsx`
**Changes** (`:274`): `this.widgetBus.harfbuzz.hbjs` → `this.widgetBus.harfbuzz`.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck` passes
- [x] `npm run eslint` passes
- [x] `npm test` passes
- [x] `npm run build:app` passes
- [x] `grep -rn "hbjs\|createBlob\|createFace\|createFont\|createBuffer\|\.json(" lib/js --include="*.mjs" --include="*.jsx" | grep -v vendor | grep -v legacy` is empty

#### Manual Verification
- [ ] App loads; default fonts (Roboto Flex URL) install; console shows no harfbuzz errors
- [ ] type-tools-grid layout renders; animation works (exercises `_getExtents`, `_getCellsWidths`)
- [ ] videoproof-contextual layout renders with correct word widths

**Implementation Note**: pause for manual confirmation before Phase 2.

---

## Phase 2: `lib/js/font-info.mjs` — harfbuzzjs-based font metadata, remove `opentype.parse` (main app)

### Overview

New module `lib/js/font-info.mjs` (imports only from `lib/js/vendor/**` and `lib/js/util.mjs`
— never `lib/js/components`) provides (a) container decompression and (b) an
opentype.js-shaped facade over a harfbuzz `Face`. `shell.mjs` switches `parseFont` to it and
drops its opentype.js import. Unit tests against `lib/assets/fonts/RobotoFlex[...].woff2`.

### Changes Required

#### 1. New module `lib/js/font-info.mjs`

**Dependencies**: `import {woffToOTF} from './vendor/opentype.js/dist/opentype.mjs'`,
`import {getDecompressSync} from './vendor/wawoff2/decompress.mjs'`. The harfbuzz namespace
is passed in as a parameter (keeps the module DI-friendly and testable).

**Exports** (sketches):

```js
// Replaces opentype._parse.getTag: 4-byte ASCII signature.
function getSignatureTag(buffer) {
    return new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
}

// woff/woff2 → SFNT. (woffToOTF stays: harfbuzz cannot read woff.)
export async function decompressFontBuffer(fontBuffer) { /* as parseFont today, minus opentype.parse */ }

// nameID map for the keys TypeRoof uses (opentype.js semantics):
const NAME_ID_TO_KEY = {1: 'fontFamily', 2: 'fontSubfamily', 4: 'fullName',
                        5: 'version', 6: 'postScriptName', 16: 'preferredFamily',
                        17: 'preferredSubfamily'};

// Builds the facade from an hb Face + the SFNT buffer.
// Returned object intentionally mimics the opentype.js Font shape
// (only the surface TypeRoof consumes — see research doc §4).
export function createFontObject(hb, sfntBuffer) { /* see below */ }
```

Facade construction (all lazy, cached, from one cached `Face`/`Blob`):

- **names**: from `face.listNames()` build `{[key]: {[language]: value}}` via
  `face.getName(nameId, language)`; expose it as `names.windows` (single bucket is enough —
  all consumers use `?.` chaining across unicode/macintosh/windows) and implement
  `getEnglishName(key)` as "entry `en` (or `en-US`), else first language". Document the
  divergence: platform buckets are not replicated (harfbuzz abstracts platforms away).
- **fvar axes**: `face.getAxisInfos()` → `[{tag, name: {en: face.getName(info.nameId, 'en')},
  minValue: info.minValue, maxValue: info.maxValue, defaultValue: info.defaultValue}]`.
  Only when the font is variable (empty record → `tables.fvar` undefined).
- **fvar instances** via `face.referenceTable('fvar')`:

```js
// NOTE: harfbuzzjs does not (yet) bind hb_ot_var_named_instance_*; if that API
// lands upstream (a binding PR would be welcome), prefer it over this parser.
// fvar layout (OpenType spec): uint16 major, minor, axesArrayOffset, reserved,
// axisCount, axisSize, instanceCount, instanceSize; instance record:
// uint32 subfamilyNameID, uint16 flags, Fixed coordinates[axisCount]
// [, uint32 postScriptNameID if instanceSize == 4 + 4*axisCount + 2 + 4 ... ]
function parseFvarInstances(fvar) { /* DataView reads; Fixed = int32/65536 */ }
```

  → `[{name: {en: resolvedName}, coordinates: {tag: value}}]` matching the opentype.js
  shape consumed at `model/font.mjs:380-396` and legacy `:533-543`.
- **GSUB/GPOS** (feeds `model/font.mjs:_getFontFeaturesInfo` and legacy `OTFeaturesChooser`
  unchanged):

```js
function getLayoutTable(face, tableTag /* 'GSUB'|'GPOS' */) {
    const featureTags = face.getTableFeatureTags(tableTag) // order == featureIndex
      , features = featureTags.map(tag => ({tag, feature: {}}))
      , scripts = []
      ;
    const DEFAULT_LANGSYS_INDEX = 0xFFFF; // HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX
    face.getTableScriptTags(tableTag).forEach((scriptTag, scriptIndex) => {
        const script = {defaultLangSys: null, langSysRecords: []}
          , toIndexes = tags => tags.map(t => featureTags.indexOf(t));
        // ssXX/cvXX UI names (opentype feature.uiName equivalent):
        // face.getFeatureNameIds(tableTag, idx)?.uiLabelNameId → face.getName(nameId, 'en')
        const defaultTags = face.getLanguageFeatureTags(tableTag, scriptIndex, DEFAULT_LANGSYS_INDEX);
        if(defaultTags.length)
            script.defaultLangSys = {featureIndexes: toIndexes(defaultTags)};
        face.getScriptLanguageTags(tableTag, scriptIndex).forEach((langTag, langIndex) => {
            script.langSysRecords.push({tag: langTag, langSys: {
                featureIndexes: toIndexes(face.getLanguageFeatureTags(tableTag, scriptIndex, langIndex))}});
        });
        scripts.push({tag: scriptTag, script});
    });
    return {scripts, features};
}
```

  Exposed as `tables.gsub`/`tables.gpos` (lowercase keys, as opentype.js). Populate
  `feature.uiName`/`featUiLabelName` only for `ss**`/`cv**` tags (that is the only consumer
  path, `model/font.mjs:26-42`).
- **cmap**: `tables.cmap.glyphIndexMap` =

```js
const map = {};
for(const cp of face.collectUnicodes())
    map[cp] = font.nominalGlyph(cp) ?? 0;
```

- **metrics**: `unitsPerEm = face.upem`; `ascender`/`descender` from
  `new hb.Font(face)` → `hExtents()` (hhea — identical semantics to opentype.js).

#### 2. shell.mjs `parseFont`

**File**: `lib/js/shell.mjs`
**Changes**: `parseFont` (`:54-73`) becomes `decompressFontBuffer` from font-info.mjs +
`createFontObject(this-or-static-harfbuzz, fontBuffer_)`; remove the module-level
`import * as opentype` (`:1`) and the module-level `woff2decompress` await (moves into
font-info.mjs). The `[fontObject, fontBuffer_]` return contract stays.

#### 3. Unit tests

**File**: `lib/js/font-info.test.mjs` (vitest, node env)
**Changes**: load `lib/assets/fonts/RobotoFlex[...].woff2` via `decompressFontBuffer`
(wawoff2 works in node), build the facade, assert:
- name/version/fullName resolution
- 13 axes incl. `wght`/`wdth`/`opsz` with min<default<max
- at least one named instance with valid coordinates keyed by axis tag
- `glyphIndexMap` non-empty, maps known codepoint (e.g. 65 'A') to a gid > 0
- GSUB scripts/features contain `liga`; langSys enumeration covers default LangSys
- `unitsPerEm` 1000, `ascender` > 0, `descender` < 0

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`, `npm run eslint`, `npm test`, `npm run build:app` pass
- [x] `grep -n "opentype" lib/js/shell.mjs` → no matches (only comments + woffToOTF mention)
- [x] `grep -rn "opentype.parse\|_parse.getTag" lib/js --include="*.mjs" | grep -v vendor | grep -v legacy` → empty
- [x] `lib/js/font-info.mjs` has no imports from `lib/js/components`

Phase 2 implementation notes (deviations from plan, all verified by tests):
- harfbuzzjs `AxisInfo` fields are `min`/`default`/`max` (not `minValue`...).
- Default-LangSys sentinel is `0xFFFF` (uint16), not `0xFFFFFFFF`.
- fvar instances: offset = `axesArrayOffset + axisCount*axisSize` (the spec's
  countSizePairs/"reserved" field is unreliable in real fonts — RobotoFlex has 2);
  subfamilyNameID parsed as uint16 like opentype.js/fontTools do.
- MaterialSymbolsOutlinedSubset is variable (fvar+gvar) — static fixture is
  LiberationMono-Regular.ttf from the system instead.

#### Manual Verification
- [ ] The previously STAT-crashing font loads via file drop (the original bug report)
- [ ] Font name/version in select menus; axis UI + manual axis locations (instances);
      OpenType features UI populated; char groups work; type-spec layout renders with
      correct `--units-per-em/--ascender/--descender`
- [ ] local font storage round-trip (reload → fonts restore)

**Implementation Note**: pause for manual confirmation before Phase 3.

---

## Phase 3: Legacy app migration

### Overview

Swap the legacy app's `opentype.parse` for the same `font-info.mjs` facade. The legacy
`VideoProofFont` wrapper and `OTFeaturesChooser` keep working unchanged thanks to the
facade. Rendering is browser `FontFace`/CSS — no harfbuzz init is needed in legacy beyond
what the facade uses (the facade needs the v1.x namespace; import the vendor loader directly).

### Changes Required

#### 1. videoproof-controller.mjs

**File**: `lib/js/legacy/videoproof-controller.mjs`
**Changes**:
- `:3` remove `import * as opentype ...`; add
  `import * as harfbuzz from '../vendor/harfbuzzjs/harfbuzz.mjs';` and
  `import {decompressFontBuffer, createFontObject} from '../font-info.mjs';`
  (top-level await in the loader is fine — `main.mjs` is `type="module"` and Vite targets
  esnext).
- `_parseFont` (`:3862-3887`): body becomes
  `const fontBuffer_ = await decompressFontBuffer(fontBuffer);` +
  `return [createFontObject(harfbuzz, fontBuffer_), fontBuffer_];`
  Keep the existing wOF2 error-message behavior where applicable.
- Nothing else: names (`:449-454`), fvar (`:197,:533,:5192`), cmap (`:856,:870`),
  GSUB/GPOS chooser (`:3238-3290`) all consume the facade-compatible shape.

### Success Criteria

#### Automated Verification
- [x] `npm run typecheck`, `npm run eslint`, `npm test`, `npm run build:app` pass
- [x] `grep -rn "opentype" lib/js/legacy` → no matches (only docs/MIME-map strings)

#### Manual Verification
- [ ] legacy.html: load the STAT-crashing font; axis/animation UI works; feature chooser
      populated and applies via CSS; char selection (cmap) works

**Implementation Note**: pause for manual confirmation before Phase 4.

---

## Phase 4: Cleanup

### Overview

Remove dead code and finalize vendoring hygiene.

### Changes Required

- `lib/js/vendor/opentype.js`: submodule stays (still provides `woffToOTF`); add a note in
  `font-info.mjs` (or a vendor README) that this is the only remaining use.
- `lib/js/vendor/harfbuzzjs/`: confirm no stale v0.x files; `build.sh` reflects the new
  upstream-main build.
- Remove any now-dead helpers (`Pointer32*` if not deleted in Phase 1, commented-out
  `Module` usages).
- Optional (only if trivial): drop `hbjs.js` AMD remnant references from any html/docs.

### Success Criteria

#### Automated Verification
- [x] `npm run lint` (full: eslint + prettier + stylelint), `npm run typecheck`, `npm test`,
      `npm run build:app` all pass

#### Manual Verification
- [ ] Full smoke: shell + player + legacy entry points load and render

---

## Testing Strategy

### Unit Tests
- `lib/js/font-info.test.mjs` (Phase 2.3): facade correctness against RobotoFlex fixture.
- Edge cases to cover: non-variable font (no `tables.fvar`), font without GPOS
  (MaterialSymbols subset), font without named instances.

### Integration Tests
- Manual per-phase checklists above (font loading is I/O- and DOM-heavy; full automation is
  out of scope).

## Risks

- **wawoff2 in vitest/node**: if `getDecompressSync` fails under node, fall back to a
  `.ttf`/decompressed fixture committed for tests, or decompress once at test setup via the
  node entry (`vendor/wawoff2/index.js`).
- **`new Font(face)` default scale**: verify scale defaults to upem before relying on
  `hExtents()` returning font units; otherwise call `setScale(upem, upem)` explicitly.
- **cmap build cost**: one `nominalGlyph` wasm call per collected unicode (~30k for CJK) —
  expected fine (ms range); measure with a large font if a user ever loads one.
- **Name-table divergence**: harfbuzz abstracts platform/encoding; the facade exposes a
  single bucket. All current consumers use `?.` fallback chains, so this is safe, but new
  consumers must read the facade docs.
