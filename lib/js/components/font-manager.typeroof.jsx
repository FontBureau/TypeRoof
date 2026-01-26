import { _BaseComponent } from "./basics.mjs";

const isIncludedFont = (data) => data[1].value.origin.type === "from-url";
const isLocalFont = (data) => data[1].value.origin.type === "from-file";

export class UIManageFonts extends _BaseComponent {
    static TEMPLATE = `
        <div class="fonts-manager-list">
            <div>Included fonts</div>
            <ul class="fonts-manager-included"></ul>
            <div>Your local fonts</div>
            <ul class="fonts-manager-local"></ul>
        </div>
    `;

    constructor(widgetBus) {
        super(widgetBus);
        this.createListItem = this.createListItem.bind(this);
        [this.element, this._includedList, this._localList] =
            this._initTemplate();
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
            ).firstElementChild,
            includedList = element.querySelector(".fonts-manager-included"),
            localList = element.querySelector(".fonts-manager-local");

        this._insertElement(element);
        return [element, includedList, localList];
    }

    createListItem(data) {
        const [key, { value: font }] = data;
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
                [button, font.origin.type === "from-file" ? deleteButton : ""],
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
    }

    update(changedMap) {
        if (changedMap.has("availableFonts")) {
            const availableFonts = Array.from(changedMap.get("availableFonts"));
            const includedItems = availableFonts
                .filter(isIncludedFont)
                .map(this.createListItem);
            const localItems = availableFonts
                .filter(isLocalFont)
                .map(this.createListItem);
            this._includedList.append(...includedItems);
            this._localList.append(...localItems);
        }

        if (changedMap.has("activeFontKey")) {
            const { value: activeFontValue } = this.getEntry("activeFontKey");
            const lis = this.element.querySelectorAll("li");
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
