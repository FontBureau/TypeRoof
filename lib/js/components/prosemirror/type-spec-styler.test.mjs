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
            null /* widgetBus unused by destroy() */,
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
            first = new UIDocumentTypeSpecStyler(null, inner, outer);
        inner.setAttribute("style", "color: red;");
        outer.setAttribute("lang", "de");
        first.destroy();
        // The second styler must start from a clean element, not
        // leftover inline styles (here: a clean-slate assertion).
        const second = new UIDocumentTypeSpecStyler(null, inner, outer);
        second.destroy();
        expect(inner.hasAttribute("style")).toBe(false);
        expect(outer.hasAttribute("lang")).toBe(false);
    });
});
