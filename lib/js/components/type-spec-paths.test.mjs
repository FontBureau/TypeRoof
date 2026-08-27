/**
 * Behavior tests for the logical↔storage typeSpec path conversion
 * helper (Step 2 of the shim flags & relative linking implementation):
 * round-trips, ".." level consumption, out-of-bounds ".." reported
 * (never clamped), malformed-shape rejection. Not yet wired into the
 * resolver.
 */
import { describe, it, expect } from "vitest";
import { Path } from "../metamodel.mjs";
import {
    logicalLevelSegmentsToModelTreeSegments,
    modelTreeSegmentsToLogicalLevelSegments,
    resolveLogicalLevels,
    resolveTypeSpecLinkFromAnchor,
} from "./type-spec-paths.mjs";

const origin = Path.fromString("/typeSpec");

describe("logical↔model tree conversion round-trips", () => {
    it("levels convert to model tree segments and back without loss", () => {
        const levels = ["de_DE", "quote", "paragraph"],
            modelTree = logicalLevelSegmentsToModelTreeSegments(levels);
        expect(modelTree).toEqual([
            "children",
            "de_DE",
            "children",
            "quote",
            "children",
            "paragraph",
        ]);
        expect(modelTreeSegmentsToLogicalLevelSegments(modelTree)).toEqual(
            levels,
        );
    });

    it("well-formed model tree converts back to levels and re-expands identically", () => {
        const modelTree = ["children", "german", "children", "h3"],
            levels = modelTreeSegmentsToLogicalLevelSegments(modelTree);
        expect(levels).toEqual(["german", "h3"]);
        expect(logicalLevelSegmentsToModelTreeSegments(levels)).toEqual(
            modelTree,
        );
    });

    it("the origin itself converts to empty levels in both directions", () => {
        expect(logicalLevelSegmentsToModelTreeSegments([])).toEqual([]);
        expect(modelTreeSegmentsToLogicalLevelSegments([])).toEqual([]);
    });

    it("a key literally named 'children' round-trips unharmed", () => {
        const levels = ["children", "h3"];
        expect(
            modelTreeSegmentsToLogicalLevelSegments(
                logicalLevelSegmentsToModelTreeSegments(levels),
            ),
        ).toEqual(levels);
    });

    it("malformed model tree shape is rejected, not partially converted", () => {
        // odd tail
        expect(
            modelTreeSegmentsToLogicalLevelSegments([
                "children",
                "h3",
                "children",
            ]),
        ).toBeNull();
        // no 'children' segment where one is expected
        expect(
            modelTreeSegmentsToLogicalLevelSegments(["quote", "children"]),
        ).toBeNull();
        // dangling 'children' segment without a key
        expect(
            modelTreeSegmentsToLogicalLevelSegments(["children"]),
        ).toBeNull();
    });
});

describe("relative logical link resolution", () => {
    it("'..' consumes one level on the base", () => {
        expect(resolveLogicalLevels(["de_DE", "quote"], ["..", "hr"])).toEqual([
            "de_DE",
            "hr",
        ]);
    });

    it("successive '..' consume their levels one by one", () => {
        expect(
            resolveLogicalLevels(
                ["de_DE", "quote", "paragraph"],
                ["..", "..", "hr"],
            ),
        ).toEqual(["de_DE", "hr"]);
    });

    it("'..' beyond the base root is reported as out of bounds, never clamped", () => {
        expect(
            resolveLogicalLevels(["de_DE", "quote"], ["..", "..", "..", "hr"]),
        ).toBeNull();
        expect(resolveLogicalLevels([], [".."])).toBeNull();
    });

    it("an empty link resolves to the base itself", () => {
        expect(resolveLogicalLevels(["de_DE"], [])).toEqual(["de_DE"]);
    });

    it("descending segments append below the base", () => {
        expect(resolveLogicalLevels(["de_DE"], ["h3"])).toEqual([
            "de_DE",
            "h3",
        ]);
    });
});

describe("anchor-based absolute resolution", () => {
    it("consumes '..' on the anchor's logical levels and yields an absolute candidate", () => {
        const anchor = Path.fromString(
                "/typeSpec/children/de_DE/children/quote",
            ),
            candidate = resolveTypeSpecLinkFromAnchor(origin, anchor, [
                "..",
                "hr",
            ]);
        expect(candidate.toString(Path.ROOT)).toBe(
            "/typeSpec/children/de_DE/children/hr",
        );
    });

    it("an anchor at the origin with a descending link descends below the origin", () => {
        const candidate = resolveTypeSpecLinkFromAnchor(origin, origin, ["h3"]);
        expect(candidate.toString(Path.ROOT)).toBe("/typeSpec/children/h3");
    });

    it("an anchor at the origin with a '..' link is out of bounds", () => {
        expect(
            resolveTypeSpecLinkFromAnchor(origin, origin, [".."]),
        ).toBeNull();
    });

    it("an anchor outside the origin is rejected", () => {
        const alien = Path.fromString("/elsewhere/children/quote");
        expect(resolveTypeSpecLinkFromAnchor(origin, alien, ["h3"])).toBeNull();
    });

    it("an anchor with malformed storage shape is rejected", () => {
        const malformed = Path.fromString("/typeSpec/quote");
        expect(
            resolveTypeSpecLinkFromAnchor(origin, malformed, ["h3"]),
        ).toBeNull();
    });

    it("an empty link resolves to the anchor itself", () => {
        const anchor = Path.fromString("/typeSpec/children/h3"),
            candidate = resolveTypeSpecLinkFromAnchor(origin, anchor, []);
        expect(candidate.equals(anchor)).toBe(true);
    });
});
