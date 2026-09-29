import { describe, it, expect } from "vitest";
import {
    calculateHorizontalRunion,
    normalizeColumnConfig,
    validateColumnConfig,
    createColumnGap,
} from "./horizontal-layout-runion.mjs";

// All lengths in EN. Helper: normalized config with constant gap by
// default; overrides merge shallowly.
function mkConfig(overrides = {}) {
    return normalizeColumnConfig({
        minLineLength: 10,
        minPadding: 0,
        columns: [],
        growColumns: false,
        columnGap: { algorithm: "constant", value: 0 },
        paddingRatio: [0, 1],
        ...overrides,
    });
}

describe("calculateHorizontalRunion — basic fits", () => {
    it("empty columns + no growth: single full-width column", () => {
        const result = calculateHorizontalRunion(100, mkConfig());
        expect(result.columnCount).toBe(1);
        expect(result.lineLength).toBe(100);
        expect(result.marginStart).toBe(0);
        expect(result.marginEnd).toBe(0);
        expect(result.fullWidth).toBe(100);
    });

    it("per-count maxes: picks the fewest columns with a natural fit (pass 1)", () => {
        const config = mkConfig({ columns: [30, 25] });
        // budget 50: 1 col (50 > 30) rejected, 2 cols fit exactly
        expect(calculateHorizontalRunion(50, config).columnCount).toBe(2);
        // budget 40: 2 cols à 20
        expect(calculateHorizontalRunion(40, config).columnCount).toBe(2);
        // budget 15: 1 col fits
        const result = calculateHorizontalRunion(15, config);
        expect(result.columnCount).toBe(1);
        expect(result.lineLength).toBe(15);
    });

    it("constant gap: budget is divided between columns and gutters", () => {
        // 2 cols, gap 4, budget 48: line = (48 - 4) / 2 = 22
        const result = calculateHorizontalRunion(
            48,
            mkConfig({
                columns: [30, 30],
                columnGap: { algorithm: "constant", value: 4 },
            }),
        );
        expect(result.columnCount).toBe(2);
        expect(result.lineLength).toBe(22);
        expect(result.columnGutter).toBe(4);
        expect(result.fullWidth).toBe(48);
    });

    it("paddingRatio splits the remainder between the margins", () => {
        // 1 col max 30, budget 50, ratio [0.5, 0.5]: pass 2 caps at 30,
        // remainder 20 splits evenly (reserve is 0).
        const result = calculateHorizontalRunion(
            50,
            mkConfig({ columns: [30], paddingRatio: [0.5, 0.5] }),
        );
        expect(result.lineLength).toBe(30);
        expect(result.marginStart).toBe(10);
        expect(result.marginEnd).toBe(10);
    });

    it("minLineLength is waived below a configured max (config is stronger)", () => {
        // min 10, but the 1-col max is 5: budget 8 -> line caps at 5,
        // remainder 3 pads (no reject at the general min).
        const result = calculateHorizontalRunion(8, mkConfig({ columns: [5] }));
        expect(result.columnCount).toBe(1);
        expect(result.lineLength).toBe(5);
        expect(result.marginEnd).toBe(3);
    });
});

describe("calculateHorizontalRunion — growth", () => {
    it("growColumns Infinity + empty columns: pure min-driven growth", () => {
        // budget 100, min 10: 10 columns à 10
        const result = calculateHorizontalRunion(
            100,
            mkConfig({ growColumns: Infinity }),
        );
        expect(result.columnCount).toBe(10);
        expect(result.lineLength).toBe(10);
    });

    it("growColumns as a number caps the count", () => {
        // budget 100, 1-col max 30, gap 0: pass 1 rejects all counts
        // (natural > 30), pass 2 caps at 30 — the count is bounded by
        // growColumns (2) vs. the uncapped maximum (3).
        const capped = calculateHorizontalRunion(
            100,
            mkConfig({ columns: [30], growColumns: 2 }),
        );
        expect(capped.columnCount).toBe(2);
        expect(capped.lineLength).toBe(30);
        const uncapped = calculateHorizontalRunion(
            100,
            mkConfig({ columns: [30], growColumns: 3 }),
        );
        expect(uncapped.columnCount).toBe(3);
        // Smaller than columns.length clamps UP to columns.length
        // (documented semantics: it just means columns.length).
        const clamped = calculateHorizontalRunion(
            100,
            mkConfig({ columns: [30, 25, 20], growColumns: 2 }),
        );
        expect(clamped.columnCount).toBe(3);
    });

    it("MAX_COLUMNS caps degenerate near-zero minLineLength growth", () => {
        // min ~ 0 with Infinity growth would produce ~100k columns
        // without the cap (and effectively hang with EPSILON).
        const result = calculateHorizontalRunion(
            10,
            mkConfig({ minLineLength: 0.0001, growColumns: Infinity }),
        );
        expect(result.columnCount).toBe(1000);
        expect(result.lineLength).toBeCloseTo(0.01, 10);
    });
});

