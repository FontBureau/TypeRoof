import { describe, it, expect } from "vitest";

import { Path } from "../../../../metamodel.mjs";
import { getStyleLinkPropertiesId } from "./derivations.mjs";

// Minimal protocol-handler stub: registers everything it's asked about.
function makeWidgetBus(registered = true) {
    return {
        getProtocolHandlerImplementation: () => ({
            hasRegistered: () => registered,
        }),
    };
}

describe("styleLinkProperties@ id construction", () => {
    it("matches the former editor-side construction byte-identically", () => {
        const typeSpecProperties =
                "typeSpecProperties@/activeState/typeSpec/children/paragraphs",
            fieldName = "marks/strong",
            styleLink = "strong",
            // former editor construction (pre-dedup):
            legacyId = `styleLinkProperties@${Path.fromParts(
                typeSpecProperties.slice("typeSpecProperties@".length),
                fieldName,
                styleLink,
            )}`,
            // shared construction via the derivations.mjs function:
            sharedId = getStyleLinkPropertiesId(
                makeWidgetBus(),
                Path.fromString(
                    typeSpecProperties.slice("typeSpecProperties@".length),
                ),
                fieldName,
                styleLink,
            );
        expect(sharedId).toBe(legacyId);
    });

    it("returns null when the id is not registered", () => {
        expect(
            getStyleLinkPropertiesId(
                makeWidgetBus(false),
                Path.fromString("/activeState/typeSpec"),
                "marks/strong",
                "strong",
            ),
        ).toBe(null);
    });
});

// approach (a) phase 6: the containing-spec path helper. A minimal
// nodeSpecToTypeSpec stub — has/get/link mirrors the model access the
// resolver walk itself performs (integration.typeroof.jsx).
import { getResolvablePathOfTypes } from "./derivations.mjs";

const makeNodeSpecToTypeSpec = (entries) => ({
    has: (key) => Object.hasOwn(entries, key),
    get: (key) => ({ get: () => ({ value: entries[key] }) }),
});

describe("getResolvablePathOfTypes (nearest resolvable ancestor)", () => {
    // the en-wikipedia shape: li-inline has an entry, the inline
    // wrappers don't
    const wiki = makeNodeSpecToTypeSpec({
        "li-inline": "/paragraphs/t1",
        "generic-inline": "",
        cite: "",
    });

    it("drops entry-less trailing keys to the nearest resolvable ancestor", () => {
        expect(
            getResolvablePathOfTypes(wiki, [
                "typography",
                "li-inline",
                "generic-inline",
            ]),
        ).toEqual(["typography", "li-inline"]);
    });

    it("repairs nested inline chains (cite inside generic-inline)", () => {
        expect(
            getResolvablePathOfTypes(wiki, [
                "typography",
                "li-inline",
                "generic-inline",
                "cite",
            ]),
        ).toEqual(["typography", "li-inline"]);
    });

    it("keeps a resolvable last key unchanged (direct runs, blocks)", () => {
        expect(
            getResolvablePathOfTypes(wiki, ["typography", "li-inline"]),
        ).toEqual(["typography", "li-inline"]);
    });

    it("returns a single-element path as-is (root fallback stays the walk's business)", () => {
        expect(getResolvablePathOfTypes(wiki, ["generic-inline"])).toEqual([
            "generic-inline",
        ]);
    });

    it("treats an ABSENT entry like an empty link", () => {
        const sparse = makeNodeSpecToTypeSpec({ "li-inline": "/p/t1" });
        expect(
            getResolvablePathOfTypes(sparse, [
                "typography",
                "li-inline",
                "cite",
            ]),
        ).toEqual(["typography", "li-inline"]);
    });

    it("does not mutate the input path", () => {
        const input = ["typography", "li-inline", "generic-inline"];
        getResolvablePathOfTypes(wiki, input);
        expect(input).toEqual(["typography", "li-inline", "generic-inline"]);
    });
});
