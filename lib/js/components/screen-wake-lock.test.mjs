// Behavior test for FullscreenWakeLock: a screen wake lock is held
// exactly while the document is in full screen mode and visible; it is
// released when full screen mode is left (by any means) and requested
// again when the page becomes visible again while still in full screen.
import { describe, it, expect, vi, afterEach } from "vitest";

import { FullscreenWakeLock } from "./screen-wake-lock.mjs";

class FakeDocument extends EventTarget {
    fullscreenElement = null;
    visibilityState = "visible";
    setFullscreen(on) {
        this.fullscreenElement = on ? {} : null;
        this.dispatchEvent(new Event("fullscreenchange"));
    }
    setVisibility(state) {
        this.visibilityState = state;
        this.dispatchEvent(new Event("visibilitychange"));
    }
}

class FakeSentinel extends EventTarget {
    released = false;
    async release() {
        if (this.released) return;
        this.released = true;
        this.dispatchEvent(new Event("release"));
    }
}

function setupWorld({ deny = false } = {}) {
    const document = new FakeDocument();
    const sentinels = [];
    const wakeLock = {
        request: vi.fn(async (type) => {
            expect(type).toBe("screen");
            if (deny) throw new Error("NotAllowedError: denied");
            const sentinel = new FakeSentinel();
            sentinels.push(sentinel);
            return sentinel;
        }),
    };
    return { document, sentinels, wakeLock, navigator: { wakeLock } };
}

// Let pending wake lock promises settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("FullscreenWakeLock", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("does not request a lock outside of full screen mode", async () => {
        const { document, wakeLock, navigator } = setupWorld();
        const lock = new FullscreenWakeLock(document, navigator);
        await settle();
        expect(lock.supported).toBe(true);
        expect(wakeLock.request).not.toHaveBeenCalled();
        expect(lock.active).toBe(false);
    });

    it("requests a lock when entering full screen mode", async () => {
        const { document, wakeLock, navigator } = setupWorld();
        const lock = new FullscreenWakeLock(document, navigator);
        document.setFullscreen(true);
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(1);
        expect(lock.active).toBe(true);
    });

    it("requests a lock when created while already in full screen", async () => {
        const { document, wakeLock, navigator } = setupWorld();
        document.fullscreenElement = {};
        const lock = new FullscreenWakeLock(document, navigator);
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(1);
        expect(lock.active).toBe(true);
    });

    it("releases the lock when leaving full screen mode", async () => {
        const { document, sentinels, navigator } = setupWorld();
        const lock = new FullscreenWakeLock(document, navigator);
        document.setFullscreen(true);
        await settle();
        // Leaving via e.g. the Escape key only fires fullscreenchange.
        document.setFullscreen(false);
        await settle();
        expect(sentinels).toHaveLength(1);
        expect(sentinels[0].released).toBe(true);
        expect(lock.active).toBe(false);
    });

    it("does not request twice when full screen changes repeatedly", async () => {
        const { document, wakeLock, navigator } = setupWorld();
        new FullscreenWakeLock(document, navigator);
        document.setFullscreen(true);
        document.dispatchEvent(new Event("fullscreenchange"));
        document.dispatchEvent(new Event("visibilitychange"));
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it("releases a lock granted after full screen was already left", async () => {
        const { document, sentinels, navigator } = setupWorld();
        const lock = new FullscreenWakeLock(document, navigator);
        // Leave before the request promise resolves.
        document.setFullscreen(true);
        document.setFullscreen(false);
        await settle();
        expect(sentinels).toHaveLength(1);
        expect(sentinels[0].released).toBe(true);
        expect(lock.active).toBe(false);
    });

    it("re-acquires the lock when the page becomes visible again", async () => {
        const { document, sentinels, wakeLock, navigator } = setupWorld();
        const lock = new FullscreenWakeLock(document, navigator);
        document.setFullscreen(true);
        await settle();
        // The user agent releases wake locks of hidden pages.
        document.visibilityState = "hidden";
        await sentinels[0].release();
        document.dispatchEvent(new Event("visibilitychange"));
        await settle();
        expect(lock.active).toBe(false);
        expect(wakeLock.request).toHaveBeenCalledTimes(1);

        document.setVisibility("visible");
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(2);
        expect(lock.active).toBe(true);
    });

    it("does not re-acquire on visibility if full screen was left", async () => {
        const { document, wakeLock, navigator } = setupWorld();
        new FullscreenWakeLock(document, navigator);
        document.setFullscreen(true);
        await settle();
        document.setVisibility("hidden");
        document.setFullscreen(false);
        document.setVisibility("visible");
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it("warns and keeps working when the request is denied", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { document, wakeLock, navigator } = setupWorld({ deny: true });
        const lock = new FullscreenWakeLock(document, navigator);
        document.setFullscreen(true);
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(lock.active).toBe(false);
        // Leaving and entering full screen again retries once, no loop.
        document.setFullscreen(false);
        document.setFullscreen(true);
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(2);
    });

    it("does nothing where the API is not available", async () => {
        const { document } = setupWorld();
        const addEventListener = vi.spyOn(document, "addEventListener");
        const lock = new FullscreenWakeLock(document, {});
        document.setFullscreen(true);
        await settle();
        expect(lock.supported).toBe(false);
        expect(lock.active).toBe(false);
        expect(addEventListener).not.toHaveBeenCalled();
        await lock.destroy();
    });

    it("destroy releases the lock and stops listening", async () => {
        const { document, sentinels, wakeLock, navigator } = setupWorld();
        const lock = new FullscreenWakeLock(document, navigator);
        document.setFullscreen(true);
        await settle();
        await lock.destroy();
        expect(sentinels[0].released).toBe(true);
        document.setFullscreen(false);
        document.setFullscreen(true);
        await settle();
        expect(wakeLock.request).toHaveBeenCalledTimes(1);
        expect(lock.active).toBe(false);
    });
});
