import { _UIBaseList } from "../../basics.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { getStylePatchFullLabel } from "../../type-spec-models.mjs";

export class UICompositeStylePatchItem extends _UIBaseList.UIItem {
    static ROOT_CLASS = `ui-style_patch-composite-item`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static ITEM_DATA_TRANSFER_TYPE_PATH =
        DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH;

    // no need to mention 'value'
    static additionalDependencies = ["sourceMap"];
    update(changedMap) {
        const sourceMap = changedMap.has("sourceMap")
                ? changedMap.get("sourceMap")
                : this.getEntry("sourceMap"),
            value = changedMap.has("value")
                ? changedMap.get("value")
                : this.getEntry("value"),
            key = value.value,
            item = sourceMap.has(key) ? sourceMap.get(key) : null;
        let label;
        if (item !== null) {
            const typeKey = item.get("stylePatchTypeKey").value;
            label = getStylePatchFullLabel(typeKey);
        } else label = "[NULL]";
        this._output.textContent = `${key} – ${label}`;
    }
}
