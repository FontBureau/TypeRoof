import {
    _BaseComponent,
    UPDATE_STRATEGY,
    UPDATE_STRATEGY_NO_UPDATE,
} from "./basics/component.mjs";

/**
 * Publishes environment facts into the 'environment@' protocol handler:
 *   'screen'   -> { width, height } in css-px (window.screen.width/height)
 *   'viewport' -> { width, height } in css-px (window.innerWidth/innerHeight)
 *   'layout'   -> { width, height } in css-px (content-box of the layout element)
 *   'dpr'      -> devicePixelRatio (stub for later use)
 *
 * Environment events arrive in bursts (a monitor move fires resize +
 * dpr + layout changes together). Handlers only record current values
 * and schedule ONE rAF flush; the flush diffs against the cache and
 * marks changed keys updated in the protocol handler, then requests an
 * app update via widgetBus.changeState (no-op fn — environment values
 * are distributed via the protocol, never stored in the model).
 */
export class EnvironmentProvider extends _BaseComponent {
    // Mutations come via event observers, not from model state.
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE;

    constructor(widgetBus, layoutElement) {
        super(widgetBus);
        this._window = widgetBus.domTool.window;
        this._layoutElement = layoutElement;
        this._handler =
            widgetBus.wrapper.getProtocolHandlerImplementation("environment@");
        this._cache = new Map(); // key -> {width, height} | number
        this._dirty = new Set(); // keys -> flush
        this._flushScheduled = false;
        this._unregisterFns = new Map(); // key -> unregister closure

        this._boundOnWindowChange = this._onWindowChange.bind(this);
        this._boundOnDprChange = this._onDprChange.bind(this);
        this._boundOnResizeObserver = this._onResizeObserver.bind(this);
        this._boundFlush = this._flush.bind(this);
        this._dprMediaQueryList = null;

        // Initial values are registered synchronously, so consumers on
        // initial update already find them via getRegistered.
        this._publishAll();

        // ResizeObserver may be unavailable (jsdom, some embedded
        // contexts); without it, the layout key keeps its initial
        // reading and updates via window resize as a fallback.
        this._resizeObserver =
            typeof this._window.ResizeObserver === "function"
                ? new this._window.ResizeObserver(this._boundOnResizeObserver)
                : null;
        this._resizeObserver?.observe(layoutElement, {
            box: "content-box",
        });
        this._window.addEventListener("resize", this._boundOnWindowChange);
        this._window.addEventListener(
            "orientationchange",
            this._boundOnWindowChange,
        );
        this._subscribeDpr();
    }

    _readScreen() {
        return {
            width: this._window.screen.width,
            height: this._window.screen.height,
        };
    }

    _readViewport() {
        return {
            width: this._window.innerWidth,
            height: this._window.innerHeight,
        };
    }

    _readLayout() {
        return {
            width: this._layoutElement.offsetWidth,
            height: this._layoutElement.offsetHeight,
        };
    }

    _readDpr() {
        return this._window.devicePixelRatio;
    }

    /** Register current values for all keys (initial publication). */
    _publishAll() {
        const values = {
            screen: this._readScreen(),
            viewport: this._readViewport(),
            layout: this._readLayout(),
            dpr: this._readDpr(),
        };
        for (const [key, value] of Object.entries(values)) {
            this._cache.set(key, value);
            this._registerKey(key, value);
            this._handler.setUpdated(key);
        }
    }

    _registerKey(key, value) {
        this._unregisterFns.set(key, this._handler.register(key, value));
    }

    _unregisterKey(key) {
        const unregister = this._unregisterFns.get(key);
        if (unregister) {
            unregister();
            this._unregisterFns.delete(key);
        }
    }

    /**
     * Diff the cache against current readings; for changed keys,
     * re-register the new value and mark updated.
     */
    _flush() {
        this._flushScheduled = false;
        if (this._dirty.size === 0) return;
        for (const key of this._dirty) {
            const current =
                key === "dpr"
                    ? this._readDpr()
                    : key === "layout"
                      ? this._readLayout()
                      : key === "screen"
                        ? this._readScreen()
                        : this._readViewport();
            const cached = this._cache.get(key);
            const same =
                typeof current === "number"
                    ? current === cached
                    : current.width === cached.width &&
                      current.height === cached.height;
            if (same) continue;
            this._cache.set(key, current);
            // register() throws on duplicate identifiers; unregister the
            // previous value first.
            this._unregisterKey(key);
            this._registerKey(key, current);
            this._handler.setUpdated(key);
        }
        this._dirty.clear();
        // Trigger the app's update cycle; the environment values travel
        // via the protocol handler, the model is not touched.
        this.widgetBus.changeState(() => {});
    }

    _scheduleFlush(key) {
        this._dirty.add(key);
        if (this._flushScheduled) return;
        this._flushScheduled = true;
        this._window.requestAnimationFrame(this._boundFlush);
    }

    _onWindowChange(/*event*/) {
        // resize + orientationchange may affect viewport, screen and
        // layout (the layout element tracks viewport in full-viewport
        // shells). The ResizeObserver covers layout precisely; read the
        // others here.
        this._scheduleFlush("viewport");
        this._scheduleFlush("screen");
    }

    _onResizeObserver(/*entries*/) {
        this._scheduleFlush("layout");
    }

    _subscribeDpr() {
        // No native dpr-change event exists; a matchMedia query built
        // from the CURRENT dpr value fires whenever dpr changes away
        // from it. Re-subscribe with the new value after each change.
        // matchMedia may be unavailable (jsdom); then the only dpr
        // trigger is window resize.
        if (typeof this._window.matchMedia !== "function") return;
        const dpr = this._readDpr();
        this._dprMediaQueryList = this._window.matchMedia(
            `(resolution: ${dpr}dppx)`,
        );
        // 'change' (not 'addListener') is the modern API.
        this._dprMediaQueryList.addEventListener(
            "change",
            this._boundOnDprChange,
        );
    }

    _onDprChange(/*event*/) {
        this._unsubscribeDpr();
        this._subscribeDpr();
        this._scheduleFlush("dpr");
    }

    _unsubscribeDpr() {
        if (this._dprMediaQueryList) {
            this._dprMediaQueryList.removeEventListener(
                "change",
                this._boundOnDprChange,
            );
            this._dprMediaQueryList = null;
        }
    }

    destroy() {
        this._resizeObserver?.disconnect();
        this._window.removeEventListener("resize", this._boundOnWindowChange);
        this._window.removeEventListener(
            "orientationchange",
            this._boundOnWindowChange,
        );
        this._unsubscribeDpr();
        for (const key of [...this._unregisterFns.keys()])
            this._unregisterKey(key);
        this._dirty.clear();
        return super.destroy();
    }
}
