import {
    _BaseComponent,
    _BaseContainerComponent,
} from "../../basics/component.mjs";
import { _UIBaseMap, UINoInputProviderMapKey } from "../../basics/ui-map.mjs";
import { createIcon, createIconAndLabel } from "../../icons.mjs";
import { DATA_TRANSFER_TYPES } from "../../data-transfer-types.mjs";
import { Path } from "../../../metamodel.mjs";
import { TypeSpecModel } from "../../type-spec-models.mjs";
import { modelTreeSegmentsToLogicalLevelSegments } from "../../type-spec-paths.mjs";

import "./tree-editor.css";

// Renders the item label and marks the item active when it is the
// editingTypeSpec. The click handler is attached to this element, so
// clicks on nested children don't bubble into the selection handling.
class _UITypeSpecTreeItemLabel extends _BaseComponent {
    constructor(widgetBus, eventHandlers, treeConfig) {
        super(widgetBus);
        this._treeConfig = treeConfig;

        [this.element, this._label] = this._initTemplate(this._domTool.h);
        this._insertElement(this.element);
        for (const args of eventHandlers)
            this.element.addEventListener(...args);
    }

    _initTemplate(h) {
        const ownPath = this.widgetBus.rootPath.toRelative(
                this._treeConfig.typeSpecRootPath,
            ),
            path = `/${modelTreeSegmentsToLogicalLevelSegments(ownPath.parts).join("/")}`,
            element = (
                <button
                    class="ui_type_spec_tree-item-label"
                    type="button"
                    title={path}
                >
                    <span class="ui_type_spec_tree-item-label-edit">
                        {createIcon("edit")}
                    </span>
                    <span class="ui_type_spec_tree-item-label-edit_off">
                        {createIcon("edit_off")}
                    </span>
                    <span class="ui_type_spec_tree-item-label-text">
                        (uninitialized)
                    </span>
                </button>
            ),
            labelTextElement = element.querySelector(
                ".ui_type_spec_tree-item-label-text",
            );

        return [element, labelTextElement];
    }
    update(changedMap) {
        if (changedMap.has("label")) {
            const label = changedMap.get("label").value;
            this._label.textContent = label ? `${label}` : "(no label)";
        }
        if (changedMap.has("editingTypeSpec")) {
            const editingTypeSpec = changedMap.get("editingTypeSpec"),
                ownPath = this.widgetBus.rootPath.toRelative(
                    this._treeConfig.typeSpecRootPath,
                ),
                isActive =
                    !editingTypeSpec.isEmpty &&
                    editingTypeSpec.value.equals(ownPath);
            this.element.classList.toggle("active", isActive);
        }
    }
}

export class TypeSpecTreeItem extends _BaseContainerComponent {
    static ROOT_CLASS = "ui_type_spec_tree-item";

    constructor(widgetBus, zones, treeConfig) {
        super(widgetBus, zones);
        this._treeConfig = treeConfig;
        const widgets = [
            [
                { zone: widgetBus.wrapper.zone },
                [
                    ["./label", "label"],
                    [
                        this._treeConfig.editingTypeSpecPath.toString(),
                        "editingTypeSpec",
                    ],
                ],
                _UITypeSpecTreeItemLabel,
                [["click", this._onClickHandler.bind(this)]],
                this._treeConfig,
            ],
            // The recursion: a nested map editor for this item's children.
            [
                { zone: widgetBus.wrapper.zone },
                [["./children", "childrenOrderedMap"]],
                _ChildTypeSpecTreeEditor,
                this._zones,
                [], // eventHandlers
                null, // label
                true, // dragEntries
                true, // deletableEntries
                this._treeConfig,
            ],
        ];
        this._initWidgets(widgets);
    }

