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
