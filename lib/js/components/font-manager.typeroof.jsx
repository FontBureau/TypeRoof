import { _BaseComponent } from "./basics.mjs";

const isIncludedFont = (data) => data[1].value.origin.type === "from-url";
const isLocalFont = (data) => data[1].value.origin.type === "from-file";

export class UIManageFonts extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this._createListItemButton = this._createListItemButton.bind(this);
        this._createListItem = this._createListItem.bind(this);
        this._createDeletableListItem =
            this._createDeletableListItem.bind(this);
        [this.element, this._includedList, this._localLabel, this._localList] =
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
            localLabel = <div>Local fonts</div>,
            localList = <ul class="fonts-manager-local"></ul>,
            element = (
                <div class="fonts-manager-list">
                    <div>Included fonts</div>
                    {includedList}
                    {localLabel}
                    {localList}
                </div>
            );

        this._insertElement(element);
        return [element, includedList, localLabel, localList];
    }

    _createListItemButton(key, font) {
        const h = this._domTool.h;
        const onClickButton = () => {
            this.widgetBus.changeState(() => {
                this.widgetBus.getEntry("activeFontKey").value = key;
            });
        };
        return (
            <button onClick={onClickButton}>
                {font.serializationNameParticles[0]}
                <br />
                <span class="version">
                    {font.serializationNameParticles[1]}
                </span>
            </button>
        );
    }

    _createListItem(data, activeFontKey, additionalChildren = null) {
        const h = this._domTool.h;
        const [key, { value: font }] = data;
        const attrs = key === activeFontKey ? { class: "selected" } : {};
        const button = this._createListItemButton(key, font);
        return (
            <li {...attrs}>
                {button}
                {additionalChildren ?? ""}
            </li>
        );
    }

    _createDeletableListItem(data, activeFontKey, installedFonts) {
        const h = this._domTool.h;

        const [, { value: font }] = data;
        const attrs = installedFonts?.some((f) => f[0] === font.fullName)
            ? {
                  disabled: true,
                  title: "This font is currently in use and cannot be deleted",
              }
            : {
                  onClick: () => this._removeFonts([font.fullName]),
                  title: "Delete font",
              };
        const deleteButton = (
            <button {...attrs}>
                <span class="material-symbols-outlined">delete</span>
            </button>
        );

        return this._createListItem(data, activeFontKey, deleteButton);
    }

    update(changedMap) {
        console.log("UIManageFonts.update", changedMap);
        const availableFonts = Array.from(this.getEntry("availableFonts"));
        const installedFonts = Array.from(this.getEntry("installedFonts"));
        const activeFontKey = this.getEntry("activeFontKey").value;

        const includedItems = availableFonts
            .filter(isIncludedFont)
            .map((data) => this._createListItem(data, activeFontKey));
        this._domTool.clear(this._includedList);
        this._includedList.append(...includedItems);

        const localItems = availableFonts
            .filter(isLocalFont)
            .map((data) =>
                this._createDeletableListItem(
                    data,
                    activeFontKey,
                    installedFonts,
                ),
            );
        this._domTool.clear(this._localList);
        this._localList.append(...localItems);

        this._localLabel.hidden = localItems.length === 0;

        // FIXME try to preserve scroll position when updating
        // FIXME order local fonts alphabetically
    }
}