    // Called by our own widgetWrapper.reinsert(host) after it re-inserted
    // our (empty) insertedElements. Our children host directly on the
    // parent map's <li>, so re-point them at the new host as well.
    [_BaseContainerComponent.REINSERT_API]() {
        for (const widgetWrapper of this._widgets) {
            if (widgetWrapper.widget === null) continue;
            // widgetWrapper.host is the old <li>; our own wrapper's host
            // was already updated by reinsert(host) before this call.
            widgetWrapper.reinsert(this.widgetBus.wrapper.host);
        }
    }

    _onClickHandler(/*event*/) {
        this._changeState(() => {
            const editingTypeSpec = this.getEntry(
                    this._treeConfig.editingTypeSpecPath,
                ),
                ownPath = this.widgetBus.rootPath.toRelative(
                    this._treeConfig.typeSpecRootPath,
                );
            // this is a toggle
            if (
                !editingTypeSpec.isEmpty &&
                editingTypeSpec.value.equals(ownPath)
            )
                editingTypeSpec.clear();
            else editingTypeSpec.value = ownPath;
        });
    }
}

export class TypeSpecTreeEditor extends _UIBaseMap {
    static ROOT_CLASS = "ui_type_spec_tree_editor";
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH;
    static CREATE_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE;
    static KEY_ADD_BUTTON_LABEL = createIconAndLabel("add", "Add a TypeSpec");

    _generatedKeySuffix = "_typeSpec";

    constructor(
        widgetBus,
        _zones,
        eventHandlers,
        label = null,
        dragEntries = false,
        deletableEntries = false,
        // treeConfig: {
        //     editingTypeSpecPath: absolute Path of the editingTypeSpec entry
        //   , typeSpecRootPath: absolute Path of the root TypeSpecModel
        // }
        treeConfig = null,
    ) {
        super(
            widgetBus,
            _zones,
            eventHandlers,
            label,
            dragEntries,
            deletableEntries,
        );
        this._treeConfig = treeConfig;
        this._setStructuralDepth();
    }

    _setStructuralDepth() {
        const relPath = this.widgetBus.rootPath.toRelative(
            this._treeConfig.typeSpecRootPath,
        );
        // parts alternate: "children", key, "children", key, ...
        // one "children" segment per nesting level.
        const depth = relPath.parts.filter(
            (part) => part === "children",
        ).length;
        this.element.style.setProperty("--structural-depth", `${depth}`);
    }

    get _initialWidgets() {
        // By overwriting this getter, a sub-class can extend initialWidgets
        // within the constructor `super(...)` and fully use the `this` keyword.
        const widgets = [
            [
                { id: "key-create-input" },
                [],
                UINoInputProviderMapKey,
                () => {
                    const childrenOrderedMap =
                        this.getEntry("childrenOrderedMap");
                    return this._uniqueKey(childrenOrderedMap.keys());
                },
            ],
            [
                { zone: "tools", id: "key-add-button" },
                [],
                this.constructor.UIKeyAddButton,
                this.constructor.KEY_ADD_BUTTON_LABEL,
                [["click", this._keyCreateSubmitHandler.bind(this)]],
            ],
        ];
        return widgets;
    }

    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            childrenMapPath = Path.fromString(
                this.widgetBus.getExternalName("childrenOrderedMap"),
            ),
            settings = {
                rootPath: childrenMapPath.append(key),
                zone: keyId,
            },
            dependencyMappings = [],
            Constructor = TypeSpecTreeItem,
            args = [this._zones, this._treeConfig];
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _getDragTypeHandlers() {
        const handlers = super._getDragTypeHandlers();
        handlers.set(this.constructor.CREATE_DATA_TRANSFER_TYPE, [
            "_dropCreateHandler",
            "copy",
        ]);
        return handlers;
    }

    _dropCreateHandler(dropTargetItem, event, insertPosition, targetPath) {
        const typeKey = event.dataTransfer
            .getData(this.constructor.CREATE_DATA_TRANSFER_TYPE)
            .trim();
        return this._create(typeKey, targetPath, insertPosition);
    }

