import { serialize } from "../metamodel.mjs";
import {
    _BaseComponent,
    _BaseContainerComponent,
} from "./basics/component.mjs";
import { StaticNode } from "./generic.mjs";
import {
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
    constructor(widgetBus) {
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
                    {manageFontsElement}
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

    _onClickSaveState() {
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
            this._reportError("Saving state file", messages.join("\n"));
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
        if (this._manageFontsDialog !== null) {
            this._manageFontsDialog.setFonts(this._getRemovableFonts());
        }
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
            return await dialog.show(this._getRemovableFonts());
        } finally {
            this._manageFontsDialog = null;
            dialog.destroy();
        }
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
            if (menuItem !== null && !menuItem.contains(event.target)) {
                menuItem.close();
            }
        }
    }
}
