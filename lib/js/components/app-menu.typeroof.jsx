import { serialize } from "../metamodel.mjs";
import {
    _BaseComponent,
    _BaseContainerComponent,
} from "./basics/component.mjs";
import { StaticNode } from "./generic.mjs";
import {
    compressStateForUrl,
    createStateFileName,
    deserializeStateString,
    downloadFile,
} from "../utils/state-file.mjs";
import { getRemovableFonts, UIDialogManageFonts } from "./font-loading.mjs";

/**
 * A menu button ("toggler") together with the menu it opens and closes,
 * both wrapped into a root element.
 */
class AppMenuItem extends _BaseComponent {
    static BASE_CLASS = "typeroof-app-menu-item";
    static OPENED_CLASS = "opened";

    constructor(widgetBus, label, menuElement) {
        super(widgetBus);
        this._menu = menuElement;
        [this.element, this._toggler] = this.initTemplate(label);
        this._setOpen(false);
    }

    initTemplate(label) {
        const h = this._domTool.h;
        const toggler = (
            <button aria-expanded="false" onClick={() => this._toggle()}>
                {label}{" "}
                <span class="material-symbols-outlined">arrow_drop_down</span>
            </button>
        );
        const element = (
            <div class={AppMenuItem.BASE_CLASS}>
                {toggler}
                {this._menu}
            </div>
        );
        this._insertElement(element);
        return [element, toggler];
    }

    get _isOpen() {
        return this._toggler.getAttribute("aria-expanded") === "true";
    }

    /**
     * Whether node is this item or a descendant of it, i.e. whether a
     * click on node is a click on this menu item.
     */
    contains(node) {
        return this.element.contains(node);
    }

    _setOpen(isOpen) {
        this._toggler.setAttribute("aria-expanded", isOpen);
        this._menu.setAttribute("aria-hidden", !isOpen);
        this._menu.classList.toggle(AppMenuItem.OPENED_CLASS, isOpen);
    }

    _toggle() {
        this._setOpen(!this._isOpen);
    }

    close() {
        this._setOpen(false);
    }
}

export class AppMenu extends _BaseContainerComponent {
    /**
     * layouts is the application's Layouts list, i.e. the
     * [key, label, LayoutModule, groupKey] entries that also create the
     * layout controllers. It is used to find the controller of the active
     * layout, which can hook into the reset to defaults.
     */
    constructor(widgetBus, layouts = []) {
        const h = widgetBus.domTool.h,
            mainElement = <div class="typeroof-app-menu"></div>,
            stateFileInput = (
                <input
                    class="typeroof-app-menu-state_file_input"
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => this._onSelectStateFile(event)}
                />
            ),
            loadStateElement = (
                <li>
                    <button onClick={() => this._onClickLoadState()}>
                        Load state...
                    </button>
                    {stateFileInput}
                </li>
            ),
            saveStateElement = (
                <li>
                    <button onClick={() => this._onClickSaveState()}>
                        Save state...
                    </button>
                </li>
            ),
            manageFontsElement = (
                <li>
                    <button onClick={() => this._onClickManageFonts()}>
                        Manage fonts...
                    </button>
                </li>
            ),
            shareLinkElement = (
                <li>
                    <button onClick={() => this._onClickShareLink()}>
                        Copy share link
                    </button>
                </li>
            ),
            resetToDefaultsElement = (
                <li>
                    <button onClick={() => this._onClickResetToDefaults()}>
                        Reset to defaults
                    </button>
                </li>
            ),
            zones = new Map([["main", mainElement]]);
        widgetBus.insertElement(mainElement);

        const menuItemWidgets = [
            [
                { zone: "main", id: "menu-file" },
                [],
                AppMenuItem,
                "File",
                <menu>
                    {loadStateElement}
                    {saveStateElement}
                    {shareLinkElement}
                    <hr />
                    {manageFontsElement}
                    <hr />
                    {resetToDefaultsElement}
                </menu>,
            ],
            [
                { zone: "main", id: "menu-help" },
                [],
                AppMenuItem,
                "Help",
                <menu>
                    <li>
                        <a
                            href="/TypeRoof/docs"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Documentation
                        </a>
                    </li>
                    <li>
                        <a
                            href="https://github.com/FontBureau/TypeRoof/issues"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Issues
                        </a>
                    </li>
                    <li>
                        <a
                            href="https://github.com/FontBureau/TypeRoof"
                            target="_blank"
                            rel="noreferrer"
                        >
                            GitHub
                        </a>
                    </li>
                </menu>,
            ],
        ];

        const widgets = [
            [{ zone: "main" }, [], StaticNode, <h1>TypeRoof</h1>],
            ...menuItemWidgets,
        ];

        super(widgetBus, zones, widgets);

