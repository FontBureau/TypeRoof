// Behavior tests for the justification potentials module (milestone
// 4, phase 1): multilinear interpolation over the declared
// dimension order, exact hits, edge clamping, early bottom-out,
// structural validation (monotonic entries, uniform treatments),
// the step-0-identity invariant, and best-fit discovery.
import { describe, it, expect } from "vitest";

import {
    JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
    JUSTIFICATION_POTENTIALS_AMSTELVAR,
    JUSTIFICATION_POTENTIALS_ROBOTO_FLEX_HEADLINE,
    JUSTIFICATION_POTENTIALS_AMSTELVAR_HEADLINE,
    calculatePotentials,
    validatePotentialsTable,
    discoverPotentials,
    anchorPotentialsToLocation,
    resolvePotentialsSelection,
    fontDefaultLocation,
    potentialsSelectionString,
} from "./justification-potentials.ts";

const location = (entries) => new Map(Object.entries(entries)),
    // Roboto Flex default reading text location
    FLEX_400_100_14 = location({
        wght: 400,
        wdth: 100,
        opsz: 14,
        XTRA: 468,
    });

describe("calculatePotentials", () => {
    it("resolves an exact hit (the Roboto Flex reading-text leaf)", () => {
        const leaf = calculatePotentials(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
            FLEX_400_100_14,
        );
        expect(leaf.XTRA).toEqual([460, 468, 471]);
        expect(leaf.tracking).toEqual([-0.1, 0, 0.13]);
        expect(leaf.wordspace[0]).toBeCloseTo(12 / 14 - 1);
        expect(leaf.wordspace[1]).toBe(0);
        expect(leaf.wordspace[2]).toBeCloseTo(19 / 14 - 1);
    });

    it("interpolates between opsz stops", () => {
        // opsz 79 is halfway between 14 and 144
        const leaf = calculatePotentials(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
            location({ wght: 400, wdth: 100, opsz: 79, XTRA: 468 }),
        );
        // XTRA: [460,468,471] at 14, [460,468,471] at 144 -> constant
        expect(leaf.XTRA).toEqual([460, 468, 471]);
        // tracking min: -0.1 at 14, -0.5 at 144 -> -0.3 halfway
        expect(leaf.tracking[0]).toBeCloseTo(-0.3);
        expect(leaf.tracking[2]).toBeCloseTo((0.13 + 0.5) / 2);
    });

    it("interpolates across the wght level (different sub-grids)", () => {
        // wght 700 is halfway between 400 and 1000; both branches
        // have wdth 100
        const leaf = calculatePotentials(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
            location({ wght: 700, wdth: 100, opsz: 14, XTRA: 468 }),
        );
        // XTRA min: 460 (wght 400) vs 458 (wght 1000) -> 459
        expect(leaf.XTRA[0]).toBeCloseTo(459);
        expect(leaf.XTRA[1]).toBeCloseTo(468);
    });

    it("clamps out-of-range values to the edge stop (no extrapolation)", () => {
        const clampedHigh = calculatePotentials(
                JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
                location({ wght: 400, wdth: 100, opsz: 200, XTRA: 468 }),
            ),
            at144 = calculatePotentials(
                JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
                location({ wght: 400, wdth: 100, opsz: 144, XTRA: 468 }),
            ),
            clampedLow = calculatePotentials(
                JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
                location({ wght: 400, wdth: 100, opsz: 5, XTRA: 468 }),
            ),
            at8 = calculatePotentials(
                JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
                location({ wght: 400, wdth: 100, opsz: 8, XTRA: 468 }),
            );
        expect(clampedHigh).toEqual(at144);
        expect(clampedLow).toEqual(at8);
    });

    it("bottoms out early (a leaf above full depth)", () => {
        const table = {
                dimensions: ["wght", "wdth"],
                defaultLocations: [400, 100],
                tree: {
                    400: {
                        XTRA: [460, 468, 471],
                        tracking: [-0.1, 0, 0.13],
                        wordspace: [-0.2, 0, 0.3],
                    },
                    900: {
                        100: {
                            XTRA: [450, 460, 470],
                            tracking: [-0.2, 0, 0.2],
                            wordspace: [-0.3, 0, 0.4],
                        },
                    },
                },
            },
            leaf = calculatePotentials(
                table,
                location({ wght: 400, wdth: 75, XTRA: 468 }),
            );
        // the wght-400 leaf ignores the remaining dimension
        expect(leaf.XTRA).toEqual([460, 468, 471]);
        // interpolation between a shallow and a deep branch
        const mid = calculatePotentials(
            table,
            location({ wght: 650, wdth: 100, XTRA: 464 }),
        );
        expect(mid.XTRA[0]).toBeCloseTo(455);
    });
});

