// column-layout.mjs — PLANNING STAGE, not wired into lib/ yet.
// Lives in docs/planning/columns/ alongside REPORT.md until approved.
//
// Computes { columns, lineLengthEn, columnGapEn, marginLeftEn, marginRightEn }
// from availableWidthEn + a compact, JSON-serializable, locale-aware config.
// Successor of the legacy _runion_01_columns (see REPORT.md for the analysis).

// ---------------------------------------------------------------------------
// Gap algorithms (registry, extensible: add an entry + optional exact solve)
// ---------------------------------------------------------------------------

// Same math as runion_01_lineHeight — candidate for a shared helper (DRY).
export function linearInterpolationClamp(a, b, x, min, max) {
    const slope = (b.gap - a.gap) / (b.columnWidth - a.columnWidth)
      , intercept = a.gap - slope * a.columnWidth;
    return Math.min(max, Math.max(min, slope * x + intercept));
}

// Fallback for algorithms without an exact solve: one refinement pass.
function defaultGapSolve(fn, availableWidthEn, columns) {
    if (columns === 1) return [availableWidthEn, 0];
    const gaps = columns - 1
      , firstLineEn = (availableWidthEn - gaps * fn(availableWidthEn / columns)) / columns
      , gapEn = fn(firstLineEn);
    return [(availableWidthEn - gaps * gapEn) / columns, gapEn];
}

// Exact fixed-point: n*line + (n-1)*gap(line) = W, gap piecewise-linear+clamped.
// Monotonicity makes the clamp fallback provably consistent (see REPORT.md).
function linearGapSolve({ a, b, min, max }, availableWidthEn, columns) {
    if (columns === 1) return [availableWidthEn, 0];
    const gaps = columns - 1
      , slope = (b.gap - a.gap) / (b.columnWidth - a.columnWidth)
      , intercept = a.gap - slope * a.columnWidth;
    let lineLengthEn = (availableWidthEn - gaps * intercept) / (columns + gaps * slope)
      , gapEn = slope * lineLengthEn + intercept;
    if (gapEn < min) { gapEn = min; lineLengthEn = (availableWidthEn - gaps * min) / columns; }
    else if (gapEn > max) { gapEn = max; lineLengthEn = (availableWidthEn - gaps * max) / columns; }
    return [lineLengthEn, gapEn];
}

const COLUMN_GAP_ALGORITHMS = {
    constant: {
        fn: ({ value }) => (() => value)
      , solve: ({ value }, availableWidthEn, columns) => [
            (availableWidthEn - (columns - 1) * value) / columns
          , columns > 1 ? value : 0
        ]
    }
  , linear: {
        fn: ({ a, b, min, max }) =>
            (columnWidthEn) => linearInterpolationClamp(a, b, columnWidthEn, min, max)
      , solve: linearGapSolve
    }
};

export function createColumnGap(config) {
    const algorithm = COLUMN_GAP_ALGORITHMS[config.algorithm];
    if (!algorithm)
        throw new Error(`KEY ERROR unknown columnGap algorithm "${config.algorithm}".`);
    const fn = algorithm.fn(config)
      , solve = algorithm.solve
            ? (W, n) => algorithm.solve(config, W, n)
            : (W, n) => defaultGapSolve(fn, W, n);
    return { fn, solve };
}

// ---------------------------------------------------------------------------
// Validate + normalize
// ---------------------------------------------------------------------------

export function validateColumnConfig(raw) {
    const errors = [], warnings = [];
    if (!(raw.minLineLength > 0)) errors.push('minLineLength must be > 0.');
    if (!Array.isArray(raw.columns) || !raw.columns.length)
        errors.push('columns must be a non-empty array of per-count maxLineLength.');
    else
        for (const [i, max] of raw.columns.entries())
            if (!(max > 0)) errors.push(`columns[${i}] must be > 0.`);
    if (raw.columnGap?.algorithm === 'linear') {
        const { a, b, min, max } = raw.columnGap;
        if (a.columnWidth === b.columnWidth)
            errors.push('columnGap: a.columnWidth === b.columnWidth (NaN slope).');
        for (const p of [a, b])
            if (p.gap < min || p.gap > max)
                errors.push('columnGap: point outside [min, max].');
    }
    if (raw.growColumns !== undefined && raw.growColumns !== false
            && raw.growColumns !== Infinity
            && !(Number.isInteger(raw.growColumns) && raw.growColumns >= raw.columns.length))
        errors.push('growColumns must be false, Infinity, or an integer >= columns.length.');
    if (errors.length)
        throw new Error(`VALUE ERROR columnConfig:\n - ${errors.join('\n - ')}`);
    // Dead-zone warning: natural max width of n columns vs entry width of n+1.
    const gap = createColumnGap(raw.columnGap);
    for (const [i, maxLine] of raw.columns.entries()) {
        const n = i + 1;
        if (n === raw.columns.length) break;
        const maxNaturalEn = n * maxLine + (n - 1) * (n > 1 ? gap.fn(maxLine) : 0)
          , minEntryEn = (n + 1) * raw.minLineLength + n * gap.fn(raw.minLineLength);
        if (minEntryEn > maxNaturalEn)
            warnings.push(`dead zone ${n} -> ${n + 1} columns: (${maxNaturalEn.toFixed(1)}, ${minEntryEn.toFixed(1)}] EN`);
    }
    return warnings;
}

