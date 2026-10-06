// @vitest-environment jsdom
// Tests for the in-app tour: steps resolve against the shell chrome that
// exists for every layout (a missing anchor resolves to null), the
// "viewed" flag round-trips (with a cookie fallback) and autoStartTour
// respects flags.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
    TOUR_STEPS,
    getTourSteps,
    hasViewedTour,
    setTourViewed,
    startTour,
    autoStartTour,
} from "./app-tour.mjs";

function setupShellChrome() {
    document.body.innerHTML = `
        <div class="wrapper">
            <div class="typeroof-ui_sidebar">
                <aside class="typeroof-ui typeroof-ui_main">
                    <div class="typeroof-app-menu"></div>
                    <div class="layout-and-font">
                        <label class="ui_layout_select"></label>
                        <label class="ui_font-select"></label>
                    </div>
                </aside>
            </div>
            <div class="typeroof-main">
                <div class="typeroof-layout-before"></div>
                <div class="typeroof-layout"></div>
            </div>
        </div>`;
}

const domTool = {
    get window() {
        return window;
    },
    get document() {
        return document;
    },
};

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("getTourSteps", () => {
    it("has no more than 6 steps", () => {
        expect(TOUR_STEPS.length).toBeLessThanOrEqual(6);
    });

    it("resolves all steps against the shell chrome", () => {
        setupShellChrome();
        const steps = getTourSteps(document);
        expect(steps).toHaveLength(TOUR_STEPS.length);
        // The welcome step has no element, driver.js shows it as a
        // centered dialog.
        expect(steps[0].element).toBe(null);
        expect(steps[0].popover.title).toContain("Welcome to TypeRoof");
        for (const step of steps.slice(1))
            expect(step.element).toBeInstanceOf(window.HTMLElement);
    });
});

describe("viewed flag", () => {
    it("round-trips via localStorage", () => {
        expect(hasViewedTour(window)).toBe(false);
        setTourViewed(window);
        expect(hasViewedTour(window)).toBe(true);
    });

    it("falls back to a cookie when localStorage throws", () => {
        const blocked = {
            document,
            get localStorage() {
                throw new Error("blocked");
            },
        };
        expect(hasViewedTour(blocked)).toBe(false);
        setTourViewed(blocked);
        expect(hasViewedTour(blocked)).toBe(true);
        document.cookie = "typeroof-tour=; max-age=0; path=/";
    });
});

describe("startTour", () => {
    const isTourActive = () =>
        document.querySelector(".driver-popover") !== null;

    it("doesn't start when viewed, unless forced", async () => {
        setupShellChrome();
        setTourViewed(window);
        expect(await startTour(domTool)).toBe(null);
        const tour = await startTour(domTool, { force: true });
        expect(tour).not.toBe(null);
        expect(isTourActive()).toBe(true);
        tour.destroy();
        expect(isTourActive()).toBe(false);
    });

    it("marks the tour viewed when it is closed", async () => {
        setupShellChrome();
        await startTour(domTool);
        expect(hasViewedTour(window)).toBe(false);
        document.querySelector(".driver-popover-close-btn").click();
        expect(isTourActive()).toBe(false);
        expect(hasViewedTour(window)).toBe(true);
    });
});

describe("autoStartTour", () => {
    function run(flags, isEmbedded = false) {
        const raf = vi
            .spyOn(window, "requestAnimationFrame")
            .mockImplementation(() => 0);
        autoStartTour({ domTool, uiFlags: new Set(flags), isEmbedded });
        return raf.mock.calls.length > 0;
    }

    it("schedules the tour by default", () => {
        expect(run([])).toBe(true);
    });

    it("skips when embedded or with playback flags", () => {
        expect(run([], true)).toBe(false);
        expect(run(["autoplay"])).toBe(false);
        expect(run(["autopause"])).toBe(false);
    });

    it("is forced by the tour flag", () => {
        setTourViewed(window);
        expect(run(["tour"])).toBe(true);
    });

    it("doesn't let the tour flag override embedding or playback flags", () => {
        expect(run(["tour"], true)).toBe(false);
        expect(run(["tour", "autoplay"])).toBe(false);
        expect(run(["tour", "autopause"])).toBe(false);
    });
});