describe("validatePotentialsTable", () => {
    const leaf = {
        XTRA: [460, 468, 471],
        tracking: [-0.1, 0, 0.13],
        wordspace: [-0.2, 0, 0.3],
    };
    it("accepts descending entries (the stub data is descending)", () => {
        expect(() =>
            validatePotentialsTable({
                dimensions: ["opsz"],
                defaultLocations: [14],
                tree: { 144: { ...leaf }, 14: { ...leaf }, 8: { ...leaf } },
            }),
        ).not.toThrow();
    });

    it("rejects non-monotonic entries", () => {
        // NOTE: integer-like object keys enumerate ascending by JS
        // semantics regardless of declaration order — a non-
        // monotonic sequence requires decimal (non-integer) keys
        expect(() =>
            validatePotentialsTable({
                dimensions: ["opsz"],
                defaultLocations: [14],
                tree: {
                    20.25: { ...leaf },
                    14.5: { ...leaf },
                    30.5: { ...leaf },
                },
            }),
        ).toThrow(/not monotonic/);
    });

    it("rejects non-uniform treatment sets across leaves", () => {
        const other = { XTRA: [460, 468, 471] };
        expect(() =>
            validatePotentialsTable({
                dimensions: ["opsz"],
                defaultLocations: [14],
                tree: { 14: { ...leaf }, 8: other },
            }),
        ).toThrow(/treatments/);
    });

    it("rejects malformed triples (min > dflt)", () => {
        expect(() =>
            validatePotentialsTable({
                dimensions: ["opsz"],
                defaultLocations: [14],
                tree: {
                    14: {
                        XTRA: [470, 468, 471],
                        tracking: [-0.1, 0, 0.13],
                        wordspace: [-0.2, 0, 0.3],
                    },
                },
            }),
        ).toThrow(/min <= dflt <= max/);
    });
});

describe("discoverPotentials (best-fit, most specific wins)", () => {
    const font = (name, axes) => ({
            name,
            fullName: `from-url ${name} Version_1-000`,
            axisRanges: Object.fromEntries(
                axes.map((tag) => [tag, { min: 0, max: 100, default: 50 }]),
            ),
        }),
        FLEX_AXES = ["wght", "wdth", "opsz", "XTRA"];

    it("matches Roboto Flex to the Flex table", () => {
        expect(discoverPotentials(font("Roboto Flex Regular", FLEX_AXES))).toBe(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
        );
    });

    it("resolves Roboto Delta to the Flex table (sufficiently compatible)", () => {
        expect(discoverPotentials(font("Roboto Delta Roman", FLEX_AXES))).toBe(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
        );
    });

    it("matches Amstelvar flavors to the Amstelvar table", () => {
        expect(discoverPotentials(font("AmstelvarA2 Roman", FLEX_AXES))).toBe(
            JUSTIFICATION_POTENTIALS_AMSTELVAR,
        );
    });

    it("requires the navigation/treatment axes (plain Roboto has no opsz/XTRA)", () => {
        expect(discoverPotentials(font("Roboto", ["wght", "wdth"]))).toBe(null);
    });

    it("yields null for fonts without potentials", () => {
        expect(discoverPotentials(font("Kablammo", ["MORF"]))).toBe(null);
    });
});

describe("defaultLocations (the graceful fill-in)", () => {
    const leaf = {
        XTRA: [460, 468, 471],
        tracking: [-0.1, 0, 0.13],
        wordspace: [-0.2, 0, 0.3],
    };
    it("fills a missing dimension from the table's declared default", () => {
        // a font without an opsz axis navigates at the table's
        // defaultLocation for opsz (14)
        const resolved = calculatePotentials(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
            location({ wght: 400, wdth: 100, XTRA: 468 }),
        );
        // identical to the opsz-14 reading-text leaf
        expect(resolved.XTRA).toEqual([460, 468, 471]);
        expect(resolved.tracking).toEqual([-0.1, 0, 0.13]);
    });

    it("throws when neither the location nor the table provides a dimension", () => {
        const table = {
            dimensions: ["opsz"],
            defaultLocations: [],
            tree: { 14: { ...leaf } },
        };
        expect(() => calculatePotentials(table, location({}))).toThrow(
            /no value for/,
        );
    });

    it("rejects non-parallel defaultLocations", () => {
        expect(() =>
            validatePotentialsTable({
                dimensions: ["opsz"],
                defaultLocations: [14, 100],
                tree: { 14: { ...leaf } },
            }),
        ).toThrow(/parallel/);
    });

    it("rejects non-finite defaultLocations", () => {
        expect(() =>
            validatePotentialsTable({
                dimensions: ["opsz"],
                defaultLocations: [NaN],
                tree: { 14: { ...leaf } },
            }),
        ).toThrow(/finite/);
    });
});

