import { DynamicTag } from "../../generic.mjs";
import { identity } from "../../../util.mjs";
import { ForeignKey } from "../../../metamodel.mjs";

export class UIFontLabel extends DynamicTag {
    constructor(
        widgetBus,
        ppsRecord,
        tag,
        attr,
        formatter = identity,
        initialContent = "(initializing)",
    ) {
        super(widgetBus, tag, attr, formatter, initialContent);
        this._ppsRecord = ppsRecord;
    }
    update(changedMap) {
        if (changedMap.has("rootFont") || changedMap.has("properties@")) {
            const propertyValuesMap = (
                    changedMap.has("properties@")
                        ? changedMap.get("properties@")
                        : this.getEntry("properties@")
                ).typeSpecnion.getProperties(),
                font = propertyValuesMap.has(this._ppsRecord.fullKey)
                    ? propertyValuesMap.get(this._ppsRecord.fullKey)
                    : // rootFont can't be ForeignKey.NULL
                      this.getEntry("rootFont").value;
            const inherited = this.getEntry("font") === ForeignKey.NULL;
            this.element.textContent = this._formatter(font, inherited);
        }
    }
}
