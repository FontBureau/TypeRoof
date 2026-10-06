import { describe, expect, it, vi } from "vitest";
import { Path } from "../../../../metamodel.mjs";
import {
    CompositionController,
    memoizeWidthAtStep,
} from "./composition-controller.ts";

const makeController = () => {
        const queue = [],
            controller = new CompositionController({
                harfbuzz: null,
                compositionTaskScheduler: (resume) => queue.push(resume),
            });
        return { controller, queue };
    },
    source = (identity) => ({
        textblockPath: Path.fromString("/document/content/0"),
        textblockNode: identity,
        nodePropertiesPayload: identity,
        newState: identity,
        styleResolution: null,
    }),
    drain = (queue) => {
        while (queue.length) queue.shift()();
    };

describe("CompositionController cooperative lifecycle", () => {
    it("publishes no stale result after a source is superseded", () => {
        const { controller, queue } = makeController(),
            events = [],
            first = {},
            second = {};
        controller._composeTextblockTask = function* (current) {
            events.push(["start", current.textblockNode]);
            yield { reason: "paragraph" };
            events.push(["publish", current.textblockNode]);
        };
        let current = source(first);
        controller.registerSource("/document/content/0", () => current);
        controller.subscribe("/document/content/0");

        queue.shift()();
        current = source(second);
        controller.sourceChanged("/document/content/0");
        drain(queue);

        expect(events).toEqual([
            ["start", first],
            ["start", second],
            ["publish", second],
        ]);
    });

    it("keeps the last complete publication while replacement work is pending", () => {
        const { controller, queue } = makeController(),
            published = [],
            first = {},
            second = {};
        controller._composeTextblockTask = function* (current) {
            yield { reason: "paragraph" };
            published.push(current.textblockNode);
        };
        let current = source(first);
        controller.registerSource("/document/content/0", () => current);
        controller.subscribe("/document/content/0");
        drain(queue);
        expect(published).toEqual([first]);

        current = source(second);
        controller.sourceChanged("/document/content/0");
        expect(published).toEqual([first]);
        drain(queue);
        expect(published).toEqual([first, second]);
    });

    it("last unsubscribe cancels pending work", () => {
        const { controller, queue } = makeController(),
            publish = vi.fn();
        controller._composeTextblockTask = function* () {
            yield { reason: "paragraph" };
            publish();
        };
        controller.registerSource("/document/content/0", () => source({}));
        const unsubscribe = controller.subscribe("/document/content/0");
        queue.shift()();
        unsubscribe();
        drain(queue);
        expect(publish).not.toHaveBeenCalled();
    });

    it("flushSync drains the current source immediately", () => {
        const { controller, queue } = makeController(),
            events = [];
        controller._composeTextblockTask = function* () {
            events.push("start");
            yield { reason: "paragraph" };
            events.push("publish");
        };
        const current = source({});
        controller.registerSource("/document/content/0", () => current);
        controller.subscribe("/document/content/0");
        controller.flushSync("/document/content/0");
        expect(events).toEqual(["start", "publish"]);
        drain(queue);
        expect(events).toEqual(["start", "publish"]);
    });
});

describe("memoizeWidthAtStep (the per-paragraph Host width memo)", () => {
    // milestone 5: structural hit-rate expectations (counts, not
    // wall-clock) — the Knuth-Plass DP re-probes identical
    // (from, to, lattice-step) tuples per source fitness slot and
    // the adaptive-lattice probes repeat edge evaluations.
    it("identical probes hit the cache; distinct keys re-measure", () => {
        let calls = 0;
        const widthAtStep = (from, to, step) => {
                calls++;
                return (to - from) * 10 * (1 + step);
            },
            memoized = memoizeWidthAtStep(widthAtStep);

        // the same tuple twice: one underlying call
        expect(memoized(2, 7, 0.3)).toBe(65);
        expect(memoized(2, 7, 0.3)).toBe(65);
        expect(calls).toBe(1);

        // step 0 and the +/-1 adaptive-lattice probes are distinct
        // keys (and hit on repetition)
        for (const step of [0, -1, 1]) {
            memoized(0, 20, step);
            memoized(0, 20, step);
        }
        expect(calls).toBe(4);

        // the (from, to) span is part of the key
        memoized(2, 8, 0.3);
        expect(calls).toBe(5);
    });

    it("lattice steps computed identically hit exactly (1/K probes)", () => {
        let calls = 0;
        const memoized = memoizeWidthAtStep(() => {
                calls++;
                return 42;
            }),
            K = 7;
        // the DP's binary-search probes: exact k/K floats, computed
        // the same way every time -> cache hits
        for (let round = 0; round < 4; round++)
            for (const k of [3, 5, 6]) memoized(1, 9, k / K);
        expect(calls).toBe(3);
    });

    it("off-lattice polish probes within a cell never alias", () => {
        // a coarse lattice-cell key would corrupt the polish binary
        // search (every probe in a cell returning one width); the
        // fine 1e-6 grid keeps distinct probe steps distinct
        let calls = 0;
        const memoized = memoizeWidthAtStep((from, to, step) => {
                calls++;
                return step;
            }),
            cell = 1 / 7,
            base = 3 / 7;
        // binary search midpoints inside [base, base + cell] —
        // 12 halvings keep consecutive probes ~1.7e-5 apart, well
        // above the 1e-6 grid (the full 24-iteration polish aliases
        // only below ~5e-7 step — a sub-millipoint width error,
        // harmless to the fit decision)
        let lo = base,
            hi = base + cell;
        for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            memoized(0, 5, mid);
            if (mid < base + cell / 2) lo = mid;
            else hi = mid;
        }
        expect(calls).toBe(12);
    });
});
