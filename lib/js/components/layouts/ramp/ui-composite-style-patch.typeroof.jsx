import { _UIBaseList } from "../../basics.mjs";
import { UICompositeStylePatchItem } from "./ui-composite-style-patch-item.typeroof.jsx";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { Path } from "../../../metamodel.mjs";

/**
 * List of AxisLocationValue components.
 */
export class UICompositeStylePatch extends _UIBaseList {
    static ROOT_CLASS = `ui-style_patch-composite`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static UIItem = UICompositeStylePatchItem; // extends _UIBaseList.UIItem
    static ITEM_DATA_TRANSFER_TYPE_PATH =
        DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH;
    // creates a link when dragged from UIStylePatchesMap
    static ITEM_DATA_TRANSFER_TYPE_CREATE =
        DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH;

    _createNewItem(targetPath, insertPosition, items, value) {
        const newItem = items.constructor.Model.createPrimalDraft(
                items.dependencies,
            ),
            path = Path.fromString(value);
        // value is an absolute path, but we are only interested in the
        // key of the style in the stylePatchesSource Map.
        newItem.value = path.parts.at(-1);
        return newItem;
    }
}
