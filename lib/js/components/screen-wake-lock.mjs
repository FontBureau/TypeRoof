/**
 * Keeps the screen awake while the document is in full screen mode.
 *
 * Uses the Screen Wake Lock API:
 * https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
 *
 * A lock is requested when the document enters full screen mode and
 * released when it leaves it, no matter how full screen mode was left
 * (e.g. via the Escape key). The user agent releases the lock itself
 * when the page becomes hidden, so it is requested again when the page
 * becomes visible while still in full screen mode.
 *
 * Where the API is not available (unsupported browser, insecure context)
 * this does nothing. Where a request is denied (e.g. in an iframe without
 * the "screen-wake-lock" permission policy, or on low battery), a warning
 * is logged and the player works as before.
 */
export class FullscreenWakeLock {
    constructor(document, navigator = document.defaultView?.navigator) {
        this._document = document;
        this._wakeLockApi = navigator?.wakeLock ?? null;
        this._sentinel = null;
        this._pending = null;
        this._destroyed = false;
        this._onChange = () => this._sync();
        if (!this.supported) return;
        this._document.addEventListener("fullscreenchange", this._onChange);
        this._document.addEventListener("visibilitychange", this._onChange);
        // In case this is created while already in full screen mode.
        this._sync();
    }

    get supported() {
        return this._wakeLockApi !== null;
    }

    get active() {
        return this._sentinel !== null && !this._sentinel.released;
    }

    get _wanted() {
        return (
            !this._destroyed &&
            !!this._document.fullscreenElement &&
            this._document.visibilityState === "visible"
        );
    }

    /**
     * Returns a promise that resolves when the lock state matches the
     * current full screen and visibility state of the document.
     */
    _sync() {
        if (!this.supported) return Promise.resolve();
        if (this._pending !== null)
            // A request is in flight, it will call _sync again when done.
            return this._pending;
        if (this._wanted && !this.active) return this._request();
        if (!this._wanted && this._sentinel !== null) return this._release();
        return Promise.resolve();
    }

    _request() {
        this._pending = this._wakeLockApi
            .request("screen")
            .then(
                (sentinel) => {
                    this._sentinel = sentinel;
                    sentinel.addEventListener("release", () => {
                        if (this._sentinel === sentinel) this._sentinel = null;
                    });
                },
                (error) => {
                    console.warn(
                        `${this.constructor.name}: screen wake lock not acquired: ${error.message}`,
                    );
                    return false;
                },
            )
            .then((success) => {
                this._pending = null;
                // State may have changed while the request was in flight
                // (e.g. full screen was left already). Don't retry after
                // a failed request, that would loop.
                if (success !== false) return this._sync();
            });
        return this._pending;
    }

    _release() {
        const sentinel = this._sentinel;
        this._sentinel = null;
        return sentinel.release().catch((error) => {
            console.warn(
                `${this.constructor.name}: releasing screen wake lock failed: ${error.message}`,
            );
        });
    }

    destroy() {
        this._destroyed = true;
        if (!this.supported) return Promise.resolve();
        this._document.removeEventListener("fullscreenchange", this._onChange);
        this._document.removeEventListener("visibilitychange", this._onChange);
        return this._sync();
    }
}
