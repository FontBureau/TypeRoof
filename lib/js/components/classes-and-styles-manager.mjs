import {
    _BaseComponent,
    UPDATE_STRATEGY,
    UPDATE_STRATEGY_NO_UPDATE,
} from "./basics/component.mjs";

/**
 * Owns classes and inline styles of a single target element (for now
 * the shell's .typeroof-layout element). Registered in the shell's
 * widget array under a widgetBus-id, so layout controllers can look
 * it up on demand (widgetBus.getWidgetById) and use it to apply
 * layout-specific styling. Contract: whoever uses it resets it on
 * destroy; only what was set through this instance is removed.
 *
 * Designed for the future MultipleLayoutsController, which will
 * instantiate one manager per layout container — hence the target
 * element is a constructor argument and otherwise shell-agnostic.
 */
export class ClassesAndStylesManager extends _BaseComponent {
    // No model dependencies; mutations come via the API.
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE;

    constructor(widgetBus, targetElement) {
        super(widgetBus);
        this._targetElement = targetElement;
        this._classes = new Set();
        this._styles = new Map(); // property name -> value
    }

    setClass(className) {
        this._classes.add(className);
        this._targetElement.classList.add(className);
    }

    _cleanupEmptyAttributes() {
        // classList.remove / style.removeProperty leave the attribute
        // as an empty string (DOM keeps the attribute present). For a
        // truly pristine element, drop emptied attributes.
        if (!this._targetElement.classList.length)
            this._targetElement.removeAttribute("class");
        if (!this._targetElement.style.length)
            this._targetElement.removeAttribute("style");
    }

    removeClass(className) {
        this._classes.delete(className);
        this._targetElement.classList.remove(className);
        this._cleanupEmptyAttributes();
    }

    hasClass(className) {
        return this._classes.has(className);
    }

    setStyleProperty(property, value) {
        this._styles.set(property, value);
        this._targetElement.style.setProperty(property, value);
    }

    removeStyleProperty(property) {
        this._styles.delete(property);
        this._targetElement.style.removeProperty(property);
        this._cleanupEmptyAttributes();
    }

    hasStyleProperty(property) {
        return this._styles.has(property);
    }

    /**
     * Removes everything set through this instance. Idempotent.
     */
    reset() {
        for (const className of this._classes)
            this._targetElement.classList.remove(className);
        this._classes.clear();
        for (const property of this._styles.keys())
            this._targetElement.style.removeProperty(property);
        this._styles.clear();
        this._cleanupEmptyAttributes();
    }

    destroy() {
        // Defensive: a destroyed manager must not leave residue.
        // (The contract is user-resets-on-destroy, but reset is also
        // safe here because only this instance's state is removed.)
        this.reset();
        return super.destroy();
    }
}
