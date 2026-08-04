import { serialize } from "../metamodel.mjs";
import { _BaseContainerComponent } from "./basics/component.mjs";
import { GenericSelect, StaticNode } from "./generic.mjs";
import {
    createStateFileName,
    deserializeStateString,
    downloadFile,
} from "../utils/state-file.mjs";

export class AppMenu extends _BaseContainerComponent {
    static OPENED_CLASS = "opened";

    constructor(widgetBus, layoutGroups) {
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
            zones = new Map([["main", mainElement]]);
        widgetBus.insertElement(mainElement);

        const widgets = [
            [
                {
                    zone: "main",
                    id: "toggler",
                },
                [],
                StaticNode,
                <button onClick={() => this._onClickToggler()}>
                    <span class="material-symbols-outlined">menu</span>
                </button>,
            ],
            [
                {
                    zone: "main",
                    id: "menu",
                },
                [],
                StaticNode,
                <menu>
                    {loadStateElement}
                    {saveStateElement}
                    <hr />
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
            [{ zone: "main" }, [], StaticNode, <h1>TypeRoof</h1>],
            [
                { zone: "main" },
                [
                    ["availableLayouts", "options"],
                    ["activeLayoutKey", "value"],
                ],
                GenericSelect,
                "ui_layout_select", // baseClass
                "", // labelContent
                (key, availableLayout) => {
                    return availableLayout.get("label").value;
                }, // optionGetLabel
                [], //allowNull
                null, //onChangeFn
                (availableLayout) => {
                    // optionGetGroup
                    var groupKey = availableLayout.get("groupKey").value,
                        // => empty label should not be an actual group, just output directly into default/root?
                        // that way there's no difference in the UI between different groups when they have the
                        // empty label, also, no different ordering.
                        label = layoutGroups[groupKey].label || "",
                        index = layoutGroups[groupKey].index;
                    return [groupKey, label, index];
                },
            ],
        ];

        super(widgetBus, zones, widgets);

        this._mainElement = mainElement;
        this._stateFileInput = stateFileInput;
        document.addEventListener("click", this._onClickOutsideMenu.bind(this));
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

    _reportError(label, error) {
        console.error(new Error(`${label} FAILED`, { cause: error }));
        this._domTool.window.alert(`${label} failed:\n${error}`);
    }

    _onClickToggler() {
        const toggler = this.getWidgetById("toggler").node;
        const menu = this.getWidgetById("menu").node;
        const wasOpen = toggler.getAttribute("aria-expanded") === "true";
        const isOpen = !wasOpen;
        toggler.setAttribute("aria-expanded", isOpen);
        menu.setAttribute("aria-hidden", !isOpen);
        if (isOpen) {
            this._mainElement.classList.add(AppMenu.OPENED_CLASS);
        } else {
            this._mainElement.classList.remove(AppMenu.OPENED_CLASS);
        }
    }

    _onClickOutsideMenu(e) {
        const isOutside = !this._mainElement.contains(e.target);
        if (isOutside) {
            const toggler = this.getWidgetById("toggler").node;
            const menu = this.getWidgetById("menu").node;
            toggler.setAttribute("aria-expanded", false);
            menu.setAttribute("aria-hidden", true);
            this._mainElement.classList.remove(AppMenu.OPENED_CLASS);
        }
    }
}
