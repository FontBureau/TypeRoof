// @vitest-environment jsdom
// Behavior test for EnvironmentProvider: publishes initial
// screen/viewport/layout/dpr values into the 'environment@' protocol
// handler; on simulated changes, the rAF flush updates the handler's
// values and marks the keys updated; destroy disconnects observers and
// unregisters the handler entries.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { EnvironmentProvider } from "./environment-provider.mjs";
import { SimpleProtocolHandler } from "./basics/component.mjs";

function setupWorld() {
    const [name, handler] = SimpleProtocolHandler.create("environment@");
    const layoutElement = document.createElement("div");
    document.body.append(layoutElement);
    const changeStateRequests = [];
    const widgetBus = {
        domTool: { window },
        wrapper: {
            getProtocolHandlerImplementation(protocolName) {
                expect(protocolName).toBe(name);
                return handler;
            },
        },
        changeState(fn) {
            changeStateRequests.push(fn);
            return Promise.resolve(fn?.());
        },
    };
    return { handler, layoutElement, widgetBus, changeStateRequests };
}

describe("EnvironmentProvider", () => {
    beforeEach(() => {
        // jsdom defaults: innerWidth/innerHeight 1024x768, dpr 1.
        window.resizeTo?.(1024, 768);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("publishes initial values for all four keys", () => {
        const { handler, layoutElement, widgetBus } = setupWorld();
        new EnvironmentProvider(widgetBus, layoutElement);
        for (const key of ["screen", "viewport", "layout", "dpr"]) {
            expect(handler.hasRegistered(key)).toBe(true);
        }
        const viewport = handler.getRegistered("viewport");
        expect(viewport).toEqual({ width: 1024, height: 768 });
        expect(handler.getRegistered("dpr")).toBe(1);
        const layout = handler.getRegistered("layout");
        expect(layout).toEqual({ width: 0, height: 0 });
        // Initial registration is marked updated so initial consumers
        // see it via getUpdated as well.
        const [updated] = handler.getUpdated("viewport");
        expect(updated).toBe(true);
    });

    it("viewport change -> flush updates value and marks updated", async () => {
        const { handler, layoutElement, widgetBus, changeStateRequests } =
            setupWorld();
        const provider = new EnvironmentProvider(widgetBus, layoutElement);
        handler.resetUpdatedLog();

        // Simulate a viewport change.
        window.innerWidth = 800;
        window.innerHeight = 600;
        window.dispatchEvent(new Event("resize"));

        // Flush is scheduled on rAF; run pending callbacks.
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        // rAF callbacks run in order; the provider's flush ran already
        // if it was scheduled before our probe. Force a second frame to
        // be safe.
        await new Promise((resolve) => window.requestAnimationFrame(resolve));

        expect(handler.getRegistered("viewport")).toEqual({
            width: 800,
            height: 600,
        });
        const [updated] = handler.getUpdated("viewport");
        expect(updated).toBe(true);
        // Unchanged key is not marked.
        const [screenUpdated] = handler.getUpdated("dpr");
        expect(screenUpdated).toBe(false);
        // The provider requested an app update cycle.
        expect(changeStateRequests.length).toBeGreaterThan(0);
        provider.destroy();
    });

    it("dpr change marks updated and re-subscribes when matchMedia exists", async () => {
        const { handler, layoutElement, widgetBus } = setupWorld();
        // jsdom lacks matchMedia; provide a minimal fake tracking
        // listeners and media strings.
        const mediaQueryLists = [];
        window.matchMedia = (media) => {
            const listeners = new Set();
            const mql = {
                media,
                addEventListener: (type, fn) => listeners.add(fn),
                removeEventListener: (type, fn) => listeners.delete(fn),
                dispatch: () => {
                    for (const fn of listeners) fn();
                },
            };
            mediaQueryLists.push(mql);
            return mql;
        };
        const provider = new EnvironmentProvider(widgetBus, layoutElement);
        handler.resetUpdatedLog();

        Object.defineProperty(window, "devicePixelRatio", {
            value: 2,
            configurable: true,
        });
        // Fire the change on the active MediaQueryList.
        mediaQueryLists[0].dispatch();

        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        await new Promise((resolve) => window.requestAnimationFrame(resolve));

        expect(handler.getRegistered("dpr")).toBe(2);
        const [updated] = handler.getUpdated("dpr");
        expect(updated).toBe(true);
        // Re-subscribed with the new value.
        expect(mediaQueryLists.at(-1).media).toContain("2dppx");
        provider.destroy();
        delete window.matchMedia;
    });

    it("destroy unregisters all keys", () => {
        const { handler, layoutElement, widgetBus } = setupWorld();
        const provider = new EnvironmentProvider(widgetBus, layoutElement);
        provider.destroy();
        for (const key of ["screen", "viewport", "layout", "dpr"]) {
            expect(handler.hasRegistered(key)).toBe(false);
        }
    });
});