describe("named configurations (selection by key)", () => {
    const fontlessFont = { name: "Whatever Serif", axisRanges: {} },
        flexFont = {
            name: "Roboto Flex Regular",
            axisRanges: Object.fromEntries(
                ["wght", "wdth", "opsz", "XTRA"].map((tag) => [
                    tag,
                    { min: 0, max: 100, default: 50 },
                ]),
            ),
        };

    it("applies a named table regardless of the font (no gates)", () => {
        expect(
            resolvePotentialsSelection("robotoFlexHeadline", fontlessFont),
        ).toBe(JUSTIFICATION_POTENTIALS_ROBOTO_FLEX_HEADLINE);
        expect(
            resolvePotentialsSelection("amstelvarHeadline", fontlessFont),
        ).toBe(JUSTIFICATION_POTENTIALS_AMSTELVAR_HEADLINE);
        expect(resolvePotentialsSelection("amstelvarText", fontlessFont)).toBe(
            JUSTIFICATION_POTENTIALS_AMSTELVAR,
        );
    });

    it("auto = best-fit discovery (the Text pair)", () => {
        expect(resolvePotentialsSelection("auto", flexFont)).toBe(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
        );
        // the headline tables are NOT in the auto pool
        expect(resolvePotentialsSelection("auto", fontlessFont)).toBe(null);
    });

    it("warns and falls back to auto on an unknown key", () => {
        const warnings = [],
            originalWarn = console.warn;
        console.warn = (...args) => warnings.push(args.join(" "));
        try {
            expect(resolvePotentialsSelection("nope", fontlessFont)).toBe(null);
        } finally {
            console.warn = originalWarn;
        }
        expect(warnings.some((msg) => msg.includes("POTENTIALS WARNING"))).toBe(
            true,
        );
    });
});

describe("headline tables (the wdth narrowing stub)", () => {
    it("resolve flat leaves with narrowing-only triples (module-load validated)", () => {
        // a flat table returns its leaf for ANY location (no
        // dimensions to navigate)
        const flex = calculatePotentials(
            JUSTIFICATION_POTENTIALS_ROBOTO_FLEX_HEADLINE,
            location({}),
        );
        expect(flex.wdth).toEqual([35, 151, 151]);
        const amstel = calculatePotentials(
            JUSTIFICATION_POTENTIALS_AMSTELVAR_HEADLINE,
            location({}),
        );
        expect(amstel.wdth).toEqual([50, 125, 125]);
    });

    it("anchors a run at the wide end to identity (the h1 case)", () => {
        const anchored = anchorPotentialsToLocation(
            { wdth: [35, 151, 151] },
            location({ wdth: 151 }),
            { wdth: { min: 25, max: 151 } },
        );
        expect(anchored.wdth).toEqual([35, 151, 151]);
    });

    it("anchors a run away from the wide end (status-quo semantics)", () => {
        // run at wdth 100, Flex wdth range [25,151]: delta -51 ->
        // min clamps to 25, max 100 — narrowing-only, widening
        // exhausted
        const anchored = anchorPotentialsToLocation(
            { wdth: [35, 151, 151] },
            location({ wdth: 100 }),
            { wdth: { min: 25, max: 151 } },
        );
        expect(anchored.wdth).toEqual([25, 100, 100]);
    });

    it("keeps the authored triple when the font lacks the axis", () => {
        const anchored = anchorPotentialsToLocation(
            { wdth: [35, 151, 151] },
            location({ wght: 400 }),
            {},
        );
        expect(anchored.wdth).toEqual([35, 151, 151]);
    });
});

describe("fontDefaultLocation / potentialsSelectionString", () => {
    it("builds the font-default location from axisRanges", () => {
        const fontDefaults = fontDefaultLocation({
            axisRanges: {
                wght: { min: 100, max: 1000, default: 400 },
                wdth: { min: 25, max: 151, default: 100 },
            },
        });
        expect(fontDefaults.get("wght")).toBe(400);
        expect(fontDefaults.get("wdth")).toBe(100);
        expect(fontDefaults.has("opsz")).toBe(false);
    });

    it("documents the effective selection location (dimension order)", () => {
        expect(
            potentialsSelectionString(
                JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
                location({ wght: 400, wdth: 100, opsz: 14 }),
            ),
        ).toBe("the potential is selected by: wght(400), wdth(100), opsz(14)");
        // missing dimensions fall back to the declared defaults
        expect(
            potentialsSelectionString(
                JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
                location({ wght: 400, wdth: 100 }),
            ),
        ).toBe("the potential is selected by: wght(400), wdth(100), opsz(14)");
    });

    it("documents flat tables honestly", () => {
        expect(
            potentialsSelectionString(
                JUSTIFICATION_POTENTIALS_ROBOTO_FLEX_HEADLINE,
                location({}),
            ),
        ).toBe("the potential is selected by: (no dimensions)");
    });
});