        this._layouts = layouts;
        this._stateFileInput = stateFileInput;
        this._manageFontsDialog = null;
        this._menuItemIds = menuItemWidgets.map(([settings]) => settings.id);
        this._onClickDocumentHandler = this._onClickDocument.bind(this);
        this._domTool.document.addEventListener(
            "click",
            this._onClickDocumentHandler,
        );
    }

    destroy() {
        this._domTool.document.removeEventListener(
            "click",
            this._onClickDocumentHandler,
        );
        super.destroy();
    }

    _onClickLoadState() {
        // Reset, so selecting the same file again triggers a change event.
        this._stateFileInput.value = "";
        this._stateFileInput.click();
    }

    async _onSelectStateFile(event) {
        const [file] = event.target.files || [];
        if (!file) {
            return;
        }
        try {
            const serializedValue = await file.text();
            const appState = this.getEntry("/");
            const likeADraft = deserializeStateString(
                appState.constructor,
                serializedValue,
            );
            // => make sure this goes the async path
            this.widgetBus.requireReviewResources();
            await this.widgetBus.updateState(likeADraft);
        } catch (error) {
            this._reportError(`Loading state file "${file.name}"`, error);
        }
    }

    /**
     * Serialize the app state, reporting errors under label. Returns null
     * if serialization failed.
     */
    _serializeState(label) {
        const [errors, serializedValue] = serialize(this.getEntry("/"));
        if (errors.length) {
            const messages = [];
            for (const [path, error, ...more] of errors) {
                console.error(
                    new Error(`Serialize error at ./${path.join("/")}`, {
                        cause: error,
                    }),
                    ...more,
                );
                messages.push(
                    `${error.name}: ${error.message} at ./${path.join("/")}`,
                );
            }
            this._reportError(label, messages.join("\n"));
            return null;
        }
        return serializedValue;
    }

    async _onClickShareLink() {
        const serializedValue = this._serializeState("Creating share link");
        if (serializedValue === null) {
            return;
        }
        const window_ = this._domTool.window,
            url = new URL(window_.location.href),
            compressed = await compressStateForUrl(serializedValue);
        url.hash = `from-hash:${compressed}`;
        const href = url.href;
        try {
            await window_.navigator.clipboard.writeText(href);
        } catch (error) {
            this._reportError("Copying the share link", error);
            return;
        }
        window_.alert("The share link was copied to the clipboard.");
    }

    _onClickSaveState() {
        const serializedValue = this._serializeState("Saving state file");
        if (serializedValue === null) {
            return;
        }
        downloadFile(
            this._domTool.document,
            serializedValue,
            createStateFileName(this.getEntry("activeLayoutKey").value),
        );
    }

    /**
     * The manage fonts dialog is not part of the widget tree, hence it
     * can't depend on availableFonts by itself and is updated from here,
     * e.g. after a font was removed within the dialog.
     */
    update(compareResult) {
        super.update(compareResult);
        this._manageFontsDialog?.setFonts(
            this._getRemovableFonts(),
            this.getEntry("installedFonts").value,
        );
    }

    _getRemovableFonts() {
        return getRemovableFonts(this.getEntry("availableFonts"));
    }

    async _removeFonts(fontNames) {
        if (!fontNames.length) {
            return;
        }
        return this.widgetBus.changeState(async () => {
            const result = await this.widgetBus.removeFontsFromFiles(
                ...fontNames,
            );
            return { result, augmented: true };
        });
    }

    async _onClickManageFonts() {
        const dialog = new UIDialogManageFonts(
            this._domTool,
            this.widgetBus,
            (fontNames) => this._removeFonts(fontNames),
        );
        this._manageFontsDialog = dialog;
        try {
            return await dialog.show(
                this._getRemovableFonts(),
                this.getEntry("installedFonts").value,
            );
        } finally {
            this._manageFontsDialog = null;
            dialog.destroy();
        }
    }

    /**
     * Reset the document, i.e. activeState, to a primal (default) state.
     *
     * The remaining root entries are either dependencies (availableLayouts,
     * availableFonts, installedFonts) or links derived from the selections
     * (layoutTypeModel, font), hence replacing the wrapped activeState is
     * all it takes, and activeLayoutKey/activeFontKey persist untouched.
     */
    async _onClickResetToDefaults() {
        const message =
            "Reset to defaults?\n\n" +
            "This discards the current document. " +
            "The layout and font selections are kept.";
        if (!this._domTool.window.confirm(message)) {
            return;
        }
        // A layout controller can preserve a bit of its state across the
        // reset, e.g. the videoproof layout keeps the actor selection,
        // which is more of a layout mode than a document setting.
        const LayoutController = this._getActiveLayoutController(),
            capturedState = LayoutController?.captureStateForReset
                ? LayoutController.captureStateForReset(
                      this.getEntry("activeState"),
                  )
                : null;
        try {
            await this._changeState(() => {
                const activeState = this.getEntry("activeState");
                // Fonts used only by the discarded document become unused,
                // and without this we'd miss freeing them.
                this.widgetBus.requireReviewResources();
                activeState.wrapped = activeState.WrappedType.createPrimalDraft(
                    activeState.wrapped.dependencies,
                );
            });
            if (capturedState !== null) {
                // A separate change, as the structure to restore into is
                // created by the CoherenceFunctions of the reset above.
                await this._changeState(() => {
                    LayoutController.restoreStateAfterReset(
                        this.getEntry("activeState"),
                        capturedState,
                    );
                });
            }
        } catch (error) {
            this._reportError("Resetting to defaults", error);
        }
    }

    /**
     * The controller class of the currently active layout or null, if
     * the layouts are unknown to this menu.
     */
    _getActiveLayoutController() {
        const WrappedType = this.getEntry("activeState").WrappedType;
        for (const [, , Layout] of this._layouts) {
            if (Layout.Model === WrappedType) {
                return Layout.Controller;
            }
        }
        return null;
    }

    _reportError(label, error) {
        console.error(new Error(`${label} FAILED`, { cause: error }));
        this._domTool.window.alert(`${label} failed:\n${error}`);
    }

    /**
     * Close each menu that was not clicked itself. The toggler of a clicked
     * menu item handles that item on its own, thus e.g. opening the "Help"
     * menu closes the "File" menu.
     */
    _onClickDocument(event) {
        for (const id of this._menuItemIds) {
            // null when the widget is not created (yet).
            const menuItem = this.getWidgetById(id, null);
            if (!menuItem?.contains(event.target)) {
                menuItem.close();
            }
        }
    }
}
