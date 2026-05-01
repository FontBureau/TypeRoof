import { _UIBaseList, _UIBaseMap, _BaseComponent, _BaseContainerComponent } from "../../basics.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import {
    StylePatchModel,
    getStylePatchFullLabel,
    availableStylePatchTypes,
    validateStyleName,
    createStylePatch,
} from "../../type-spec-models.mjs";
import { FontSelect, } from "../../font-loading.mjs";
import {
    UITypeDrivenContainer,
    genericTypeToUIElement,
} from "../../type-driven-ui.mjs";
import { typeSpecGetDefaults } from "./defaults.mjs";
import {
    SPECIFIC,
    ProcessedPropertiesSystemMap,
} from "../../registered-properties-definitions.mjs";
import { ForeignKey, Path } from "../../../metamodel.mjs";
import { TYPESPEC_PPS_MAP } from "./pps-maps.mjs";
import { MapSelectButton, _BaseByPathContainerComponent } from "./shared.typeroof.jsx";
import { StaticTag, PlainSelectInput } from "../../generic.mjs";

// --- composite style patch chain ---

class UICompositeStylePatchItem extends _UIBaseList.UIItem {
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

/**
 * List of AxisLocationValue components.
 */
class UICompositeStylePatch extends _UIBaseList {
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

function getRequireUpdateDefaultsFn(updateDefaultsNames) {
    return (changedMap) =>
        Array.from(changedMap.keys()).some((name) =>
            updateDefaultsNames.has(name),
        );
}

/*
 * TODO: this is a very simple nice concept:
 * taking an dynamic type and building specific interfaces
 * for the specific type. This could also be done
 * in a parent, but like this it feels like it makes a clear
 * concept.
 * UIDocumentNode does the same, so the basics of these
 * two implemations should become class in basics.
 * _provisionWidgets/constructor and probably a
 * NOT IMPLEMENTED raising version of _createWrapperForType
 * Though, mapping of concrete type to it's interface(s) may also
 * become a configuration thing eventually.
 * Can this case be handled with type-driven-ui? It should probably.
 *
 * NOTE: UIAxesMathLocationsSumItem also implements this concept,
 * hence, maybe it could be a mixin-approach as UIAxesMathLocationsSumItem
 * already extends _UIBaseListContainerItem.
 */
export class UIStylePatch extends _BaseContainerComponent {
    constructor(widgetBus, zones /*, originTypeSpecPath*/) {
        super(widgetBus, zones);
        // this._originTypeSpecPath = originTypeSpecPath;
        this._currentTypeKey = null;
    }

    _createWrappersForType(typeKey) {
        const widgets = [],
            settings = {
                // document/nodes/{key}
                rootPath: this.widgetBus.rootPath.append("instance"),
                zone: "local",
            };
        let Constructor, dependencyMappings, args;
        if (typeKey === "SimpleStylePatch") {
            // need a handling for the font selection!
            widgets.push([
                { ...settings },
                [["/availableFonts", "options"], "activeFontKey"],
                FontSelect,
                true,
            ]);

            dependencyMappings = [];
            Constructor = UITypeDrivenContainer;

            const getLiveProperties = () => {
                    return null;
                },
                getDefaults = (ppsRecord, fieldName, modelDefaultValue) => {
                    if (ppsRecord.fullKey === `${SPECIFIC}font`) {
                        const activeFontKey = this.getEntry(
                            settings.rootPath.append("activeFontKey"),
                        );
                        if (activeFontKey.value !== ForeignKey.NULL) {
                            const installedFonts =
                                this.getEntry("/installedFonts");
                            return installedFonts.get(activeFontKey.value)
                                .value;
                        }
                    }
                    return typeSpecGetDefaults(
                        getLiveProperties,
                        ppsRecord,
                        fieldName,
                        modelDefaultValue,
                    );
                },
                removeItems = new Set([
                    // 'baseFontSize' // Maybe only use in paragraph context
                ]),
                PPS_MAP = new ProcessedPropertiesSystemMap(
                    Array.from(TYPESPEC_PPS_MAP.entries()).filter(
                        ([key]) => !removeItems.has(key),
                    ),
                ),
                updateDefaultsDependencies = [
                    [
                        `${this.widgetBus.rootPath.append("instance/activeFontKey")}`,
                        "activeFontKey",
                    ],
                ];
            args = [
                this._zones,
                {
                    // injectable
                    getDefaults,
                    updateDefaultsDependencies,
                    genericTypeToUIElement,
                    requireUpdateDefaults: getRequireUpdateDefaultsFn(
                        new Set(
                            updateDefaultsDependencies.map((item) =>
                                typeof item === "string" ? item : item.at(-1),
                            ),
                        ),
                    ),
                },
                PPS_MAP,
            ];
        } else if (typeKey === "CompositeStylePatch") {
            dependencyMappings = [
                ["./styles", "collection"],
                [this.widgetBus.getExternalName("sourceMap"), "sourceMap"],
            ];
            Constructor = UICompositeStylePatch;
            args = [this._zones];
        } else throw new Error(`KEY ERROR unknown typeKey ${typeKey}.`);

        widgets.push([settings, dependencyMappings, Constructor, ...args]);
        return widgets.map((widget) =>
            this._initWrapper(this._childrenWidgetBus, ...widget),
        );
    }

