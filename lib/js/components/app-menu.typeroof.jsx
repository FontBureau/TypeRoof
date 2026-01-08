import { _BaseContainerComponent } from "./basics.mjs";
import { GenericSelect, StaticNode } from "./generic.mjs";
import { UIDialogManageState } from "./ui-dialog-manage-state.mjs";
import { UIDialogOpeners } from "./ui-dialog-openers.mjs";

export class AppMenu extends _BaseContainerComponent {
    static OPENED_CLASS = "opened";

    constructor(widgetBus, layoutGroups) {
        const h = widgetBus.domTool.h,
            mainElement = <div class="typeroof-app-menu"></div>,
            menuTopElement = <li class="menu-top"></li>,
            zones = new Map([
                ["main", mainElement],
                ["menu-top", menuTopElement],
            ]);
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
                    {menuTopElement}
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
            [
                { zone: "menu-top" },
                [],
                UIDialogOpeners,
                [[UIDialogManageState, "Load / Save..."]],
            ],
        ];

        super(widgetBus, zones, widgets);

        this._mainElement = mainElement;
        document.addEventListener("click", this._onClickOutsideMenu.bind(this));
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
