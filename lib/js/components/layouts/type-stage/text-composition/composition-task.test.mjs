import { describe, expect, it, vi } from "vitest";
import {
    cancelTask,
    createCancellationToken,
    createDrainingRoundRobinTaskScheduler,
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

describe("createDrainingRoundRobinTaskScheduler", () => {
    // A real macrotask boundary: the scheduler defers every drain to
    // its own setTimeout round, so awaiting one macrotask observes
    // exactly one composed task (the paint opportunity between block
    // nodes).
    const macrotask = () =>
        new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    it("drains one task to completion per macrotask tick", async () => {
        const events = [],
            scheduler = createDrainingRoundRobinTaskScheduler(),
            completed = [];
        for (const mark of ["first", "second"]) {
            resumeTaskAsync(task(events), {
                token: createCancellationToken(),
                scheduler,
                onComplete: (result) => completed.push([mark, result]),
            });
        }
        // the scheduler defers: nothing composes synchronously
        expect(events).toEqual([]);
        await macrotask();
        expect(events).toEqual([
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
        ]);
        expect(completed).toEqual([["first", "complete"]]);
        await macrotask();
        expect(events).toEqual([
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
        ]);
        expect(completed).toEqual([
            ["first", "complete"],
            ["second", "complete"],
        ]);
    });

    it("absorbs the drained task's continuations without call-stack growth", async () => {
        // Knuth-Plass-shaped: a checkpoint per relaxation round. The
        // drain absorbs them iteratively, so a long paragraph still
        // composes within its single tick.
        const events = [],
            scheduler = createDrainingRoundRobinTaskScheduler(),
            rounds = 5000;
        function* relaxation() {
            for (let round = 0; round < rounds; round++) {
                events.push(round);
                yield { reason: "relaxation-round", work: 1 };
            }
            return "relaxed";
        }
        let result = null;
        resumeTaskAsync(relaxation(), {
            token: createCancellationToken(),
            scheduler,
            onComplete: (value) => {
                result = value;
            },
        });
        await macrotask();
        expect(result).toBe("relaxed");
        expect(events).toHaveLength(5000);
    });

    it("a cancelled task costs one no-op tick", async () => {
        const events = [],
            scheduler = createDrainingRoundRobinTaskScheduler(),
            complete = vi.fn(),
            token = createCancellationToken();
        resumeTaskAsync(task(events), {
            token,
            scheduler,
            onComplete: complete,
        });
        resumeTaskAsync(task(events), {
            token: createCancellationToken(),
            scheduler,
            onComplete: complete,
        });
        cancelTask(token);
        await macrotask();
        expect(events).toEqual([]);
        expect(complete).not.toHaveBeenCalled();
        await macrotask();
        expect(complete).toHaveBeenCalledOnce();
        expect(events).toEqual([
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
        ]);
    });

    it("queues a task scheduled from inside another drain", async () => {
        // a source change re-composes synchronously while another
        // textblock task is mid-drain: the new task must not be
        // absorbed into the running drain (that would clobber the
        // drained task's continuation slot) but keep its own tick
        const events = [],
            scheduler = createDrainingRoundRobinTaskScheduler(),
            innerComplete = vi.fn();
        function* composingTask() {
            events.push("collect");
            yield { reason: "collect/resolve" };
            resumeTaskAsync(task(events), {
                token: createCancellationToken(),
                scheduler,
                onComplete: innerComplete,
            });
            events.push("publish");
            return "composed";
        }
        let result = null;
        resumeTaskAsync(composingTask(), {
            token: createCancellationToken(),
            scheduler,
            onComplete: (value) => {
                result = value;
            },
        });
        await macrotask();
        expect(events).toEqual(["collect", "publish"]);
        expect(result).toBe("composed");
        expect(innerComplete).not.toHaveBeenCalled();
        await macrotask();
        expect(innerComplete).toHaveBeenCalledOnce();
        expect(events).toEqual([
            "collect",
            "publish",
            "collect",
            "paragraph-1",
            "paragraph-2",
            "publish",
        ]);
    });
});
