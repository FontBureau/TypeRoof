/**
 * Cooperative composition task protocol.
 *
 * A task is a generator whose yielded values are coarse checkpoints. The
 * same generator can be drained directly for explicit synchronous reveal or
 * resumed by a rendering-friendly scheduler. Cancellation is checked before
 * every resume; partial generator state is never published by this utility.
 * Publication remains the owner's final generator step.
 */

export interface CompositionCheckpoint {
    reason: string;
    work?: number;
}

export interface CancellationToken {
    cancelled: boolean;
}

export type CompositionTask<Result> = Generator<
    CompositionCheckpoint,
    Result,
    void
>;

export type TaskScheduler = (resume: () => void) => void;

export interface AsyncTaskOptions<Result> {
    token: CancellationToken;
    scheduler?: TaskScheduler;
    workBudget?: number;
    onComplete?: (result: Result) => void;
    onError?: (error: unknown) => void;
}

export const createCancellationToken = (): CancellationToken => ({
    cancelled: false,
});

export function cancelTask(token: CancellationToken): void {
    token.cancelled = true;
}

export function defaultTaskScheduler(resume: () => void): void {
    // requestIdleCallback without a deadline can starve indefinitely while
    // the browser considers the page busy; in practice algorithm changes
    // then appeared to land only after unrelated pointer input. A macrotask
    // still yields rendering/input between checkpoints but guarantees
    // forward progress without user interaction.
    globalThis.setTimeout(resume, 0);
}

/** Duck-typed delegation for algorithm outputs (the contract's union
 * return): a plain result passes through; a CompositionTask generator
 * is delegated into the surrounding task, so its checkpoints join the
 * owner's stream and its return value becomes the result. Sync drain
 * and async resume share this delegation — both paths behave
 * identically, and cancellation closes the delegated generator before
 * its next step. Deliberately generic: this module must not import
 * the composition contract (the contract imports this module). */
export function* delegateTaskOrResult<Result>(
    output: Result | CompositionTask<Result>,
): CompositionTask<Result> {
    if (typeof (output as CompositionTask<Result>).next === "function")
        return yield* output as CompositionTask<Result>;
    return output as Result;
}

export function drainTaskSync<Result>(
    task: CompositionTask<Result>,
    token: CancellationToken = createCancellationToken(),
): Result | undefined {
    while (!token.cancelled) {
        const step = task.next();
        if (step.done) return step.value;
    }
    task.return(undefined as Result);
    return undefined;
}

export function resumeTaskAsync<Result>(
    task: CompositionTask<Result>,
    {
        token,
        scheduler = defaultTaskScheduler,
        workBudget = 1,
        onComplete = () => {},
        onError = () => {},
    }: AsyncTaskOptions<Result>,
): void {
    const resume = () => {
        if (token.cancelled) {
            task.return(undefined as Result);
            return;
        }
        try {
            for (let work = 0; work < workBudget; work++) {
                const step = task.next();
                if (step.done) {
                    onComplete(step.value);
                    return;
                }
                if (token.cancelled) {
                    task.return(undefined as Result);
                    return;
                }
            }
            scheduler(resume);
        } catch (error) {
            onError(error);
        }
    };
    scheduler(resume);
}

/**
 * A draining round-robin `TaskScheduler`: one task composes to
 * completion per macrotask tick, so the host can paint between block
 * nodes (progressive per-paragraph reveal).
 *
 * Scheduled resumes queue in arrival order. Every tick pops the oldest
 * queued resume and drains its task synchronously to completion:
 * `resumeTaskAsync` re-enters `scheduler(resume)` after every
 * checkpoint, and those re-entrant calls — recognized by resume
 * identity — are absorbed into the running drain instead of
 * re-queued. Draining to completion keeps publication atomic per
 * task (the owner's final generator step) and makes the reveal
 * granularity independent of how many checkpoints an algorithm
 * yields: greedy algorithms yield none, Knuth-Plass one per
 * relaxation round.
 *
 * The next queued resume is deferred to a fresh macrotask. Resumes of
 * other tasks — e.g. a replacement composed during a drain — are
 * never absorbed; they keep their own queue slot. A cancelled task
 * costs one no-op tick (its resume returns right after
 * `task.return`).
 */
export function createDrainingRoundRobinTaskScheduler(): TaskScheduler {
    const queue: Array<() => void> = [];
    let scheduled = false;
    let drained: (() => void) | null = null;
    let continued: (() => void) | null = null;

    const schedule = (): void => {
        if (scheduled || queue.length === 0) return;
        scheduled = true;
        globalThis.setTimeout(tick, 0);
    };

    const drain = (initial: () => void): void => {
        drained = initial;
        let resume: (() => void) | null = initial;
        try {
            while (resume !== null) {
                continued = null;
                resume();
                resume = continued;
            }
        } finally {
            drained = null;
            continued = null;
        }
    };

    const tick = (): void => {
        scheduled = false;
        const resume = queue.shift();
        if (resume === undefined) return;
        try {
            drain(resume);
        } finally {
            // a drain that escapes with an error (an onError that
            // throws) must not strand the tasks queued behind it
            schedule();
        }
    };

    return (resume: () => void): void => {
        if (resume === drained) {
            // re-entrant continuation of the drained task (drained is
            // null outside drains): absorb it into the running drain
            continued = resume;
            return;
        }
        queue.push(resume);
        schedule();
    };
}
