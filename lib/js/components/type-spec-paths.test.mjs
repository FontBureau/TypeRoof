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
    logicalLevelsToStorageParts,
    storagePartsToLogicalLevels,
    resolveLogicalLevels,
    resolveTypeSpecLinkFromAnchor,
} from "./type-spec-paths.mjs";

const origin = Path.fromString("/typeSpec");

describe("logical↔storage conversion round-trips", () => {
    it("levels convert to storage segments and back without loss", () => {
        const levels = ["de_DE", "quote", "paragraph"],
            storage = logicalLevelsToStorageParts(levels);
        expect(storage).toEqual([
            "children",
            "de_DE",
            "children",
            "quote",
            "children",
            "paragraph",
        ]);
        expect(storagePartsToLogicalLevels(storage)).toEqual(levels);
    });

    it("well-formed storage converts back to levels and re-expands identically", () => {
        const storage = ["children", "german", "children", "h3"],
            levels = storagePartsToLogicalLevels(storage);
        expect(levels).toEqual(["german", "h3"]);
        expect(logicalLevelsToStorageParts(levels)).toEqual(storage);
    });

    it("the origin itself converts to empty levels in both directions", () => {
        expect(logicalLevelsToStorageParts([])).toEqual([]);
        expect(storagePartsToLogicalLevels([])).toEqual([]);
    });

    it("a key literally named 'children' round-trips unharmed", () => {
        const levels = ["children", "h3"];
        expect(
            storagePartsToLogicalLevels(logicalLevelsToStorageParts(levels)),
        ).toEqual(levels);
    });

    it("malformed storage shape is rejected, not partially converted", () => {
        // odd tail
        expect(
            storagePartsToLogicalLevels(["children", "h3", "children"]),
        ).toBeNull();
        // no 'children' segment where one is expected
        expect(storagePartsToLogicalLevels(["quote", "children"])).toBeNull();
        // dangling 'children' segment without a key
        expect(storagePartsToLogicalLevels(["children"])).toBeNull();
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
