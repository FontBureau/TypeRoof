---
title: 'Columns Runion — Analysis & Design Report'
eleventyNavigation:
  parent: Planning
  key: columns-runion-report
  title: 'Columns: Runion Report'
  order: 44
agent-created: true
---

# {{title}}

Status: planning. Code lives in `column-layout.mjs` next to this report, not yet wired into `lib/`.

## 1. Goal

A runion (`runion_01_columns`) consumed via `SyntheticValue` that derives
`{ columns, lineLengthEn, columnGapEn, marginLeftEn, marginRightEn }` from
`availableWidthEn` plus a locale-aware configuration, replacing the legacy
`_runion_01_columns` and overriding the user-settable `generic/columnWidth`
when the algorithm is active.

## 2. Analysis of the legacy version

Strategy: **pass 1** — fewest columns whose natural line length lands in
`(min, max]`; **pass 2** — most columns not below min, line capped at
`maxLineLength`, remainder split into padding 3/5 left, 2/5 right.

Simulated transition map (legacy EN config, widths in EN):

| Width | Result | Notes |
|---|---|---|
| 0–65 | 1 col, fit | |
| 65.5–69 | 1 col capped 65, pad <= 4 | dead zone (2x33 excluded by exclusive min) |
| 69.5–133 | 2 cols, 33.25 to 65 | |
| 133.5–155 | 3 cols, 42.8 to 50 | |
| 155.5–166 | 4 cols, 37.4 to 40 | |
| 166.5+ | 4 cols capped 40 | padding unbounded (234 EN at W=400) |

DE config: dead zone 65.5–87.5 (up to **22 EN** padding while 2x41.5 is
rejected 0.5 under min), plus a 3-col pad zone 155.5–174.5.

Issues found (legacy): throws on width <= 0; exclusive-min knife-edge at
exactly 69 EN; implicit pass-2 invariant; positional return value;
top-level `minLineLength`/`maxLineLength` duplicate the columns array;
hardcoded 3/5-2/5 split; dead zones not detected; dead data (1-col gap);
config param misnamed (`columnConfig` = the columns array).

## 3. Decisions (operator, 2026-07-19)

1. **Inclusive min** (`lineLengthEn >= min`).
2. Dead zones: **fewer columns + padding**; config is followed strictly, no soft-min.
3. Margins unbounded; split ratio **configurable** (default 3/5, 2/5); optional
   `growColumns: N | Infinity` keeps adding columns using the last config entry.
4. Gap = **pluggable algorithm** (`constant`, `linear`, future); `linear` =
   two `(columnWidth, gap)` points + slope + clamp (same math as `runion_01_lineHeight`).
5. Wiring mirrors leading (`createDynamicModel` algorithm choice) and overrides
   user `columnWidth`; `availableWidth` is assumed to be available as a property.
6. Gap points: `a=[33->2]`, `b=[65->3]`, clamp `[2, 3]`.
7. Registry keeps room for other gap algorithms (see 4).

## 4. Config (compact, JSON-serializable)

```js
{ minLineHeight: 1.1, maxLineHeight: 1.3     // for the leading runion
, minLineLength: 33                          // EN, counts >= 2; 1 col always allowed
, columns: [65, 65, 50, 40]                  // maxLineLength per count; length = max
, growColumns: false                         // false | N | Infinity
, columnGap: { algorithm: "linear"
             , a: { columnWidth: 33, gap: 2 }, b: { columnWidth: 65, gap: 3 }
             , min: 2, max: 3 }
, paddingRatio: [3/5, 2/5] }
```

DE shrinks to `{ minLineLength: 42, columns: [65, 65, 50, 45] }` + link to
`Latn-en`. Removed redundancy: top-level min/maxLineLength, repeated per-count
mins, dead 1-col gap entry. JSON-able data addresses the i18n explicit-link
TODO. Registration stays with the existing `addToI18NConfig` plumbing (ported
unchanged); `normalizeColumnConfig` expands + freezes at query time,
`validateColumnConfig` throws early on bad input and **warns about dead zones**
(would have caught the DE 65–87 zone).

## 5. Gap interpolation and the circularity

Gap depends on line length, line length depends on gap. For `linear` an exact
fixed-point solve is used (`n*line + (n-1)*gap(line) = W`, piecewise-linear,
monotone, hence unique solution; clamp fallback provably consistent). Verified
numerically: width identity error <= 5.7e-14 over W in [1,400], n in [1,4].
Algorithms without an exact `solve` get a one-refinement fallback. Effect on
transitions (EN): 1->2 at 68.25 (was 69.5), 2->3 at 133.25, 3->4 at 155.25;
dead zone shrinks to (65, 68].

## 6. Metamodel proposal (configuration)

Mirrors the leading pattern (`AutoLinearLeadingModel` vs gap points,
`createDynamicModel` for algorithm choice):

