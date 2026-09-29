// @vitest-environment jsdom
/**
 * Behavior tests for the noStyler provisioning gate (Step 5, PM side):
 * silent nodes render without the styler's inline styles, and
 * destroying the styler removes every inline style/attribute it set
 * (so toggling the flag off/on doesn't leave stale leftovers).
 */
import { describe, it, expect } from "vitest";
import {
    UIDocumentTypeSpecStyler,
    UIDocumentNodeOutfitter,
} from "./type-spec.typeroof.jsx";
import { UIDocumentElement } from "../layouts/type-stage/viewer.typeroof.jsx";
import { Path } from "../../metamodel.mjs";

// The constructor reads the external name of the nodeProperties@
// channel to derive the node's css anchor-name; destroy() removes it
// along with all other inline styles (whole style attribute).
const stubWidgetBus = {
    getExternalName: (name) => `${name}/activeState/document/content/0`,
};

function silentOutfitter(noStyler) {
    const inst = Object.create(UIDocumentNodeOutfitter.prototype);
    inst.getEntry = (name) => {
        if (name === "noStyler") return { value: noStyler };
        throw new Error(`unexpected entry read: ${name}`);
    };
    return inst;
}

describe("noStyler provisioning gate (PM side)", () => {
    it("a resolved spec with noStyler never provisions a styler", () => {
        expect(silentOutfitter(true)._isSilent()).toBe(true);
    });

    it("a spec without noStyler provisions its styler", () => {
        expect(silentOutfitter(false)._isSilent()).toBe(false);
    });

    it("destroy() removes every inline style/attribute the styler set", () => {
        const inner = document.createElement("div"),
            outer = document.createElement("div");
        inner.setAttribute(
            "style",
            "color: red; text-align: center; font-family: x;",
        );
        outer.setAttribute(
            "style",
            "background-color: y; --margin-block-start: 1em; font-size: 12pt;",
        );
        outer.setAttribute("lang", "en");
        // A second, other node's sibling attributes are untouched.
        const styler = new UIDocumentTypeSpecStyler(
            stubWidgetBus,
            inner,
            outer,
        );
        styler.destroy();
        expect(inner.hasAttribute("style")).toBe(false);
        expect(outer.hasAttribute("style")).toBe(false);
        expect(outer.hasAttribute("lang")).toBe(false);
    });

    it("a destroy→create cycle leaves no stale styles", () => {
        const inner = document.createElement("div"),
            outer = document.createElement("div"),
            first = new UIDocumentTypeSpecStyler(stubWidgetBus, inner, outer);
        inner.setAttribute("style", "color: red;");
        outer.setAttribute("lang", "de");
        first.destroy();
        // The second styler must start from a clean element, not
        // leftover inline styles (here: a clean-slate assertion).
        const second = new UIDocumentTypeSpecStyler(
            stubWidgetBus,
            inner,
            outer,
        );
        second.destroy();
        expect(inner.hasAttribute("style")).toBe(false);
        expect(outer.hasAttribute("lang")).toBe(false);
    });
});

/**
 * Viewer side (Step 6): _hasTypeSpecStyling keeps meaning "a spec is
 * resolvable at all" and stays true for silent nodes; the gate is
 * inline in _provisionTypeSpecStyler. destroy() is the same class
 * as the PM side.
 */
function viewerElement(hasTypeSpecStyling, noStyler) {
    const inst = Object.create(UIDocumentElement.prototype),
        typeSpecPath = Path.fromString("/typeSpec/children/quote"),
        // a minimal "no next sibling" parent collection
        parentCollection = {
            indexOfKey: () => 0,
            size: 1,
            get: () => {
                throw new Error("no next sibling");
            },
        };
    inst._hasTypeSpecStyling = hasTypeSpecStyling;
    inst._pathOfTypes = ["doc", "paragraph"];
    inst._widgets = [];
    inst._typeSpecStylerWrapper = null;
    inst.widgetBus = { rootPath: Path.fromString("/document/content/0") };
    inst._getTypeSpecPropertiesId = (_pathOfTypes, asPath = false) =>
        asPath ? typeSpecPath : "typeSpecProperties@/typeSpec/children/quote";
    inst.getEntry = (target) => {
        const key = target instanceof Path ? target.toString() : String(target);
        if (key === typeSpecPath.toString())
            return {
                get: (name) => ({ value: noStyler && name === "noStyler" }),
            };
        if (key === "/document/content") return parentCollection;
        throw new Error(`unexpected entry read: ${key}`);
    };
    // The stub wrapper carries the mappings the relink rebuild-check
    // reads: properties@ matching _getTypeSpecPropertiesId and no
    // nextNodeProperties@ (the stub collection has no next sibling),
    // so a second provisioning call is a no-op.
    inst._createTypeSpecStylerWrapper = () => ({
        dependencyReverseMapping: new Map([
            ["properties@", "typeSpecProperties@/typeSpec/children/quote"],
        ]),
    });
    return inst;
}

