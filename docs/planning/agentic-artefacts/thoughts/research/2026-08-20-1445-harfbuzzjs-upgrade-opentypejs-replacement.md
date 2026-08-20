---
date: 2026-08-20T14:48:53+02:00
git_commit: c2ad58a2a97502e24c1ff82110ad489d699fe9ae
branch: fix/modern-font-parsing
repository: TypeRoof
topic: "Upgrade harfbuzzjs to upstream v1.x and replace opentype.js with harfbuzzjs"
tags: [research, codebase, harfbuzzjs, opentypejs, fonts, refactoring]
status: complete
---

# Research: harfbuzzjs v1.x upgrade + opentype.js replacement

## Research Question

opentype.js throws `STAT axis count must be greater than or equal to fvar axis count` on a new (valid) font.
opentype.js upstream is in a bad maintenance state, so: (1) update vendored harfbuzzjs to track upstream
`harfbuzz/harfbuzzjs` main (v1.x, new API), porting TypeRoof usage; (2) replace most of opentype.js with
harfbuzzjs, keeping only the custom `opentype.woffToOTF` from the graphicore fork; (3) size the same
replacement for the legacy app. harfbuzzjs checkout (upstream main + graphicore remotes): `/var/lib/agent/harfbuzzjs`.

## Summary

- **The old harfbuzzjs fork is fully absorbed upstream.** All three deltas of `graphicore/TypeRoof-main`
  (vs base 0.4.0) exist in upstream v1.6.0: `stackAlloc/stackSave/stackRestore` runtime methods
  (`em.runtime`), `_hb_font_get_glyph_extents`/`_hb_font_get_h_extents` (`harfbuzz.symbols`), and the
  Uint16Array string-alignment fix (obsolete; new code uses `HEAPU16.subarray(ptr/2)`,
  `src/helpers.ts:110-118`). Upstream main == local main (`cfe067c`, HarfBuzz 14.3.1). No fork branch
  needs porting; a plain vendor update suffices.
- **TypeRoof's harfbuzzjs usage is small and funneled through one loader**
  (`lib/js/vendor/harfbuzzjs/harfbuzz.mjs` → `shell.mjs` initial dependency → `widgetBus.harfbuzz`).
  Migration surface: ~4 files, mostly mechanical factory→class changes. Two non-mechanical spots:
  string feature arguments to `shape()` (now `Feature[]`) and the raw-Module `_hb_font_get_h_extents`
  call in `_getExtents` (now `Font.hExtents()`).
- **opentype.js (main app) has exactly one import site and three API calls** (`shell.mjs:1`, `parseFont`
  at `shell.mjs:54-73`). The STAT crash happens *inside* `opentype.parse`; TypeRoof never reads STAT.
  Downstream consumers read only: name table, fvar axes+instances, GSUB/GPOS script/feature lists,
  cmap `glyphIndexMap`, and unitsPerEm/ascender/descender.
- **harfbuzzjs v1.x covers almost all of that**: `Face.listNames()/getName()`,
  `Face.getAxisInfos()`, full GSUB/GPOS enumeration (`getTableScriptTags`, `getTableFeatureTags`,
  `getScriptLanguageTags`, `getLanguageFeatureTags`, `getFeatureLookups`, `getFeatureNameIds`),
  `Face.collectUnicodes()` + `Font.nominalGlyph()` for cmap, `Face.upem`, `Font.hExtents()/vExtents()`,
  `Font.getMetricPosition()` (ot-metrics), `Font.glyphToPath()/glyphName()`.
  **One gap: fvar named instances are NOT bound in v1.x** (no `hb_ot_var_named_instance_*` in
  `harfbuzz.symbols`/`src/`). Options: parse via `Face.referenceTable('fvar')`, or add the binding upstream.
- **Legacy app replacement is easy-ish**: one file (`lib/js/legacy/videoproof-controller.mjs`), one API
  call (`opentype.parse`, twice), ~6 distinct property-read shapes; rendering is browser `FontFace`/CSS
  (no shaping/outlines in JS). The same font-metadata shim built for the main app serves legacy verbatim.
  Legacy does not even use `woffToOTF`/`_parse.getTag` (only woff2 error sniffing).

## Detailed Findings

### 1. harfbuzzjs: vendored state and loading (TypeRoof)

- Vendored artifacts committed at `lib/js/vendor/harfbuzzjs/`: `hb.wasm` (~319 KB), `hb.mjs`
  (emscripten factory), `hbjs.mjs` (v0.x factory wrapper), `hbjs.js` (AMD, legacy), `harfbuzz.mjs`
  (loader), `build.sh`, `.gitignore` (ignores only `.build`).
