import { describe, expect, it, vi } from "vitest";
import {
    cancelTask,
    createCancellationToken,
    delegateTaskOrResult,
    drainTaskSync,
    resumeTaskAsync,
} from "./composition-task.ts";

const task = (events) =>
    (function* () {
        events.push("collect");
        yield { reason: "collected" };
        events.push("paragraph-1");
        yield { reason: "paragraph" };
        events.push("paragraph-2");
        yield { reason: "paragraph" };
        events.push("publish");
        return "complete";
    })();

describe("composition task runner", () => {
    it("sync drain preserves checkpoint order and result", () => {
        const events = [];
        expect(drainTaskSync(task(events))).toBe("complete");
        expect(events).toEqual([
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
        ]);
    });

    it("default scheduling makes progress without an idle callback", () => {
        vi.useFakeTimers();
        const originalIdleCallback = globalThis.requestIdleCallback,
            idleCallback = vi.fn();
        globalThis.requestIdleCallback = idleCallback;
        try {
            const events = [],
                complete = vi.fn();
            resumeTaskAsync(task(events), {
                token: createCancellationToken(),
                onComplete: complete,
            });
            vi.runAllTimers();
            expect(idleCallback).not.toHaveBeenCalled();
            expect(complete).toHaveBeenCalledWith("complete");
        } finally {
            globalThis.requestIdleCallback = originalIdleCallback;
            vi.useRealTimers();
        }
    });

    it("async resume crosses scheduler boundaries with equivalent behavior", () => {
        const events = [],
            queue = [],
            complete = vi.fn();
        resumeTaskAsync(task(events), {
            token: createCancellationToken(),
            scheduler: (resume) => queue.push(resume),
            onComplete: complete,
        });
        expect(events).toEqual([]);
        while (queue.length) queue.shift()();
        expect(events).toEqual([
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
        ]);
        expect(complete).toHaveBeenCalledWith("complete");
    });

    it("isolates task errors", () => {
        const queue = [],
            error = vi.fn();
        function* failingTask() {
            yield { reason: "before-error" };
            throw new Error("task failure");
        }
        resumeTaskAsync(failingTask(), {
            token: createCancellationToken(),
            scheduler: (resume) => queue.push(resume),
            onError: error,
        });
        while (queue.length) queue.shift()();
        expect(error).toHaveBeenCalledOnce();
        expect(error.mock.calls[0][0].message).toBe("task failure");
    });

    it("cancellation prevents completion", () => {
        const events = [],
            queue = [],
            complete = vi.fn(),
            token = createCancellationToken();
        resumeTaskAsync(task(events), {
            token,
            scheduler: (resume) => queue.push(resume),
            onComplete: complete,
        });
        queue.shift()();
        cancelTask(token);
        while (queue.length) queue.shift()();
        expect(complete).not.toHaveBeenCalled();
        expect(events).toEqual(["collect"]);
    });
});

describe("delegateTaskOrResult (the contract's union return)", () => {
    const outer = (events) =>
        (function* () {
            events.push("before");
            yield { reason: "outer/before" };
            const result = yield* delegateTaskOrResult(task(events));
            events.push("after");
            return result;
        })();

    it("passes a plain result through without checkpoints", () => {
        expect(drainTaskSync(delegateTaskOrResult("plain"))).toBe("plain");
    });

    it("delegates generator checkpoints into the surrounding stream", () => {
        const events = [],
            reasons = [],
            it = outer(events);
        let step = it.next();
        while (!step.done) {
            reasons.push(step.value.reason);
            step = it.next();
        }
        expect(step.value).toBe("complete");
        expect(reasons).toEqual([
            "outer/before",
            "collected",
            "paragraph",
            "paragraph",
        ]);
        expect(events).toEqual([
            "before",
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
            "after",
        ]);
    });

    it("async resume matches sync drain for delegated tasks", () => {
        const syncEvents = [],
            asyncEvents = [],
            queue = [],
            complete = vi.fn();
        expect(drainTaskSync(outer(syncEvents))).toBe("complete");
        resumeTaskAsync(outer(asyncEvents), {
            token: createCancellationToken(),
            scheduler: (resume) => queue.push(resume),
            onComplete: complete,
        });
        while (queue.length) queue.shift()();
        expect(complete).toHaveBeenCalledWith("complete");
        expect(asyncEvents).toEqual(syncEvents);
    });

    it("cancellation mid-delegation prevents completion", () => {
        const events = [],
            queue = [],
            complete = vi.fn(),
            token = createCancellationToken();
        resumeTaskAsync(delegateTaskOrResult(task(events)), {
            token,
            scheduler: (resume) => queue.push(resume),
            onComplete: complete,
        });
        queue.shift()();
        cancelTask(token);
        while (queue.length) queue.shift()();
        expect(complete).not.toHaveBeenCalled();
        expect(events).toEqual(["collect"]);
    });
});
