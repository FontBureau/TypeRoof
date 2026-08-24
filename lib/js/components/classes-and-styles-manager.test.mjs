// @vitest-environment jsdom
// Behavior test for ClassesAndStylesManager: classes/styles set through
// the manager land on the target element, and reset() restores the
// element to the pristine state it had before (only manager-added
// state is removed). Destroy auto-resets as a defensive fallback.
import { describe, it, expect } from "vitest";

import { ClassesAndStylesManager } from "./classes-and-styles-manager.mjs";

function setup(targetElement = document.createElement("div")) {
    const manager = new ClassesAndStylesManager({}, targetElement);
    return { manager, targetElement };
}

describe("ClassesAndStylesManager", () => {
    it("applies and removes classes on the target element", () => {
        const { manager, targetElement } = setup();
        manager.setClass("typeroof-layout--type-stage");
        expect(
            targetElement.classList.contains("typeroof-layout--type-stage"),
        ).toBe(true);
        manager.removeClass("typeroof-layout--type-stage");
        expect(
            targetElement.classList.contains("typeroof-layout--type-stage"),
        ).toBe(false);
    });

    it("applies and removes inline styles on the target element", () => {
        const { manager, targetElement } = setup();
        manager.setStyleProperty("overflow", "hidden");
        expect(targetElement.style.getPropertyValue("overflow")).toBe("hidden");
        expect(manager.hasStyleProperty("overflow")).toBe(true);
        manager.removeStyleProperty("overflow");
        expect(targetElement.style.getPropertyValue("overflow")).toBe("");
        expect(manager.hasStyleProperty("overflow")).toBe(false);
    });

    it("reset restores pristine state (element is class/style free)", () => {
        const { manager, targetElement } = setup();
        manager.setClass("a");
        manager.setClass("b");
        manager.setStyleProperty("overflow", "hidden");
        manager.reset();
        expect(targetElement.getAttribute("class")).toBeNull();
        expect(targetElement.getAttribute("style")).toBeNull();
    });

    it("reset is idempotent", () => {
        const { manager } = setup();
        manager.setClass("a");
        manager.reset();
        manager.reset();
        expect(manager.hasClass("a")).toBe(false);
    });

    it("destroy auto-resets (no residue)", () => {
        const { manager, targetElement } = setup();
        manager.setClass("a");
        manager.setStyleProperty("overflow", "hidden");
        manager.destroy();
        expect(targetElement.getAttribute("class")).toBeNull();
        expect(targetElement.getAttribute("style")).toBeNull();
    });
});
