// @vitest-environment jsdom
// Behavior test for StageDOMNode's host-style ownership: automatic
// zoom clips the host via the ClassesAndStylesManager; stopping
// resize-fit (zoom switch or destroy) leaves the host pristine.
// This is the contract that replaced the direct inline writes to
// widgetBus.wrapper.host.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { StageDOMNode } from "../actors/stage.mjs";
import { ClassesAndStylesManager } from "../classes-and-styles-manager.mjs";
import { SimpleProtocolHandler } from "../basics/component.mjs";
import DOMTool from "../../domTool.mjs";

describe("StageDOMNode host-style ownership", () => {
    let domTool, host, stageNode, manager, widgetBus;

    beforeEach(() => {
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
            wrapper: { host },
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const makeStageDOMNode = (automaticZoomDefault = false) =>
        new StageDOMNode(widgetBus, stageNode, null, [], automaticZoomDefault);

    it("automatic zoom clips the host through the manager; stop resets", () => {
        const stage = makeStageDOMNode();
        // simulate what _resizeFitToHost does on environment@layout change
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
        const stage = makeStageDOMNode(true);
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
});

describe("StageDOMNode environment@stage publication", () => {
    let domTool, host, stageNode, manager, widgetBus, environmentHandler;

    beforeEach(() => {
        domTool = new DOMTool(document);
        host = domTool.createElement("div");
        document.body.appendChild(host);
        stageNode = domTool.createElement("div");
        manager = new ClassesAndStylesManager(
            { domTool, rootPath: null },
            host,
        );
        environmentHandler = new SimpleProtocolHandler("environment@");
        widgetBus = {
            domTool,
            rootPath: null,
            insertElement: () => {},
            getWidgetById: (id, defaultVal) =>
                id === "classes-and-styles-manager" ? manager : defaultVal,
            wrapper: {
                host,
                getProtocolHandlerImplementation: (name, defaultVal) =>
                    name === "environment@" ? environmentHandler : defaultVal,
            },
        };
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const makeStage = () =>
        new StageDOMNode(widgetBus, stageNode, null, [], false);

    it("publishes the design box on size change and unpublishes on destroy", () => {
        const stage = makeStage(),
            size = { width: 400, height: 300 };
        stage.getEntry = (name) => ({ value: size[name] });
        // no size change yet: nothing published
        expect(environmentHandler.hasRegistered("stage")).toBe(false);
        // simulate an update with a width change
        stage.update(new Map([["width", { value: 400 }]]));
        expect(environmentHandler.hasRegistered("stage")).toBe(true);
        expect(environmentHandler.getRegistered("stage")).toEqual({
            width: 400,
            height: 300,
        });
        // a second change re-registers (no duplicate-registration throw)
        size.height = 301;
        stage.update(new Map([["height", { value: 301 }]]));
        expect(environmentHandler.getRegistered("stage")).toEqual({
            width: 400,
            height: 301,
        });
        stage.destroy();
        expect(environmentHandler.hasRegistered("stage")).toBe(false);
    });

    it("a second stage throws on duplicate registration (fail loud)", () => {
        const first = makeStage();
        first.getEntry = (name) => ({ value: name === "width" ? 400 : 300 });
        first.update(new Map([["width", { value: 400 }]]));
        const second = makeStage();
        second.getEntry = (name) => ({ value: name === "width" ? 500 : 300 });
        // Multiple stages in one app must be handled explicitly, not
        // silently ignored — the duplicate registration throws.
        expect(() =>
            second.update(new Map([["width", { value: 500 }]])),
        ).toThrow("already exists");
    });
});
