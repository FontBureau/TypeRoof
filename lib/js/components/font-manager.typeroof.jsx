import { _BaseComponent } from "./basics.mjs";

export class UIManageFonts extends _BaseComponent {
    static TEMPLATE = `
        <ul class="fonts-manager-list"></ul>
    `;

    constructor(widgetBus) {
        super(widgetBus);
        [this.element, this._list] = this._initTemplate();
    }

    async _removeFonts(fontNames) {
        if (!fontNames.length) return;
        return await this.widgetBus.changeState(async () => {
            return await this.widgetBus
                .removeFontsFromFiles(...fontNames)
                .then((result) => {
                    return { result, augmented: true };
                });
        });
    }

    _initTemplate() {
        const element = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ),
            list = element.querySelector(".fonts-manager-list");

        this._insertElement(element);
        return [element, list];
    }

    update(changedMap) {
        if (changedMap.has("availableFonts")) {
            const availableFonts = Array.from(changedMap.get("availableFonts"));
            const lis = availableFonts.map((item) => {
                const [key, { value: font }] = item;
                const button = this._domTool.createElement("button", null, [
                        font.serializationNameParticles[0],
                        this._domTool.createElement("br"),
                        this._domTool.createElement(
                            "span",
                            { class: "version" },
                            font.serializationNameParticles[1],
                        ),
                    ]),
                    deleteIcon = this._domTool.createElement(
                        "span",
                        {
                            class: "material-symbols-outlined",
                        },
                        "delete",
                    ),
                    deleteButton = this._domTool.createElement(
                        "button",
                        null,
                        deleteIcon,
                    ),
                    li = this._domTool.createElement(
                        "li",
                        {
                            "data-key": key,
                        },
                        [
                            button,
                            font.origin.type === "from-file"
                                ? deleteButton
                                : "",
                        ],
                    );
                button.addEventListener("click", () => {
                    this.widgetBus.changeState(() => {
                        this.widgetBus.getEntry("activeFontKey").value = key;
                    });
                });
                // FIXME removing a font works, but it's not triggering a state update
                deleteIcon.addEventListener("click", async () => {
                    await this._removeFonts([font.fullName]);
                });
                return li;
            });
            this._list.append(...lis);
        }

        if (changedMap.has("activeFontKey")) {
            const { value: activeFontValue } = this.getEntry("activeFontKey");
            const lis = this._list.querySelectorAll("li");
            lis.forEach((li) => {
                if (li.dataset.key === activeFontValue) {
                    li.classList.add("selected");
                } else {
                    li.classList.remove("selected");
                }
            });
        }
    }
}