- `lib/js/vendor/harfbuzzjs/build.sh:10-14` clones `graphicore/harfbuzzjs` branch `TypeRoof-main`
  (based on `js-callbacks`, for the string-features `shape` variant, upstream PR harfbuzz/harfbuzzjs#97).
  Run manually; no package.json/Makefile automation.
- Loader `lib/js/vendor/harfbuzzjs/harfbuzz.mjs` (17 lines): `hb({locateFile})` then
  `{hbjs: hbjs(Module), Module}`; wasm URL via `new URL('hb.wasm', import.meta.url)` (Vite asset).
  **Natural single migration point** for v1.x top-level-await init.
- Init flow: `lib/js/shell.mjs:48` import → `:676-683` `setInitialDependency('harfbuzz', result)` →
  `:920` `_harfbuzz` → `:1145` `widgetBus.harfbuzz` (`{hbjs, Module}`) → `:1158-1161` getter.
  Passed into FontManager (`:664`) and via `lib/js/components/font-loading.mjs:84-86` into VideoProofFont.

### 2. harfbuzzjs API call sites in TypeRoof (v0.x → v1.x migration checklist)

- `lib/js/model/font.mjs:399-415` — `hbFace` getter: `hbjs.createBlob(this.buffer)`,
  `hbjs.createFace(blob, 0)`; `destroy()` calls `face.destroy(); blob.destroy();`
  (v1.x: `new Blob(buf)`, `new Face(blob, 0)`, drop destroy — FinalizationRegistry).
- `lib/js/components/actors/videoproof-array.mjs`:
  - `917-953` `_hbShapeExample` (debug): createBlob/createFace/createFont/createBuffer,
    `font.setVariations(obj)` (v1.x: `Variation[]`), `font.setScale`, `buffer.addText`,
    `guessSegmentProperties`, `hb.shape(font, buffer, featuresString)` (v1.x: `Feature[]`,
    `Feature.fromString` exists), `buffer.json(font)` (**removed in v1.x** →
    `getGlyphInfosAndPositions()` or `serialize({format: BufferSerializeFormat.JSON})`),
    `font.glyphName/glyphToPath`, 4× `.destroy()`.
  - `1064-1104` `_getCellsWidths`: same shape pipeline; note `:1093` passes the font *model* to
    `buffer.json(font)` (harmless today, revisit on rewrite).
  - `1177-1212` `_getExtents`: raw Module use — `stackSave/stackAlloc/stackRestore`,
    `Module._hb_font_get_h_extents(hbFont.ptr, ptr)` (custom fork export), reads
    ascender/descender/lineGap from `HEAP32`. **v1.x: replace whole block with `hbFont.hExtents()`**
    (`src/font.ts:184`). `Pointer32StackAlloc` (`:620-630`) and unused `Pointer32Malloc` (`:598`)
    become deletable.
- `lib/js/components/actors/videoproof-contextual/layout.mjs:43-65` `measureWordWidths`:
  createFont/setScale/setVariations/createBuffer/addText/guessSegmentProperties/shape/json/destroy.
  Called from `videoproof-contextual/index.typeroof.jsx:274`.
- Not used anywhere: `reference_table`, `shapeWithTrace`, `FontFuncs`, draw/paint callbacks.

### 3. harfbuzzjs v1.x packaging/API (checkout at /var/lib/agent/harfbuzzjs, main == origin/main)

- ESM-only, `dist/index.mjs` + types; WASM init at module load via top-level await
  (`src/index.ts`: `init(await createHarfBuzz())`). `MIGRATING.md` documents v0.x→v1.x.
- Classes: `Blob`, `Face`, `Font`, `Buffer`, `FontFuncs`, `DrawFuncs`, `PaintFuncs`, `Feature`,
  `Variation`; enums `Direction`, `BufferFlag`, `BufferSerializeFormat/Flag`, `GlyphClass`,
  `TracePhase`. No `.destroy()`. `null` → `undefined` throughout.
- `Buffer.json()` removed → `getGlyphInfos()`, `getGlyphPositions()`, `getGlyphInfosAndPositions()`.
- Renames: `reference_table`→`referenceTable`, `x_advance`→`xAdvance`, etc.
- Custom build config now lives upstream: `Makefile:20` `-DHB_CONFIG_OVERRIDE_H="config-override.h"`;
  tracked `config-override.h` enables CFF, draw, paint, color, name, metrics, avar2, cubic-glyf,
  var-composites (all TypeRoof-relevant features on). `em.runtime` includes the stack methods and
  HEAP* views. `harfbuzz.symbols` includes extents + `hb_ot_layout_*` + metrics symbols.
- Build requires emscripten (`em++`) — **not verified installed on this machine; prompt operator**.
- `Face` methods (src/face.ts): `upem`, `referenceTable`, `getAxisInfos()` (Record<tag, AxisInfo>
  incl. `nameId`, min/max/default), `collectUnicodes()`, `getTableScriptTags/FeatureTags`,
  `getScriptLanguageTags`, `getLanguageFeatureTags`, `getFeatureLookups`, `getGlyphClass`,
  `listNames()`/`getName(nameId, language)`, `getFeatureNameIds()`, color APIs.
- `Font` methods (src/font.ts): `setScale`, `setVariations(Variation[])`, `hExtents()`/`vExtents()`
  (`FontExtents` = ascender/descender/lineGap), `glyphExtents()`, `nominalGlyph()`,
  `variationGlyph()`, `glyphName()`, `glyphFromName()`, `glyphToPath()`, `drawGlyph`, `paintGlyph`,
  `getMetricPosition()/getMetricPositionWithFallback()` (hb-ot-metrics).
- **Gap: no fvar named-instance binding** (no `hb_ot_var_named_instance_*` in symbols or src).

### 4. opentype.js usage — main app

- Submodule `lib/js/vendor/opentype.js` → `https://github.com/graphicore/opentype.js.git` branch `main`
  (fork; adds `woffToOTF` at `dist/opentype.mjs:16299,16359`; STAT check that throws at
  `dist/opentype.mjs:8850-8992`, error text `:8871/:8874`). Not an npm dep.
- Sole import: `lib/js/shell.mjs:1`. Sole API call site: `parseFont` (`shell.mjs:54-73`):
  `_parse.getTag` (`:56`, woff/woff2 sniffing), `woffToOTF` (`:61`, because harfbuzz can't read woff),
  `parse` (`:71`). woff2 via `vendor/wawoff2/decompress.mjs`, not opentype.
- Font-object property consumers (replacement shim surface):
  - names: `fontObject.getEnglishName(key)` + `names.unicode/macintosh/windows`
    (`lib/js/model/font.mjs:250,255-257`) → fullName/fontFamily/postScriptName/version.
  - fvar axes: `tables.fvar.axes` with `tag/name.en/minValue/maxValue/defaultValue`
    (`model/font.mjs:9-21`; also `components/dev-layouts/videoproof-array.mjs:681`).
  - fvar instances: `tables.fvar.instances` name/coordinates (`model/font.mjs:382-389`).
  - GSUB/GPOS: `tables.gsub/gpos.scripts/features`, `defaultLangSys`, `langSysRecords`,
    `featureIndexes`, `feature.uiName`/`featUiLabelName` (`model/font.mjs:44-117`, `_getUINameFromFeature`
    `:26-42`).
  - cmap: `tables.cmap.glyphIndexMap` (`components/ui-char-groups.mjs:193`).
  - metrics: `fontObject.unitsPerEm/ascender/descender` → CSS custom properties
    (`actors/line-of-text.mjs:103-105`, `actors/videoproof-array.mjs:510`,
    `layouts/type-tools-grid.mjs:1942-1944`, `prosemirror/type-spec.typeroof.jsx:283-294,733-741`).
  - Never used: charToGlyph, getKerningValue, advanceWidth, getPath/draw, head/hmtx/os2/post tables,
    STAT.
- Pipeline: `parseFont` → `FontManager` (`shell.mjs:~78-600`): `_hydrateFont` (`:147-161` →
  `new VideoProofFont(...)` + `FontFace` + `document.fonts.add`), `_loadFontFromUrl` (`:386-387`,
  parse only when metadata lacks name/version), `_loadFontFromFile` (`:430-446` →
  `VideoProofDeferredFont.fromFontObject` → IndexedDB via `local-font-storage.mjs`),
  `_loadFontFromMessage` (`:468-469`), `_registerFont` → `availableFonts` model
  (`components/main-model.mjs:75`).
- `local-font-storage.mjs`: zero opentype usage (pure IndexedDB).

### 5. opentype.js usage — legacy app

- One file: `lib/js/legacy/videoproof-controller.mjs` (7637 lines). Import `:3` (same vendor file as
  main app). Entry: `legacy.html:20` → `legacy/main.mjs` → VideoproofController; Vite multi-page input
  at `vite.config.js:103`.
- `opentype.parse` only, twice (`:3868,:3881` in `_parseFont :3862-3887`; callers `:3928,:3967,:3977`).
  No `_parse.getTag`, no `woffToOTF` (woff2 sniffing only, `:3870-3873`).
- Property reads: names/getEnglishName (`:449,:454`), fvar axes (`:197,:5192`), fvar instances
  (`:533-543`), cmap glyphIndexMap (`:856,:870`), GSUB/GPOS scripts/features walk (`:3253-3290`,
  feature chooser; applied via CSS `font-feature-settings`).
- Rendering entirely via browser `FontFace` + CSS (`:431-437,:555-557`); no canvas paths, no shaping,
  no outlines, no metrics reads. **No harfbuzzjs in legacy at all.**
- Other legacy modules (layouts/*, text-selection, content-editable, user-guide) touch neither
  opentype nor fontObject.
- **Sizing**: small. A font-metadata shim (names, fvar axes+instances, cmap map, GSUB/GPOS structure)
  shared with the main app covers legacy; the parse swap is identical. Only extra work is keeping the
  legacy `VideoProofFont` wrapper's object shape compatible.

### 6. Mapping opentype.js consumers → harfbuzzjs v1.x

| opentype.js | harfbuzzjs v1.x | Notes |
|---|---|---|
| `parse(buffer)` (full table parse) | `new Face(new Blob(buffer), 0)` | Lazy; no STAT parse → bug gone by construction |
| `getEnglishName` / `names.*` | `Face.listNames()`, `Face.getName(nameId, lang)` | shim needed for platform/encoding precedence |
| `tables.fvar.axes` | `Face.getAxisInfos()` + `getName(axis.nameId)` | direct |
| `tables.fvar.instances` | **not bound** | parse `Face.referenceTable('fvar')` or upstream binding |
| `tables.gsub/gpos` scripts/features | `Face.getTableScriptTags/FeatureTags`, `getScriptLanguageTags`, `getLanguageFeatureTags`, `getFeatureNameIds` | shape differs → shim converts to opentype-like structure |
| `tables.cmap.glyphIndexMap` | `Face.collectUnicodes()` + `Font.nominalGlyph(cp)` | rebuild map; or keep only the unicode set if indexes unused downstream |
| `unitsPerEm` | `Face.upem` | direct |
| `ascender`/`descender` | `Font.hExtents()` (hhea) or `getMetricPosition()` (OS/2 typo metrics) | decide which metric the CSS vars semantically need |
| `woffToOTF` | keep from opentype.js fork (planned) | harfbuzz cannot read woff |

## Code References

- `lib/js/vendor/harfbuzzjs/harfbuzz.mjs` — loader, single migration point
- `lib/js/vendor/harfbuzzjs/build.sh:10-14` — fork provenance
- `lib/js/shell.mjs:1,48,54-73,676-683,1145` — opentype import, harfbuzz init, `parseFont`
- `lib/js/model/font.mjs:7-23,44-117,224-419,399-415` — VideoProofFont, axis/features info, hbFace
- `lib/js/components/actors/videoproof-array.mjs:598-630,917-953,1064-1104,1177-1212` — shaping + raw-Module extents
- `lib/js/components/actors/videoproof-contextual/layout.mjs:43-65` — measureWordWidths
- `lib/js/components/ui-char-groups.mjs:193` — cmap consumer
- `lib/js/legacy/videoproof-controller.mjs:3,196-209,430-557,856-882,3238-3290,3862-3887` — legacy surface
- `/var/lib/agent/harfbuzzjs/MIGRATING.md` — official v0.x→v1.x guide
- `/var/lib/agent/harfbuzzjs/src/{index,face,font,buffer,shape,helpers}.ts`, `Makefile`, `em.runtime`, `harfbuzz.symbols`, `config-override.h`

## Open Questions

1. fvar named instances: hand-parse via `referenceTable('fvar')` vs. adding `hb_ot_var_named_instance_*`
   bindings upstream (harfbuzzjs is active; a PR is plausible)?
2. How to vendor v1.x: copy `dist/index.mjs`+wasm into `lib/js/vendor/harfbuzzjs/` (keep current pattern)
   or npm dependency + Vite bundling? Also: build with emscripten locally or use upstream release artifacts?
   (Is emscripten installed on this machine?)
3. `ascender`/`descender` CSS vars: hhea (`hExtents`) vs OS/2 typo (`getMetricPosition`) semantics —
   which one matches current opentype.js behavior (opentype uses hhea ascender/descender for these properties)?
4. Keep the `{hbjs, Module}` dependency shape on `widgetBus.harfbuzz`, or switch to passing the v1.x module
   namespace directly (breaking change confined to ~4 consumer files)?
5. Should the opentype-like shim (names/fvar/cmap/GSUB-GPOS) live in `lib/js/model/font.mjs`, a new
   `lib/js/font-info.mjs`, or `lib/js/vendor/` so the legacy app can share it without importing app code?
