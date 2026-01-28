import { _BaseComponent } from "./basics.mjs";

const isIncludedFont = (data) => data[1].value.origin.type === "from-url";
const isLocalFont = (data) => data[1].value.origin.type === "from-file";

export class UIManageFonts extends _BaseComponent {
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
        const h = this._domTool.h,
            includedList = <ul class="fonts-manager-included"></ul>,
            localList = <ul class="fonts-manager-local"></ul>,
            element = (
                <div class="fonts-manager-list">
                    <div>Included fonts</div>
                    {includedList}
                    <div>Your local fonts</div>
                    {localList}
                </div>
            );

        this._insertElement(element);
        return [element, includedList, localList];
    }

    createListItem(data) {
        const h = this._domTool.h,
            [key, { value: font }] = data,
            onClickButton = () => {
                this.widgetBus.changeState(() => {
                    this.widgetBus.getEntry("activeFontKey").value = key;
                });
            },
            onClickDelete = () => {
                this._removeFonts([font.fullName]);
            };
        return (
            <li data-key={key}>
                <button onClick={onClickButton}>
                    {font.serializationNameParticles[0]}
                    <br />
                    <span class="version">
                        {font.serializationNameParticles[1]}
                    </span>
                </button>
                {font.origin.type === "from-file" ? (
                    <button onClick={onClickDelete}>
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                ) : (
                    ""
                )}
            </li>
        );
        // FIXME removing a font works, but it's not triggering a state update
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
