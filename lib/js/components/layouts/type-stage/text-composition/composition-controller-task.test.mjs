import { describe, expect, it, vi } from "vitest";
import { Path } from "../../../../metamodel.mjs";
import { CompositionController } from "./composition-controller.ts";

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