    _provisionWidgets(/* compareResult */) {
        const node = this.getEntry("."),
            typeKey = node.get("stylePatchTypeKey").value;
        if (this._currentTypeKey === typeKey) return new Set();
        this._currentTypeKey = typeKey;
        const newWrappers = this._createWrappersForType(typeKey),
            deleted = this._widgets.splice(0, Infinity, ...newWrappers);
        for (const wrapper of deleted) this._destroyWidget(wrapper);
        return super._provisionWidgets();
    }
}

export class StylePatchPropertiesManager extends _BaseByPathContainerComponent {
    constructor(widgetBus, _zones) {
        super(
            widgetBus,
            _zones,
            "ui_style_patch-properties_manager", // className
            "stylePatchPath", // pathEntryName
            "childrenOrderedMap", // childrenMapEntryName
            "stylePatchTypeKey", // typeKeyName=null
        );
    }

    _createEmptyWrappers() {
        const widgets = [
            [{ zone: "local" }, [], StaticTag, "span", {}, "(Select a Style)"],
        ];
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(stylePatchPath, item) {
        const TypeClass = item.constructor;
        if (TypeClass !== StylePatchModel)
            throw new Error(
                `TYPE ERROR expected StylePatchModel at path ${stylePatchPath} but instead got ${TypeClass.name}.`,
            );

        const typeKey = item.get(this._typeKeyName).value,
            label = getStylePatchFullLabel(typeKey),
            widgets = [
                [
                    {
                        zone: "local",
                    },
                    [],
                    StaticTag,
                    "h3",
                    {},
                    `Style: ${stylePatchPath.parts.at(-1)} – ${label}`,
                ],
                [
                    {
                        rootPath: stylePatchPath,
                        zone: "local",
                    },
                    [[this.widgetBus.rootPath.toString(), "sourceMap"]],
                    UIStylePatch,
                    this._zones,
                    stylePatchPath,
                ],
            ];
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}

// --- style patches map widget ---

class SimpleSelect extends _BaseComponent {
    constructor(widgetBus, label, items, changeHandler = null) {
        super(widgetBus);
        this._ui = new PlainSelectInput(
            this._domTool,
            changeHandler,
            label,
            items,
        );
        this._insertElement(this._ui.element);
    }
    get value() {
        return this._ui._input.value;
    }
}

export class UIStylePatchesMap extends _UIBaseMap {
    // jshint ignore: start
    static ROOT_CLASS = `ui_style_patches_map`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_ADD_BUTTON_LABEL = "add style";
    static KEY_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH;

    _validateKeyString(key) {
        const [valid, message] = super._validateKeyString(key);
        if (!valid) return [valid, message];
        return validateStyleName(key);
    }

    get _initialWidgets() {
        const items = Array.from(availableStylePatchTypes.keys()).map(
                (typeKey) => {
                    return [typeKey, getStylePatchFullLabel(typeKey)];
                },
            ),
            select = [
                { zone: "tools", id: "key-create-type-select" },
                [],
                SimpleSelect,
                null,
                items,
            ];
        const widgets = super._initialWidgets;
        widgets.splice(1, 0, select);
        return widgets;
    }
    // jshint ignore: end
    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            settings = {
                relativeRootPath: Path.fromParts(".", key),
                zone: keyId, // required to check if widgetWrapper.host === host
            },
            dependencyMappings = [
                ["./stylePatchTypeKey", "data"],
                [
                    this.widgetBus.getExternalName("stylePatchPath"),
                    "activePath",
                ],
            ],
            Constructor = MapSelectButton,
            args = [
                "button",
                { class: "ui_style_patches_map-item-value" },
                [["click", (/*event*/) => this._onClickHandler(key)]],
                () => "Edit",
            ];
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _onClickHandler(key) {
        this._changeState(() => {
            const path = Path.fromParts(".", key),
                selected = this.getEntry("stylePatchPath");
            // this is a toggle
            if (!selected.isEmpty && selected.value.equals(path))
                selected.clear();
            else selected.value = path;
        });
    }

    _createKeyValue(childrenOrderedMap) {
        const typeSelect = this.getWidgetById("key-create-type-select"),
            typeKey = typeSelect.value,
            value = createStylePatch(typeKey, childrenOrderedMap.dependencies);
        return value;
    }

    // If implemented called within a _changeState transaction,
    // with the new key as argument:
    // this._onItemCreated(key)
    _onItemCreated(key) {
        const path = Path.fromParts(".", key),
            selected = this.getEntry("stylePatchPath");
        // Only set if nothing is selected. a StylePatch is being
        // selected, it could be distracting to switch to the new
        // one, but if none is selected, it's probably the next step
        // to edit the newly created StylePatc;
        if (selected.isEmpty) selected.value = path;
    }
}
