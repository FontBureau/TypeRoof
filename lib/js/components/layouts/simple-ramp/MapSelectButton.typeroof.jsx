import { DynamicTag } from "../../generic.mjs";

export class MapSelectButton extends DynamicTag {
    constructor(widgetBus, tag, attr, eventListeners, ...restArgs) {
        super(widgetBus, tag, attr, ...restArgs);
        for (const eventListener of eventListeners)
            this.element.addEventListener(...eventListener);
    }

    _setActive(pathEntry) {
        let shouldBeActive = false;
        if (!pathEntry.isEmpty) {
            const myKey = this.widgetBus.rootPath.parts.at(-1), // .../{key}
                path = pathEntry.value,
                selectedKey = path.parts.at(-1); // ./key
            shouldBeActive = myKey === selectedKey;
        }
        this.element.classList[shouldBeActive ? "add" : "remove"]("active");
    }

    update(changedMap) {
        super.update(changedMap);
        if (changedMap.has("activePath")) {
            const pathEntry = changedMap.get("activePath");
            this._setActive(pathEntry);
        }

        if (changedMap.has("data"))
            this.element.textContent = this._formatter(
                changedMap.get("data").value,
            );
    }
}
