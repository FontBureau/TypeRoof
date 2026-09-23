// Based on  docs/planning/columns/column-layout.mjs and made fit
// Computes { lineLength, columnCount, columnGutter, marginStart, marginEnd, fullWidth }
// (despite of columnCount all properties in EN) from availableWidthEn and
// the configuration made via HorizontalLayoutRunionModel

// ---------------------------------------------------------------------------
// Gap algorithms (registry, extensible: add an entry + optional exact solve)
// ---------------------------------------------------------------------------

// Same math as runion_01_lineHeight — candidate for a shared helper (DRY).
export function linearInterpolationClamp(a, b, x, min, max) {
    const slope = (b.gap - a.gap) / (b.columnWidth - a.columnWidth),
        intercept = a.gap - slope * a.columnWidth;
    return Math.min(max, Math.max(min, slope * x + intercept));
}

// Fallback for algorithms without an exact solve: one refinement pass.
function defaultGapSolve(fn, availableWidthEn, columns) {
    if (columns === 1) return [availableWidthEn, 0];
    const gaps = columns - 1,
        firstLineEn =
            (availableWidthEn - gaps * fn(availableWidthEn / columns)) /
            columns,
        gapEn = fn(firstLineEn);
    return [(availableWidthEn - gaps * gapEn) / columns, gapEn];
}

// Exact fixed-point: n*line + (n-1)*gap(line) = W, gap piecewise-linear+clamped.
// Monotonicity makes the clamp fallback provably consistent (see REPORT.md).
function linearGapSolve({ a, b, min, max }, availableWidthEn, columns) {
    if (columns === 1) return [availableWidthEn, 0];
    const gaps = columns - 1,
        slope = (b.gap - a.gap) / (b.columnWidth - a.columnWidth),
        intercept = a.gap - slope * a.columnWidth;
    let lineLengthEn =
            (availableWidthEn - gaps * intercept) / (columns + gaps * slope),
        gapEn = slope * lineLengthEn + intercept;
    if (gapEn < min) {
        gapEn = min;
        lineLengthEn = (availableWidthEn - gaps * min) / columns;
    } else if (gapEn > max) {
        gapEn = max;
        lineLengthEn = (availableWidthEn - gaps * max) / columns;
    }
    return [lineLengthEn, gapEn];
}

const COLUMN_GAP_ALGORITHMS = {
    constant: {
        fn:
            ({ value }) =>
            () =>
                value,
        solve: ({ value }, availableWidthEn, columns) => [
            (availableWidthEn - (columns - 1) * value) / columns,
            columns > 1 ? value : 0,
        ],
    },
    linear: {
        fn:
            ({ a, b, min, max }) =>
            (columnWidthEn) =>
                linearInterpolationClamp(a, b, columnWidthEn, min, max),
        solve: linearGapSolve,
    },
};

export function createColumnGap(config) {
    const algorithm = COLUMN_GAP_ALGORITHMS[config.algorithm];
    if (!algorithm)
        throw new Error(
            `KEY ERROR unknown columnGap algorithm "${config.algorithm}".`,
        );
    const fn = algorithm.fn(config),
        solve = algorithm.solve
            ? (W, n) => algorithm.solve(config, W, n)
            : (W, n) => defaultGapSolve(fn, W, n);
    return { fn, solve };
}

// ---------------------------------------------------------------------------
// Validate + normalize
// ---------------------------------------------------------------------------

export function validateColumnConfig(raw) {
    const errors = [],
        warnings = [];
    if (!(raw.minLineLength > 0)) errors.push("minLineLength must be > 0.");
    // columns may be EMPTY when growth is actually possible (growColumns
    // is Infinity or a number >= 1): then minLineLength alone drives
    // growth — grown columns cap at minLineLength. An empty list with
    // no growth (false or 0) is a meaningless config.
    const growthPossible =
        raw.growColumns === Infinity ||
        (typeof raw.growColumns === "number" && raw.growColumns >= 1);
    if (!Array.isArray(raw.columns))
        errors.push("columns must be an array of per-count maxLineLength.");
    else if (!raw.columns.length && !growthPossible)
        errors.push(
            "columns must be a non-empty array of per-count maxLineLength" +
                " (it may only be empty when growColumns allows growth).",
        );
    else
        for (const [i, max] of raw.columns.entries())
            if (!(max > 0)) errors.push(`columns[${i}] must be > 0.`);
    if (raw.columnGap?.algorithm === "linear") {
        const { a, b } = raw.columnGap;
        if (a.columnWidth === b.columnWidth)
            errors.push(
                "columnGap: a.columnWidth === b.columnWidth (NaN slope).",
            );
        // Points outside [min, max] are not an error: [min, max] clips
        // the interpolation's OUTPUT (linearInterpolationClamp /
        // linearGapSolve), the slope stays defined by the raw points.
    }
    if (
        raw.growColumns !== undefined &&
        raw.growColumns !== false &&
        raw.growColumns !== Infinity &&
        // Smaller than columns.length is fine: the runtime clamps
        // (Math.max) — it just means columns.length.
        !(Number.isInteger(raw.growColumns) && raw.growColumns >= 0)
    )
        errors.push("growColumns must be false, Infinity, or an integer >= 0.");
    if (errors.length)
        throw new Error(
            `VALUE ERROR columnConfig:\n - ${errors.join("\n - ")}`,
        );
    // Dead-zone warning: natural max width of n columns vs entry width of n+1.
    const gap = createColumnGap(raw.columnGap);
    for (const [i, maxLine] of raw.columns.entries()) {
        const n = i + 1;
        if (n === raw.columns.length) break;
        const maxNaturalEn =
                n * maxLine + (n - 1) * (n > 1 ? gap.fn(maxLine) : 0),
            minEntryEn =
                (n + 1) * raw.minLineLength + n * gap.fn(raw.minLineLength);
        if (minEntryEn > maxNaturalEn)
            warnings.push(
                `dead zone ${n} -> ${n + 1} columns: (${maxNaturalEn.toFixed(1)}, ${minEntryEn.toFixed(1)}] EN`,
            );
    }
    return warnings;
}