    _createItem(typeKey, dependencies) {
        if (typeKey !== "TypeSpec")
            throw new Error(
                `VALUE ERROR don't know how to create item for typeKey: "${typeKey}"`,
            );
        return TypeSpecModel.createPrimalDraft(dependencies);
    }

    // The item at dropTargetItem has a nested children map; when it is
    // empty, that map is a drop target itself (isEmptyLayerContainer),
    // so the before/after split point moves down (see
    // _UIBaseMap._getDropTargetInsertPosition).
    _isEmptyLayerItem(dropTargetItem) {
        // Resolve the key at event time (the _dropHandler pattern), the
        // captured dropTargetItem.key can be stale after key renames.
        const key = this.widgetBus.wrapper
                .getProtocolHandlerImplementation("key@")
                .getRegistered(dropTargetItem.keyId).value,
            item = this.getEntry("childrenOrderedMap").get(key);
        return item.get("children").size === 0;
    }

    _create(typeKey, targetPath, insertPosition) {
        return this._changeState(() => {
            const childrenOrderedMap = this.getEntry("childrenOrderedMap"),
                newItem = this._createItem(
                    typeKey,
                    childrenOrderedMap.dependencies,
                ),
                uniqueKey = this._uniqueKey(childrenOrderedMap.keys()),
                newEntry = [uniqueKey, newItem];
            if (insertPosition === "insert") {
                // "insert" case is intended to insert into empty layers only.
                // Only an empty childrenOrderedMap registers as a drop
                // target for "insert" (isEmptyLayerContainer).
                childrenOrderedMap.push(newEntry);
                this._onItemCreated(uniqueKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1),
                targetIndex = childrenOrderedMap.indexOfKey(targetKey);
            if (insertPosition === "after")
                childrenOrderedMap.arraySplice(targetIndex + 1, 0, newEntry);
            else if (insertPosition === "before")
                childrenOrderedMap.arraySplice(targetIndex, 0, newEntry);
            else
                throw new Error(
                    `NOT IMPLEMENTED insert position "${insertPosition}".`,
                );
            this._onItemCreated(uniqueKey);
        });
    }

    // Called by _create and _keyCreateSubmitHandler (via _UIBaseMap),
    // within a _changeState transaction. Select the new item, so its
    // properties can be edited right away.
    _onItemCreated(key) {
        const editingTypeSpec = this.getEntry(
                this._treeConfig.editingTypeSpecPath,
            ),
            childrenMapPath = Path.fromString(
                this.widgetBus.getExternalName("childrenOrderedMap"),
            ),
            newItemPath = childrenMapPath
                .append(key)
                .toRelative(this._treeConfig.typeSpecRootPath);
        editingTypeSpec.value = newItemPath;
    }
}

class _ChildTypeSpecTreeEditor extends TypeSpecTreeEditor {
    constructor(
        widgetBus,
        _zones,
        eventHandlers,
        label = null,
        dragEntries = false,
        deletableEntries = false,
        // treeConfig: {
        //     editingTypeSpecPath: absolute Path of the editingTypeSpec entry
        //   , typeSpecRootPath: absolute Path of the root TypeSpecModel
        // }
        treeConfig = null,
    ) {
        super(
            widgetBus,
            _zones,
            eventHandlers,
            label,
            dragEntries,
            deletableEntries,
            treeConfig,
        );
        this._hoistTools();
    }

    // We want to achieve a flat structure in the child, so it can be best
    // styled with `display: flex` This, and the REINSERT_API hooks manipulate
    // the DOM such that it behaves correctly. However, this is relatively
    // fragile, i.e. when the super-classes changes DOM-Structure this will
    // likely fall apart.
    _hoistTools() {
        this._domTool.insertBefore(
            this._zones.get("tools"),
            this._zones.get("local"),
        );
    }

    [_BaseContainerComponent.REINSERT_API]() {
        this._hoistTools();
    }

    // For UX ease of use only top-level gets an add-button;
    get _initialWidgets() {
        return [];
    }
}