export function normalizeColumnConfig(raw) {
    validateColumnConfig(raw);
    return Object.freeze({
        minLineLength: raw.minLineLength
      , columns: Object.freeze(Array.from(raw.columns))
      , growColumns: raw.growColumns ?? false
      , gap: createColumnGap(raw.columnGap)
      , paddingRatio: Object.freeze(Array.from(raw.paddingRatio ?? [3 / 5, 2 / 5]))
    });
}

// ---------------------------------------------------------------------------
// The runion
// ---------------------------------------------------------------------------

function compose(columns, lineLengthEn, columnGapEn, paddingEn, [left, right]) {
    return { columns, lineLengthEn, columnGapEn
           , marginLeftEn: paddingEn * left, marginRightEn: paddingEn * right };
}

// columnConfig: output of normalizeColumnConfig. Returns null for degenerate
// input (width <= 0) so SyntheticValue resolution drops the property chain
// instead of crashing (legacy version threw).
export function runion_01_columns(columnConfig, availableWidthEn) {
    if (!(availableWidthEn > 0)) return null;
    const { minLineLength, columns, growColumns, gap, paddingRatio } = columnConfig
      , maxColumns = growColumns === false
            ? columns.length
            : growColumns === Infinity
                ? Math.floor(availableWidthEn / minLineLength) + 1 // bounded
                : Math.max(columns.length, growColumns)
      , maxLineLengthFor = (count) => columns[Math.min(count, columns.length) - 1]
      , minLineLengthFor = (count) => count === 1 ? 0 : minLineLength;
    // Pass 1: fewest columns with a natural fit (min inclusive).
    for (let count = 1; count <= maxColumns; count++) {
        const [lineLengthEn, gapEn] = gap.solve(availableWidthEn, count);
        if (lineLengthEn >= minLineLengthFor(count) && lineLengthEn <= maxLineLengthFor(count))
            return compose(count, lineLengthEn, gapEn, 0, paddingRatio);
    }
    // Pass 2: most columns not below min, capped at max, rest to margins.
    for (let count = maxColumns; count >= 1; count--) {
        const [naturalLineEn] = gap.solve(availableWidthEn, count);
        if (naturalLineEn <= minLineLengthFor(count)) continue;
        const lineLengthEn = maxLineLengthFor(count)
          , gapEn = count > 1 ? gap.fn(lineLengthEn) : 0
          , paddingEn = availableWidthEn - count * lineLengthEn - (count - 1) * gapEn;
        return compose(count, lineLengthEn, gapEn, paddingEn, paddingRatio);
    }
    return null; // unreachable with a valid config (1-col min = 0)
}

// ---------------------------------------------------------------------------
// Configuration data (compact form). Registration into COLUMN_CONFIG_I18N
// happens via the existing addToI18NConfig plumbing (ported unchanged);
// 'Latn-de' links to 'Latn-en' for everything it doesn't override.
// ---------------------------------------------------------------------------

export const COLUMN_CONFIG_EN = Object.freeze({
    minLineHeight: 1.1
  , maxLineHeight: 1.3
  , minLineLength: 33        // EN, counts >= 2; 1 column always allowed
  , columns: Object.freeze([65, 65, 50, 40]) // maxLineLength per count
  , growColumns: false
  , columnGap: Object.freeze({
        algorithm: 'linear'
      , a: Object.freeze({ columnWidth: 33, gap: 2 })
      , b: Object.freeze({ columnWidth: 65, gap: 3 })
      , min: 2, max: 3
    })
  , paddingRatio: Object.freeze([3 / 5, 2 / 5])
});

export const COLUMN_CONFIG_DE = Object.freeze({
    ...COLUMN_CONFIG_EN
  , minLineLength: 42
  , columns: Object.freeze([65, 65, 50, 45])
});