export function normalizeColumnConfig(raw) {
    validateColumnConfig(raw);
    return Object.freeze({
        minLineLength: raw.minLineLength,
        columns: Object.freeze(Array.from(raw.columns)),
        growColumns: raw.growColumns ?? false,
        gap: createColumnGap(raw.columnGap),
        paddingRatio: Object.freeze(
            // Used to be  `[3 / 5, 2 / 5]` i.e. 6o/40
            // but for a hard-coded default that is too
            // opinionated. Going with left-aligned is a more reasonable
            // hard coded value.
            Array.from(raw.paddingRatio ?? [0, 1]),
        ),
    });
}

// ---------------------------------------------------------------------------
// The runion
// ---------------------------------------------------------------------------

// Output contract: {lineLength, columnCount, columnGutter, marginStart,
// marginEnd, fullWidth} — all but columnCount in EN, columnCount
// unitless and >= 1.
function compose(columns, lineLengthEn, columnGapEn, paddingEn, [left, right]) {
    const marginStart = paddingEn * left,
        marginEnd = paddingEn * right;
    return {
        lineLength: lineLengthEn,
        columnCount: columns,
        columnGutter: columnGapEn,
        marginStart,
        marginEnd,
        fullWidth:
            columns * lineLengthEn +
            (columns - 1) * columnGapEn +
            marginStart +
            marginEnd,
    };
}

// columnConfig: output of normalizeColumnConfig. Returns null for degenerate
// input (width <= 0) so SyntheticValue resolution drops the property chain
// instead of crashing (legacy version threw).
export function calculateHorizontalRunion(availableWidthEn, columnConfig) {
    if (!(availableWidthEn > 0)) return null;
    const { minLineLength, columns, growColumns, gap, paddingRatio } =
            columnConfig,
        // Semantics: configured per-count maxes are authoritative — an
        // explicit "a column may be 30 wide" overrides the general
        // minimum. minLineLength is the floor for growing into
        // UNCONFIGURED territory (counts without an explicit max),
        // and it bounds growth only as far as the smallest configured
        // max allows: an explicit narrow column legitimately enables
        // more columns than the general minimum would suggest.
        maxColumns =
            growColumns === false
                ? columns.length
                : growColumns === Infinity
                  ? Math.floor(
                        availableWidthEn / Math.min(minLineLength, ...columns),
                    ) + 1 // bounded
                  : Math.max(columns.length, growColumns),
        maxLineLengthFor = (count) =>
            // Empty columns (pure min-driven growth): unbounded max —
            // the column width widens instead of padding the remainder.
            columns.length
                ? columns[Math.min(count, columns.length) - 1]
                : Infinity,
        minLineLengthFor = (count) =>
            // A single column may use the whole budget. Otherwise min
            // applies only up to what the config allows: an explicit
            // (or grown, via the last entry) max below minLineLength
            // waives the minimum — the config is stronger.
            count === 1 ? 0 : Math.min(minLineLength, maxLineLengthFor(count));
    // Pass 1: fewest columns with a natural fit (min inclusive).
    // Skipped for pure min-driven growth (empty columns): with an
    // unbounded max "fewest fitting" would degenerate to one column.
    if (columns.length)
        for (let count = 1; count <= maxColumns; count++) {
            const [lineLengthEn, gapEn] = gap.solve(availableWidthEn, count);
            if (
                lineLengthEn >= minLineLengthFor(count) &&
                lineLengthEn <= maxLineLengthFor(count)
            )
                return compose(count, lineLengthEn, gapEn, 0, paddingRatio);
        }
    // Pass 2: most columns not below min, capped at max (or natural,
    // with the unbounded max of the empty-columns mode — the width
    // widens, the remainder distributes over the columns instead of
    // padding).
    for (let count = maxColumns; count >= 1; count--) {
        const [naturalLineEn] = gap.solve(availableWidthEn, count);
        if (naturalLineEn <= minLineLengthFor(count)) continue;
        const lineLengthEn = Math.min(naturalLineEn, maxLineLengthFor(count)),
            gapEn = count > 1 ? gap.fn(lineLengthEn) : 0,
            paddingEn =
                availableWidthEn - count * lineLengthEn - (count - 1) * gapEn;
        return compose(count, lineLengthEn, gapEn, paddingEn, paddingRatio);
    }
    return null; // unreachable with a valid config (1-col min = 0)
}