describe("noStyler provisioning gate (Viewer side)", () => {
    // New semantics: silent transitions are handled by the STYLER
    // (dormant state in UIDocumentTypeSpecStyler.update), not by
    // provisioning — a styler is provisioned regardless of the flag,
    // and it persists across flips.
    it("a silent node provisions its styler (dormant, initial)", () => {
        const inst = viewerElement(true, true),
            wrapper = inst._provisionTypeSpecStyler();
        expect(wrapper).not.toBe(null);
        expect(inst._typeSpecStylerWrapper).toBe(wrapper);
        expect(inst._widgets).toHaveLength(1);
    });

    it("a styled node provisions its styler", () => {
        const inst = viewerElement(true, false),
            wrapper = inst._provisionTypeSpecStyler();
        expect(wrapper).not.toBe(null);
        expect(inst._typeSpecStylerWrapper).toBe(wrapper);
        expect(inst._widgets).toHaveLength(1);
    });

    it("styled→silent keeps the existing styler (it goes dormant)", () => {
        const inst = viewerElement(true, false);
        // provision styled first
        const wrapper = inst._provisionTypeSpecStyler();
        expect(wrapper).not.toBe(null);
        // flip to silent: provisioning is a no-op, the wrapper
        // persists (dormancy is the styler's own update path)
        inst.getEntry = (target) => {
            const key =
                target instanceof Path ? target.toString() : String(target);
            if (key.endsWith("/quote"))
                return { get: (name) => ({ value: name === "noStyler" }) };
            if (key === "/document/content")
                return {
                    indexOfKey: () => 0,
                    size: 1,
                    get: () => {
                        throw new Error("no next sibling");
                    },
                };
            throw new Error(`unexpected entry read: ${key}`);
        };
        expect(inst._provisionTypeSpecStyler()).toBe(null);
        expect(inst._typeSpecStylerWrapper).toBe(wrapper);
        expect(inst._widgets).toHaveLength(1);
    });
});

describe("noStyler dormant state (UIDocumentTypeSpecStyler.update)", () => {
    const dormantStyler = (noStyler) => {
            const inner = document.createElement("div"),
                outer = document.createElement("div"),
                styler = new UIDocumentTypeSpecStyler(
                    stubWidgetBus,
                    inner,
                    outer,
                );
            styler.widgetBus = {
                ...stubWidgetBus,
                wrapper: {
                    dependencyReverseMapping: new Map([["noStyler", "x"]]),
                },
            };
            styler.getEntry = (name) => {
                if (name === "noStyler") return { value: noStyler };
                throw new Error(`unexpected entry read: ${name}`);
            };
            return [styler, inner, outer];
        },
        styledFragment = (inner, outer) => {
            inner.setAttribute("style", "color: red; text-align: center;");
            outer.setAttribute(
                "style",
                "background-color: y; font-size: 12pt;",
            );
            outer.setAttribute("lang", "en");
        };

    it("a silent update clears the styles and applies nothing", () => {
        const [styler, inner, outer] = dormantStyler(true);
        styledFragment(inner, outer);
        styler.update(new Map());
        expect(inner.hasAttribute("style")).toBe(false);
        expect(outer.hasAttribute("lang")).toBe(false);
        // Dormant cleanup preserves only --node-anchor-name (the
        // node-type label anchor) on the outer element.
        expect(outer.style.length).toBe(1);
        expect(outer.style.getPropertyValue("--node-anchor-name")).not.toBe(
            "",
        );
    });

    it("full destroy() removes the anchor name as well", () => {
        const [styler, , outer] = dormantStyler(true);
        styler.destroy();
        expect(outer.hasAttribute("style")).toBe(false);
    });

    it("without the noStyler mapping the update proceeds normally", () => {
        // No dependencyReverseMapping noStyler entry: the dormant
        // branch must not engage (and must not throw on the guard).
        const inner = document.createElement("div"),
            outer = document.createElement("div"),
            styler = new UIDocumentTypeSpecStyler(stubWidgetBus, inner, outer);
        styler.widgetBus = {
            ...stubWidgetBus,
            wrapper: { dependencyReverseMapping: new Map() },
        };
        styler.getEntry = () => {
            throw new Error("no entries in this stub");
        };
        // Reaches the properties@ read and fails there — proof the
        // dormant branch was skipped.
        expect(() => styler.update(new Map())).toThrow(
            "no entries in this stub",
        );
    });
});
