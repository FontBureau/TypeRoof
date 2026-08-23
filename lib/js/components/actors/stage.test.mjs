// @vitest-environment jsdom
// Behavior test for StageDOMNode's host-style ownership: automatic
// zoom clips the host via the ClassesAndStylesManager; stopping
// resize-fit (zoom switch or destroy) leaves the host pristine.
// This is the contract that replaced the direct inline writes to
// widgetBus.wrapper.host.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { StageDOMNode } from "../actors/stage.mjs";
import { ClassesAndStylesManager } from "../classes-and-styles-manager.mjs";
import DOMTool from "../../domTool.mjs";

// Minimal ResizeObserver stub (jsdom lacks one): fires nothing;
// we drive _resizeFitToHost directly.
class FakeResizeObserver {
    constructor(cb) {
        this.cb = cb;
    }
    observe() {}
    disconnect() {}
}

describe("StageDOMNode host-style ownership", () => {
    let domTool, host, stageNode, manager, widgetBus;

    beforeEach(() => {
        globalThis.ResizeObserver = FakeResizeObserver;
        domTool = new DOMTool(document);
        host = domTool.createElement("div");
        document.body.appendChild(host);
        stageNode = domTool.createElement("div");
        manager = new ClassesAndStylesManager(
            { domTool, rootPath: null },
            host,
        );
        widgetBus = {
            domTool,
            rootPath: null,
            insertElement: () => {},
            // StageDOMNode reaches the manager via getWidgetById.
            getWidgetById: (id, defaultVal) =>
                id === "classes-and-styles-manager" ? manager : defaultVal,
            // Legacy fallback path (no manager): wrapper.host.
            wrapper: { host },
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const makeStageDOMNode = () =>
        new StageDOMNode(widgetBus, stageNode, null, []);

    it("automatic zoom clips the host through the manager; stop resets", () => {
        const stage = makeStageDOMNode();
        // simulate what _resizeFitToHost does on observer fire
        stage._resizeFitToHost(
            { width: 800, height: 600 },
            { width: 400, height: 400 },
        );
        expect(host.style.getPropertyValue("overflow")).toBe("hidden");

        // zoom type switch away from automatic
        stage._stopResizeFitToHost();
        expect(host.style.getPropertyValue("overflow")).toBe("");
        expect(host.getAttribute("style") ?? "").not.toContain("overflow");
    });

    it("player mode (automaticZoomDefault) does not write dynamically", () => {
        const stage = new StageDOMNode(widgetBus, stageNode, null, [], true);
        stage._resizeFitToHost(
            { width: 800, height: 600 },
            { width: 400, height: 400 },
        );
        // clip is static via CSS (.wrapper.player
        // .typeroof-layout--motion-stage), not an inline write.
        expect(host.style.getPropertyValue("overflow")).toBe("");
        stage._stopResizeFitToHost();
        expect(host.style.getPropertyValue("overflow")).toBe("");
    });

    it("without a manager, falls back to direct host writes", () => {
        widgetBus.getWidgetById = (id, defaultVal) => defaultVal;
        const stage = makeStageDOMNode();
        stage._resizeFitToHost(
            { width: 800, height: 600 },
            { width: 400, height: 400 },
        );
        expect(host.style.getPropertyValue("overflow")).toBe("hidden");
        stage._stopResizeFitToHost();
        expect(host.style.getPropertyValue("overflow")).toBe("");
    });
});