```js
, ColumnGapPointModel = _AbstractStructModel.createClass(
      "ColumnGapPointModel"
    , ["columnWidth", ColumnWidthModel]
    , ["gap", ColumnWidthModel])              // or a dedicated GapNumberModel
, LinearColumnGapModel = _AbstractStructModel.createClass(
      "LinearColumnGapModel"
    , ["a", ColumnGapPointModel], ["b", ColumnGapPointModel]
    , ["minGap", ColumnWidthOrEmptyModel], ["maxGap", ColumnWidthOrEmptyModel])
, ConstantColumnGapModel = _AbstractStructModel.createClass(
      "ConstantColumnGapModel"
    , ["value", ColumnWidthModel])
, { ColumnGapAlgorithmModel, createColumnGapAlgorithm
  , deserializeColumnGapAlgorithmModel } = createDynamicModel(
      "ColumnGapAlgorithm"
    , [ ["constant", "Constant", ConstantColumnGapModel]
      , ["linear", "Linear", LinearColumnGapModel] ])
```

The typeSpec-level algorithm choice (overrides user `columnWidth` when active):

```js
, Runion01ColumnsModel = _AbstractStructModel.createClass(
      "Runion01ColumnsModel"
      // all OrEmpty: per-instance overrides of the locale config
    , ["minLineLength", ColumnWidthOrEmptyModel]
    , ["columnGap", ColumnGapAlgorithmOrEmptyModel]  // or required w/ default
    , ["paddingRatioStart", PercentNumberOrEmptyModel]
    , ["growColumns", NumberOrEmptyModel])           // Infinity: TBD how
, ManualColumnWidthModel = _AbstractStructModel.createClass(
      "ManualColumnWidthModel"
    , ["columnWidth", ColumnWidthOrEmptyModel])      // current field moves here
, { ColumnsAlgorithmModel, createColumnsAlgorithm
  , deserializeColumnsAlgorithmModel } = createDynamicModel(
      "ColumnsAlgorithm"
    , [ ["ManualColumnWidth", "Manual", ManualColumnWidthModel]
      , ["Runion01Columns", "Runion 01", Runion01ColumnsModel] ])
```

Notes: `columns` (per-count maxes) could be an `_AbstractListModel` of
`ColumnWidthModel` if modeled at all — recommend keeping it in the i18n config
only, not per-typeSpec. `Infinity` has no natural metamodel representation —
options: a boolean `growColumnsUnbounded` or a sentinel; decide when modeling.
Legacy data migration: existing typeSpecs default to `ManualColumnWidth`
(backwards compatible).

## 7. properties-generators.mjs proposal

New `columnsGen`, sibling of `leadingGen`, same shape:

```js
function* columnsGen(outerTypespecnionAPI, hostInstance) {
    // read columnsAlgorithm field; ForeignKey.NULL = inherit (like leadingGen)
    // "ManualColumnWidth": current broom-wagon behavior moves here
    //   (yield generic/columnWidth from the field if set)
    // "Runion01Columns":
    //   - locale from hostInstance languageTag -> getFromI18NConfig(COLUMN_CONFIG_I18N, locale)
    //   - merge per-instance overrides from the model onto the locale config
    //   - yield ["columns/config", normalizeColumnConfig(merged)]   (plain data)
    //   - yield ["columns/setup", new SyntheticValue(runion_01_columns,
    //         [`${GENERIC}availableWidth`, "columns/config"])]
    //   - extractors (SyntheticValue chains are supported, cf. fontSize -> opsz):
    //       ${GENERIC}columnWidth <- setup.lineLengthEn   // AutoLinearLeading keeps working
    //       columns/count, columns/gap, columns/marginLeft, columns/marginRight
}
```

If `columns/setup` resolves to `null` (degenerate width), the extractor chain
is dropped gracefully by the existing resolution rule.

## 8. Drive-by findings (not introduced by this work)

- **Bug in `type-specnion.mjs` `resolveSyntheticProperties`**: the drop-check
  uses `arguments.length !== synthProp.dependencies.length` — `arguments` of the
  static method is always 2, so the check is bogus; and after
  `resultMap.delete(propertyName)` execution continues and `synthProp.call(...args)`
  may re-set a partially resolved property. Should be `args.length !== ...` plus
  `continue`. Recommend a separate fix + test.
- Legacy i18n plumbing (`normalizeLocale`/`validateLocale`/`deepKeys`/
  `getFromI18NConfig`) ports as-is; `localeToLabel`/`localeToValue` docstrings
  are copy-pasted and do not describe their difference.

## 9. Open points

- `availableWidth` property: name/unit (pt vs EN) — assumed provided by the stage.
- `Infinity` modeling for `growColumns` (see section 6).
- Whether per-count gap overrides are ever needed (escape hatch exists in the
  normalized runtime form; not modeled).
- UI for the algorithm choice (analogous to the leading UI) — out of scope here.