describe("calculateHorizontalRunion — degenerate budgets", () => {
    it("non-positive width renders the minimum as overflow", () => {
        const result = calculateHorizontalRunion(
            0,
            mkConfig({ columns: [30] }),
        );
        expect(result.columnCount).toBe(1);
        // min waived by config max is min(10, 30) = 10
        expect(result.lineLength).toBe(10);
        expect(result.fullWidth).toBe(10);
    });

    it("minPadding reserve eating the width renders overflow with the reserve", () => {
        const result = calculateHorizontalRunion(
            2,
            mkConfig({ columns: [30], minPadding: 6 }),
        );
        expect(result.columnCount).toBe(1);
        expect(result.lineLength).toBe(10);
        expect(result.marginEnd).toBe(6); // ratio [0, 1]
        expect(result.fullWidth).toBe(16);
    });

    it("non-finite budget (Infinity) falls back to overflow instead of hanging", () => {
        const result = calculateHorizontalRunion(
            Infinity,
            mkConfig({ columns: [30], minPadding: 2 }),
        );
        expect(result.columnCount).toBe(1);
        expect(result.lineLength).toBe(10);
        expect(result.fullWidth).toBe(12);
    });

    it("NaN budget falls back to overflow", () => {
        const result = calculateHorizontalRunion(NaN, mkConfig());
        expect(result.columnCount).toBe(1);
        expect(Number.isFinite(result.fullWidth)).toBe(true);
    });
});

describe("calculateHorizontalRunion — gutter algorithms", () => {
    it("linear gutter: exact fixed point", () => {
        // a(10 -> 2), b(20 -> 4): slope 0.2, intercept 0
        // 2 cols, budget 22: line = 22 / 2.2 = 10, gap = 2
        // (1 col is rejected by its max 10, so pass 1 picks 2.)
        const result = calculateHorizontalRunion(
            22,
            mkConfig({
                columns: [10, 30],
                columnGap: {
                    algorithm: "linear",
                    a: { columnWidth: 10, gap: 2 },
                    b: { columnWidth: 20, gap: 4 },
                    min: 0,
                    max: 10,
                },
            }),
        );
        expect(result.columnCount).toBe(2);
        expect(result.lineLength).toBe(10);
        expect(result.columnGutter).toBe(2);
    });

    it("negative-slope gutter: padding is floored at the reserve", () => {
        // a(10 -> 30), b(20 -> 0): slope -3, intercept 60.
        // budget 40 (available 43, reserve 3): pass 1 solve gives
        // line = 60 - 40 = 20 (> max 10) -> rejected; pass 2 caps at
        // 10, the gutter recomputed at the capped line GROWS to 30,
        // the raw remainder 43 - 20 - 30 = -7 would go negative —
        // clamped to the reserve 3 (fullWidth overflows, host scrolls).
        const result = calculateHorizontalRunion(
            43,
            mkConfig({
                minLineLength: 5,
                minPadding: 3,
                columns: [10, 10],
                paddingRatio: [0.5, 0.5],
                columnGap: {
                    algorithm: "linear",
                    a: { columnWidth: 10, gap: 30 },
                    b: { columnWidth: 20, gap: 0 },
                    min: 0,
                    max: 30,
                },
            }),
        );
        expect(result.columnCount).toBe(2);
        expect(result.lineLength).toBe(10);
        expect(result.columnGutter).toBe(30);
        expect(result.marginStart).toBe(1.5);
        expect(result.marginEnd).toBe(1.5);
        expect(result.fullWidth).toBe(53);
    });
});

describe("validateColumnConfig / normalizeColumnConfig", () => {
    it("rejects invalid configs", () => {
        const base = {
            columns: [],
            columnGap: { algorithm: "constant", value: 0 },
        };
        expect(() =>
            validateColumnConfig({ ...base, minLineLength: 0 }),
        ).toThrow("minLineLength");
        expect(() => validateColumnConfig({ ...base, minPadding: -1 })).toThrow(
            "minPadding",
        );
        expect(() => validateColumnConfig({ ...base, columns: "x" })).toThrow(
            "columns must be an array",
        );
        expect(() => validateColumnConfig({ ...base, columns: [0] })).toThrow(
            "columns[0]",
        );
        expect(() =>
            validateColumnConfig({
                ...base,
                columnGap: {
                    algorithm: "linear",
                    a: { columnWidth: 10, gap: 1 },
                    b: { columnWidth: 10, gap: 2 },
                },
            }),
        ).toThrow("NaN slope");
        expect(() =>
            validateColumnConfig({ ...base, growColumns: 1.5 }),
        ).toThrow("growColumns");
        // 0 is meaningless (not false, not growth) — the model's
        // GrowColumnsCountModel enforces min 1, validation matches.
        expect(() => validateColumnConfig({ ...base, growColumns: 0 })).toThrow(
            "growColumns",
        );
    });

    it("warns about dead zones between counts", () => {
        // 1 col maxes at 10 (natural max 10), but 2 cols need at least
        // 2*10 = 20 to enter: the range (10, 20] is a dead zone.
        const warnings = validateColumnConfig({
            minLineLength: 10,
            columns: [10, 30],
            columnGap: { algorithm: "constant", value: 0 },
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("dead zone 1 -> 2 columns");
    });

    it("normalizeColumnConfig applies documented defaults", () => {
        const config = normalizeColumnConfig({
            columns: [],
            columnGap: { algorithm: "constant", value: 0 },
        });
        expect(config.minLineLength).toBe(1);
        expect(config.minPadding).toBe(0);
        expect(config.growColumns).toBe(false);
        expect(Array.from(config.paddingRatio)).toEqual([0, 1]);
    });

    it("createColumnGap rejects unknown algorithms", () => {
        expect(() => createColumnGap({ algorithm: "nope" })).toThrow(
            "unknown columnGap algorithm",
        );
    });
});
