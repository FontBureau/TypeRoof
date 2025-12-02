/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import { identity, zip } from "../../util.mjs";

import {
    _BaseComponent,
    _BaseContainerComponent,
    _CommonContainerComponent,
    _BaseDynamicCollectionContainerComponent,
    _BaseDynamicMapContainerComponent,
    HANDLE_CHANGED_AS_NEW,
    SimpleProtocolHandler,
    _UIBaseMap,
    _UIBaseList,
} from "../basics.mjs";

import {
    Collapsible,
    StaticTag,
    UILineOfTextInput,
    DynamicTag,
    PlainSelectInput,
    WasteBasketDropTarget,
    _BaseDropTarget,
    UICheckboxInput,
} from "../generic.mjs";

import { createIcon } from "../icons.mjs";

import {
    PathModelOrEmpty,
    Path,
    getEntry,
    FreezableSet,
    _AbstractSimpleOrEmptyModel,
    _AbstractListModel,
    CoherenceFunction,
    ForeignKey,
    topologicalSortKahn,
    FreezableMap,
    getFieldsByType,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    BooleanModel,
} from "../../metamodel.mjs";

import { _BaseLayoutModel } from "../main-model.mjs";

import {
    StylePatchesMapModel,
    StylePatchModel,
    TypeSpecModel,
    getStylePatchFullLabel,
    createStylePatch,
    validateStyleName,
    LeadingAlgorithmModel,
    deserializeLeadingAlgorithmModel,
    availableStylePatchTypes,
    deserializeManualMarginsModel,
} from "../type-spec-models.mjs";

import {
    runion_01_lineHeight,
    UINodeSpecToTypeSpecLinksMap,
} from "../type-spec-fundamentals.mjs";

import {
    ColorModel,
    getColorFromPropertyValuesMap,
    colorsGen,
    culoriToColor,
    enhanceContrast,
} from "../color.mjs";

import { DATA_TRANSFER_TYPES } from "../data-transfer-types.mjs";

import { SelectAndDragByOptions } from "./stage-and-actors.mjs";

import { UIshowProcessedProperties } from "../processed-properties.mjs";

import {
    genericTypeToUIElement,
    UITypeDrivenContainer,
} from "../type-driven-ui.mjs";

import {
    getRegisteredPropertySetup,
    isInheritingPropertyFn,
} from "../registered-properties.mjs";

import {
    COLOR,
    GENERIC,
    SPECIFIC,
    LEADING,
    OPENTYPE_FEATURES,
    LANGUAGE,
    getPropertiesBroomWagonGen,
    ProcessedPropertiesSystemMap,
} from "../registered-properties-definitions.mjs";

import {
    LanguageTagModel,
    createLanguageTag,
    setLanguageTag,
} from "../language-tags.typeroof.jsx";

import {
    actorApplyCSSColors,
    setTypographicPropertiesToSample,
} from "../actors/properties-util.mjs";

import { FontSelect } from "../font-loading.mjs";

import { UIOTFeaturesChooser } from "../ui-opentype-features.typeroof.jsx";
import DEFAULT_STATE from "../../../assets/typespec-ramp-initial-state.json" with { type: "json" };

import { schemaSpec as proseMirrorDefaultSchema } from "../prosemirror/default-schema";

import { chainCommands, createParagraphNear } from "prosemirror-commands";

import "prosemirror-view/style/prosemirror.css";

import {
    NodeSpecModel,
    NodeSpecToTypeSpecMapModel,
    ProseMirrorSchemaModel,
    NodeModel,
} from "../prosemirror/models.typeroof.jsx";

import { ProseMirror } from "../prosemirror/integration.typeroof.jsx";

import {
    getTypeSpecPropertiesIdMethod,
    UIDocumentUnkownStyleStyler,
    UIDocumentStyleStyler,
    UIDocumentTypeSpecStyler,
    UIProseMirrorMenu,
    TypeSpecSubscriptions,
} from "../prosemirror/type-spec.typeroof.jsx";

//  We can't create the self-reference directly
//, TypeSpecModelMap: TypeSpec.get('children') === _AbstractOrderedMapModel.createClass('TypeSpecModelMap', TypeSpec)
const TypeSpecRampModel = _BaseLayoutModel.createClass(
    "TypeSpecRampModel",
    // The root TypeSpec
    ["typeSpec", TypeSpecModel],
    ["editingTypeSpec", PathModelOrEmpty],
    // could potentially be a struct with some coherence logic etc.
    // for the actual data
    ["stylePatchesSource", StylePatchesMapModel],
    ["editingStylePatch", PathModelOrEmpty],
    ["proseMirrorSchema", ProseMirrorSchemaModel],
    ["editingNodeSpecPath", PathModelOrEmpty],
    ["nodeSpecToTypeSpec", NodeSpecToTypeSpecMapModel],
    // the root of all typeSpecs
    ["document", NodeModel],
    ["showParameters", BooleanModel],
    CoherenceFunction.create(
        [
            "document",
            "typeSpec",
            "stylePatchesSource",
            "proseMirrorSchema",
            "nodeSpecToTypeSpec",
        ],
        function initTypeSpec({
            typeSpec,
            document,
            stylePatchesSource,
            proseMirrorSchema,
            nodeSpecToTypeSpec,
        }) {
            // if typeSpec and document are empty
            if (
                document.get("content").size === 0 &&
                typeSpec.get("children").size === 0 &&
                stylePatchesSource.size === 0
            ) {
                for (const [Model, target, data] of [
                    [NodeModel, document, DEFAULT_STATE.document],
                    [TypeSpecModel, typeSpec, DEFAULT_STATE.typeSpec],
                    [
                        StylePatchesMapModel,
                        stylePatchesSource,
                        DEFAULT_STATE.stylePatchesSource,
                    ],
                    [
                        ProseMirrorSchemaModel,
                        proseMirrorSchema,
                        DEFAULT_STATE.proseMirrorSchema,
                    ],
                    [
                        NodeSpecToTypeSpecMapModel,
                        nodeSpecToTypeSpec,
                        DEFAULT_STATE.nodeSpecToTypeSpec,
                    ],
                ]) {
                    const serializeOptions = Object.assign(
                            {},
                            SERIALIZE_OPTIONS,
                            {
                                format: SERIALIZE_FORMAT_OBJECT,
                            },
                        ),
                        newItem = deserializeSync(
                            Model,
                            target.dependencies,
                            data,
                            serializeOptions,
                        );
                    for (const [key, enrty] of newItem.entries())
                        target.set(key, enrty);
                }
            }
        },
    ),
);

function _uniqueKey(keys) {
    const keysSet = new Set(keys),
        numericKeys = new Set();
    let highest = null;
    for (const key of keysSet) {
        const num = parseFloat(key);
        if (!isFinite(num)) continue;
        if (numericKeys.has(num)) continue;
        numericKeys.add(num);
        if (highest === null || num > highest) highest = num;
    }
    let keyNum = highest === null ? 0 : Math.ceil(highest),
        newKey = `${keyNum}`;
    while (keysSet.has(newKey)) {
        // will in each iteration at least add 1
        do {
            keyNum += 1;
        } while (numericKeys.has(keyNum));
        newKey = `${keyNum}`;
    }
    return newKey;
}

/**
 * used to be StageManager in stages-and-actors, but this is intended to
 * become more generally useful/shareable
 * There are differences also in the data models:
 *    TypeSpec.children is an OrderedMap
 *    activeActors: ActorsModel is a List
 * The type of the children is totally different.
 */
class _BaseTreeEditor extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="tree_editor stage-manager_actors">(initial)</div>`;
    // jshint ignore:end
    constructor(widgetBus, dataTransferTypes) {
        super(widgetBus);
        this._dataTransferTypes = Object.freeze(
            Object.assign({}, dataTransferTypes),
        );
        this._itemElements = new Map(/* Path: element*/);
        this._activePaths = new Set();
        this._removeDragIndicatorTimeoutId = null;
        [this.element, this._actorsElement] = this.initTemplate();
    }

    _onClickHandler(path) {
        this._changeState(() => {
            // this is a toggle
            const editingActor = this.getEntry("editingActor");
            if (!editingActor.isEmpty && editingActor.value.equals(path))
                editingActor.clear();
            else editingActor.value = path;
        });
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(
                this.constructor.TEMPLATE,
            ),
            element = frag.firstElementChild,
            actors = frag.querySelector(".stage-manager_actors");
        this._insertElement(element);
        actors.addEventListener("dragleave", this._dragleaveHandler.bind(this));
        return [element, actors];
    }

    get DATA_TRANSFER_TYPES() {
        return this._dataTransferTypes;
    }

    _dragstartHandler({ path }, event) {
        // From https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types
        //      "It is important to set the data in the right order, from most-specific to least-specific."
        const type = this.DATA_TRANSFER_TYPES.PATH;
        event.dataTransfer.setData(type, `${path}`);
        event.dataTransfer.setData("text/plain", `[TypeRoof ${type}: ${path}]`);

        event.currentTarget.classList.add("dragging");
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = "all";
        event.dataTransfer.setDragImage(
            event.currentTarget.parentElement,
            0,
            0,
        );
    }

    _dragendHandler(item /*{path}*/, event) {
        event.currentTarget.classList.remove("dragging");
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [
            this.DATA_TRANSFER_TYPES.PATH,
            this.DATA_TRANSFER_TYPES.CREATE,
        ];
        for (const type of applicableTypes) {
            if (event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    _dragoverHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;
        // Don't use event.dataTransfer.getData(this.DATA_TRANSFER_TYPES.PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(this.DATA_TRANSFER_TYPES.APATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!

        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect =
            type === this.DATA_TRANSFER_TYPES.PATH ? "move" : "copy"; // this.DATA_TRANSFER_TYPES.CREATE
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;
        event.dataTransfer.dropEffect =
            type === this.DATA_TRANSFER_TYPES.PATH ? "move" : "copy"; // this.DATA_TRANSFER_TYPES.CREATE
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _getDropTargetInsertPosition(item, event) {
        if (item.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return "insert";
        const { height, top } = event.currentTarget.getBoundingClientRect(),
            { clientY } = event,
            elementY = clientY - top,
            relativeY = elementY / height,
            testPosition = item.isEmptyLayerItem
                ? // Move this line below the empty layer container <ol> active
                  // zone, such that we don't get undecided flickering between
                  // the empty container zone and the item above: the <li> that
                  // contains the empty children <ol>.
                  0.8
                : 0.5;
        return relativeY < testPosition ? "before" : "after";
    }

    _setDropTargetIndicator(element, insertPosition = null) {
        if (this._removeDragIndicatorTimeoutId !== null) {
            const { clearTimeout } = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = "drop_target_indicator-",
            markedClass = `${classPrefix}marked`;
        for (const elem of this._actorsElement.querySelectorAll(
            `.${markedClass}`,
        )) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for (const name of [...elem.classList]) {
                if (name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if (insertPosition === null) return;

        if (!["before", "after", "insert"].includes(insertPosition))
            throw new Error(
                `NOT IMPLEMENTED ${this} insert position "${insertPosition}".`,
            );
        // return;

        const [elem, posClassSuffix] =
            insertPosition === "before" && element.previousSibling
                ? [element.previousSibling, "after"]
                : [element, insertPosition];
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if (!this._takeDragEventOrLeaveIt(event)[0]) return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const { setTimeout } = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(
            this._setDropTargetIndicator.bind(this, event.currentTarget),
            100,
        );
    }

    _dropHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;

        this._setDropTargetIndicator(event.currentTarget);

        const { path } = item,
            rootPath = Path.fromString(
                this.widgetBus.getExternalName("activeActors"),
            ),
            targetPath = rootPath.append(...path),
            insertPosition = this._getDropTargetInsertPosition(item, event);
        if (type === this.DATA_TRANSFER_TYPES.PATH) {
            const relativeSourcePath = event.dataTransfer.getData(
                    this.DATA_TRANSFER_TYPES.PATH,
                ),
                sourcePath = rootPath.appendString(relativeSourcePath);
            return this._move(sourcePath, targetPath, insertPosition);
        } else if (type === this.DATA_TRANSFER_TYPES.CREATE) {
            const typeKey = event.dataTransfer.getData(
                this.DATA_TRANSFER_TYPES.CREATE,
            );
            return this._create(typeKey, targetPath, insertPosition);
        }
    }

    _create(typeKey, targetPath, insertPosition) {
        // console.log(`${this}._create typeKey: ${typeKey} targetPath ${targetPath} insertPosition: ${insertPosition}`);
        return this._changeState(() => {
            const activeActors =
                    insertPosition === "insert"
                        ? this.getEntry(targetPath)
                        : this.getEntry(targetPath.parent), // is an 'ActorsModel' ('activeActors')
                // Ensure we take the dependencies for the create from the
                // correct element, even though, at the moment, the dependencies
                // are all identical, it may change at some point.
                newActor = this._createItem(typeKey, activeActors.dependencies),
                uniqueKey = _uniqueKey(activeActors.keys()),
                newEntry = [uniqueKey, newActor];
            if (insertPosition === "insert") {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // targetParent === sourceParent and the targetKey could
                // change is circumvented.

                // NOTE: as an ordered dict, this requires a new unique key
                // a list doesn't require that at all!
                activeActors.push(newEntry);
                return;
            }
            const targetKey = targetPath.parts.at(-1),
                targetIndex = activeActors.indexOfKey(targetKey);
            if (insertPosition === "after")
                activeActors.arraySplice(targetIndex + 1, 0, newEntry);
            else if (insertPosition === "before")
                activeActors.arraySplice(targetIndex, 0, newEntry);
            else
                throw new Error(
                    `NOT IMPLEMENTED insert position "${insertPosition}".`,
                );
        });
    }

    // FIXME: especially in move reference may require updating
    //        however, with a Map as container the situation should
    //        be much more stable.
    _move(sourcePath, targetPath, insertPosition) {
        // console.log(`${this}._move sourcePath: ${sourcePath} targetPath ${targetPath}`);
        const canMove = !sourcePath.isRootOf(targetPath);
        if (!canMove) {
            console.warn(
                `${this}._move can't move source into target as source path "${sourcePath}" is root of target path "${targetPath}".`,
            );
            return;
        }

        return this._changeState(() => {
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const activeActors =
                    insertPosition === "insert"
                        ? this.getEntry(targetPath)
                        : this.getEntry(targetPath.parent), // is an 'ActorsModel' ('activeActors')
                sourceParent = this.getEntry(sourcePath.parent),
                sourceKey = sourcePath.parts.at(-1),
                source = sourceParent.get(sourceKey),
                newEntry = [null, source];
            if (insertPosition === "insert") {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                // We may preserve the old key if it is free.
                const uniqueKey = activeActors.has(sourceKey)
                    ? _uniqueKey(activeActors.keys())
                    : sourceKey;
                newEntry[0] = uniqueKey;
                activeActors.push(newEntry);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1),
                targetIndex = activeActors.indexOfKey(targetKey),
                sourceIndex = sourceParent.indexOfKey(sourceKey);
            if (activeActors === sourceParent) {
                if (sourceIndex === targetIndex) return; // nothing to do
                let insertIndex;
                if (insertPosition === "after") insertIndex = targetIndex + 1;
                else if (insertPosition === "before") insertIndex = targetIndex;
                else
                    throw new Error(
                        `NOT IMPLEMENTED ${this} insert position "${insertPosition}".`,
                    );

                if (sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                // In this case, key must be stable!
                // This keeps all references to this path stable.
                // I.e. when moved within in the same parent
                newEntry[0] = sourceKey;
                sourceParent.delete(sourceKey);
                activeActors.arraySplice(insertIndex, 0, newEntry);
                return;
            }
            // We may preserve the old key if it is free.
            const uniqueKey = activeActors.has(sourceKey)
                ? _uniqueKey(activeActors.keys())
                : sourceKey;
            newEntry[0] = uniqueKey;
            sourceParent.delete(sourceKey);
            if (insertPosition === "after")
                activeActors.arraySplice(targetIndex + 1, 0, newEntry);
            else if (insertPosition === "before")
                activeActors.arraySplice(targetIndex, 0, newEntry);
            else
                throw new Error(
                    `NOT IMPLEMENTED insert position "${insertPosition}".`,
                );
        });
    }

    _renderLayer(path, activeActors, state = null) {
        const container = this._domTool.createElement("ol");
        if (activeActors.size === 0) {
            // empty container
            const item = {
                path,
                isEmptyLayerContainer: true,
                isEmptyLayerItem: false,
            };
            container.addEventListener(
                "dragenter",
                this._dragenterHandler.bind(this, item),
            );
            container.addEventListener(
                "dragover",
                this._dragoverHandler.bind(this, item),
            );
            container.addEventListener(
                "drop",
                this._dropHandler.bind(this, item),
            );
        } // else: see for ...
        for (const [key, actor] of activeActors) {
            const itemElement = this._domTool.createElement("li"),
                itemPath = path.append(key),
                dragHandleElement = this._domTool.createElement(
                    "span",
                    { class: "drag_handle" },
                    createIcon("drag_pan"),
                ),
                // used to check:  isLayerItem = getEntry(actor , Path.fromParts('actorTypeModel', 'typeClass')).value === LayerActorModel
                isContainerItem = this._isContainerItem(actor),
                isEmptyLayerItem = isContainerItem
                    ? getEntry(actor, this._containerRelPathToChildren).size ===
                      0
                    : false,
                item = {
                    path: itemPath,
                    isEmptyLayerContainer: false,
                    isEmptyLayerItem,
                };
            if (state) {
                itemElement.classList.add(
                    state.counter % 2 ? "even-row" : "odd-row",
                );
                itemElement.style.setProperty(
                    "--structural-depth",
                    `${state.depth}`,
                );
                state.counter += 1;
            }

            dragHandleElement.setAttribute("draggable", "true");
            dragHandleElement.addEventListener(
                "dragstart",
                this._dragstartHandler.bind(this, item),
            );
            dragHandleElement.addEventListener(
                "dragend",
                this._dragendHandler.bind(this, item),
            );

            itemElement.addEventListener(
                "dragenter",
                this._dragenterHandler.bind(this, item),
            );
            itemElement.addEventListener(
                "dragover",
                this._dragoverHandler.bind(this, item),
            );
            itemElement.addEventListener(
                "drop",
                this._dropHandler.bind(this, item),
            );

            itemElement.append(
                dragHandleElement,
                ...this._renderActor(itemPath, actor, state),
            );
            container.append(itemElement);
            this._itemElements.set(itemPath.toString(), itemElement);
        }
        return [container];
    }

    _renderActor(path, actor, state = null) {
        const fragment = this._domTool.createFragmentFromHTML(
                `<button><span></span> <em></em></button>`,
            ),
            result = [...fragment.childNodes],
            button = fragment.querySelector("button");
        button.addEventListener("click", this._onClickHandler.bind(this, path));
        fragment.querySelector("span").textContent = this._getItemLabel(actor);
        button.setAttribute("title", `local path: ${path}`);
        if (this._isContainerItem(actor)) {
            // used to be if(typeClass === LayerActorModel) {
            const activeActorsPath = this._containerRelPathToChildren,
                activeActors = getEntry(actor, activeActorsPath),
                childrenPath = path.append(...activeActorsPath);
            if (state) state.depth += 1;
            result.push(
                ...this._renderLayer(childrenPath, activeActors, state),
            );
            if (state) state.depth -= 1;
        }
        return result;
    }

    _markActiveItems(...pathsToActivate) {
        for (const activePathStr of this._activePaths) {
            this._itemElements.get(activePathStr).classList.remove("active");
        }
        this._activePaths.clear();
        for (const activePath of pathsToActivate) {
            const activePathStr = activePath.toString();
            if (!this._itemElements.has(activePathStr)) {
                // FIXME: need to figure out.
                // deserializeing four-panels-wip-0004_slides_as_layers.txt
                // triggers this. It's not critical though.
                console.error(
                    `${this}._markActiveItems not found path "${activePathStr}" ` +
                        `in elements: ${Array.from(this._itemElements.keys()).join(", ")}`,
                );
                continue;
            }
            this._activePaths.add(activePathStr);
            this._itemElements.get(activePathStr).classList.add("active");
        }
    }

    update(changedMap) {
        const editingActor = changedMap.has("editingActor")
            ? changedMap.get("editingActor")
            : this.getEntry("editingActor");
        if (changedMap.has("activeActors")) {
            const activeActors = changedMap.get("activeActors"),
                basePath = Path.fromParts("./");
            this._domTool.clear(this._actorsElement);
            this._actorsElement.append(
                ...this._renderLayer(basePath, activeActors, {
                    counter: 0,
                    depth: 0,
                }),
            );
            if (!editingActor.isEmpty)
                this._markActiveItems(editingActor.value);
        } else if (changedMap.has("editingActor")) {
            this._markActiveItems(
                ...(editingActor.isEmpty ? [] : [editingActor.value]),
            );
        }
    }

    _isContainerItem(/*item*/) {
        //return getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE;
        throw new Error(`NOT IMPLEMENTED ${this}._isContainerItem`);
    }

    _createItem(typeKey /*, dependencies*/) {
        throw new Error(
            `NOT IMPLEMENTED ${this}._createItem (for ${typeKey}).`,
        );
    }
    _getContainerRelPathToChildren() {
        // return Path.fromParts('instance', 'activeActors');
        throw new Error(
            `NOT IMPLEMENTED ${this}._getContainerRelPathToChildren`,
        );
    }

    get _containerRelPathToChildren() {
        return this._getContainerRelPathToChildren();
    }

    _getItemLabel(/*item*/) {
        throw new Error(`NOT IMPLEMENTED ${this}._getItemLabel`);
    }
}

class TypeSpecTreeEditor extends _BaseTreeEditor {
    _isContainerItem(item) {
        //return getActorTreeNodeType(actor) === getActorTreeNodeType.CONTAINER_NODE_TYPE;
        return item instanceof TypeSpecModel;
    }
    _getContainerRelPathToChildren() {
        // return Path.fromParts('instance', 'activeActors');
        return Path.fromParts("children");
    }
    _getItemLabel(item) {
        // const actorTypeModel = actor.get('actorTypeModel')
        //   , typeLabel = actorTypeModel.get('label').value
        //   , actorLabel = actor.get('instance').get('label').value
        //   ;
        // //  , typeClass = actorTypeModel.get('typeClass').value
        // return actorLabel ? `${typeLabel}: ${actorLabel}` : typeLabel;
        const typeLabel = "TypeSpec",
            itemLabel = item.get("label").value;
        return itemLabel ? `${typeLabel}: ${itemLabel}` : typeLabel;
    }

    _createItem(typeKey, dependencies) {
        if (typeKey !== "TypeSpec")
            throw new Error(
                `VALUE ERROR don't know how to create item for typeKey: "${typeKey}"`,
            );
        return TypeSpecModel.createPrimalDraft(dependencies);
    }
}

class UIFontLabel extends DynamicTag {
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

// FIXME: put this rather into the UITypeDrivenContainer
// so we can make a complete mapping if all values that require it and
// then filter where the filter is required!
const _excludesTypeSpecPPSMap = new Set([
    "children", // => Controlled globally by TreeEditor
    "label", // => This has a control for label.
    "autoOPSZ", // => UIManualAxesLocations has a control for autoOPSZ.
]);
function getTypeSpecPPSMap(parentPPSRecord, Model) {
    const entries = [];
    for (const [modelFieldName, modelFieldType] of Model.fields.entries()) {
        let prefix = GENERIC,
            fullKey = null,
            registryKey = null;
        // This case is not used, it's a stub, left over from another
        // similar function and put into the parentPPSRecord condition
        // which is currently called nowhere. But the goal is to find
        // a general form for this kind of function.
        if (parentPPSRecord)
            fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        if (_excludesTypeSpecPPSMap.has(modelFieldName)) prefix = null;
        else if (modelFieldType === ColorModel) prefix = COLOR;
        else if (modelFieldType === LeadingAlgorithmModel) prefix = LEADING;
        else if (modelFieldType === LanguageTagModel) prefix = LANGUAGE;
        else if (modelFieldName === "axesLocations")
            // we should use a symbol here!
            prefix = "axesLocations/";
        else if (modelFieldName === "stylePatches") prefix = "stylePatches/";
        else if (modelFieldName === "openTypeFeatures")
            prefix = OPENTYPE_FEATURES;

        if (prefix === null)
            // don't make a UI for this
            continue;

        const entry = [
            modelFieldName,
            ProcessedPropertiesSystemMap.createSimpleRecord(
                prefix,
                modelFieldName,
                fullKey,
                registryKey,
            ),
        ];
        entries.push(entry);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}

/**
 * Not how most of the Type -> prefix mappings don't apply to
 * NodeSpec. This method could be much simpler, however, for a general
 * solution, it doesn't hurt to have these cases covered.
 */
const _excludesNodeSpecPPSMap = new Set([
    //  an AttributeSpecMapModel: there's yet no UI and no concept to hand edit this
    "attrs",
]);
function getNodeSpecPPSMap(parentPPSRecord, Model) {
    const entries = [];
    for (const [modelFieldName, modelFieldType] of Model.fields.entries()) {
        let prefix = GENERIC,
            fullKey = null,
            registryKey = null;
        // This case is not used, it's a stub, left over from another
        // similar function and put into the parentPPSRecord condition
        // which is currently called nowhere. But the goal is to find
        // a general form for this kind of function.
        if (parentPPSRecord)
            fullKey = `${parentPPSRecord.propertyRoot}${modelFieldName}`;
        if (_excludesNodeSpecPPSMap.has(modelFieldName)) prefix = null;
        else if (modelFieldType === ColorModel) prefix = COLOR;
        else if (modelFieldType === LeadingAlgorithmModel) prefix = LEADING;
        else if (modelFieldType === LanguageTagModel) prefix = LANGUAGE;
        else if (modelFieldName === "axesLocations")
            // we should use a symbol here!
            prefix = "axesLocations/";
        else if (modelFieldName === "stylePatches") prefix = "stylePatches/";
        else if (modelFieldName === "openTypeFeatures")
            prefix = OPENTYPE_FEATURES;

        if (prefix === null)
            // don't make a UI for this
            continue;

        const entry = [
            modelFieldName,
            ProcessedPropertiesSystemMap.createSimpleRecord(
                prefix,
                modelFieldName,
                fullKey,
                registryKey,
            ),
        ];
        entries.push(entry);
    }
    return Object.freeze(new ProcessedPropertiesSystemMap(entries));
}

const TYPESPEC_PPS_MAP = getTypeSpecPPSMap(null, TypeSpecModel),
    NODESPEC_PPS_MAP = getNodeSpecPPSMap(null, NodeSpecModel);
// This is partially responsible to organize the inherited values as
// is is responsible to organize the default/fallback values.
// In both cases the current layer/modelInstance doesn't define the
// property itself. The difference is that  with inheritance, the
// value is defined in a parent and with defaults there's no user
// made value definition, but we still need to have some value.
//
// The plan is to create a bottom most model instance that is
// prepared with all the default values, so that there's no case
// without inheritance ever. It must be noted, that some values
// do not inherit, it's a configurable behavior and it would fail
// in that case!
//
// I have a hard time to figure out the best approach to inject
// default values. The case of non-inherited properties is a real
// use case, which makes it more complicated. It applies to x/y values
// that if applied to the layer/container must not be applied to the
// children directly, as the container already has moved by the amount.
// The EM would be a good example as well, as for a child it should always
// reset to 1, otherwise the font-size would get bigger/smaller for each
// added child element. Depending on the exact kind of elements,
// background-color is also a value that doesn't inherit well.
//
// This means we need a specific approach to default values in any
// case and can't rely on the inheritance mechanism, in the cases where
// inhertiance is turned off.

const _NOTDEF = Symbol("_NOTDEF");

// If defaultVal === _NOTDEF and fullKey is not found
// this will raise.
function _getFallback(fullKey, modelDefaultValue = _NOTDEF) {
    const fallback = getRegisteredPropertySetup(
        fullKey,
        modelDefaultValue === _NOTDEF
            ? getRegisteredPropertySetup.NOTDEF
            : modelDefaultValue,
    );
    return fallback === modelDefaultValue
        ? modelDefaultValue
        : fallback.default;
}

function typeSpecGetDefaults(
    getLiveProperties,
    ppsRecord,
    fieldName,
    /*BaseModelType.*/ modelDefaultValue = _NOTDEF,
) {
    const { fullKey } = ppsRecord,
        // When this is the root typeSpec we get a KEY ERROR:
        //    via VideoproofController constructor initial resources:
        //    Error: KEY ERROR not found identifier "typeSpecProperties@"
        //    in [ProtocolHandler typeSpecProperties@]:
        //    typeSpecProperties@/activeState/typeSpec.
        // FIXME: We should rather get the own typeSpecProperties@ and then
        // see if it defines itself a parent. Better then hard-coding the
        // parent path in here.

        // null or the liveProperties instance
        liveProperties = getLiveProperties(),
        propertyValues =
            liveProperties !== null
                ? liveProperties.typeSpecnion.getProperties()
                : new Map();
    // console.log(`typeSpecGetDefaults ${ppsRecord} fieldName: ${fieldName} modelDefaultValue`, modelDefaultValue
    //     , '\n   typeSpecPropertiesKey:', typeSpecPropertiesKey
    //     , '\n   propertyValues:', propertyValues
    //     );
    // FIXME: it's interesting that we so not use the liveProperties
    // in comparable functions in stage-and-actors, however,
    // this here seems to behave fine.
    if (ppsRecord.prefix === COLOR) {
        const [color] = getColorFromPropertyValuesMap(fullKey, propertyValues, [
            null,
        ]);
        if (color !== null) return color;
        return _getFallback(fullKey, modelDefaultValue);
    }
    // These requests come via UIManualAxisLocations:
    else if (
        ppsRecord.prefix === "axesLocations/" ||
        ppsRecord.prefix === OPENTYPE_FEATURES ||
        ppsRecord.prefix === LANGUAGE
    ) {
        // 'axesLocations/'. 'YTFI', '738'
        // 'opentype-feature/'. 'kern', false
        const key = `${ppsRecord.prefix}${fieldName}`,
            result = propertyValues.has(key)
                ? propertyValues.get(key)
                : modelDefaultValue;
        if (result === _NOTDEF)
            throw new Error(
                `KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`,
            );
        return result;
    } else if (ppsRecord.prefix === SPECIFIC) {
        // Introducing 'SPECIFIC', which in contrast to
        // GENERIC requires modelDefaultValue and cannot
        // be acquired via getRegisteredPropertySetup
        // FIXME: we don't use this case far anyymore!!! (we use the SPECIFIC prefix though)
        const result = propertyValues.has(fullKey)
            ? propertyValues.get(fullKey)
            : modelDefaultValue;
        if (result === _NOTDEF)
            throw new Error(
                `KEY ERROR typeSpecGetDefaults: not found "${fullKey}".`,
            );
        return result;
    } else {
        if (propertyValues.has(fullKey)) return propertyValues.get(fullKey);
        return _getFallback(fullKey, modelDefaultValue);
    }
}

function getRequireUpdateDefaultsFn(updateDefaultsNames) {
    return (changedMap) =>
        Array.from(changedMap.keys()).some((name) =>
            updateDefaultsNames.has(name),
        );
}

/**
 * Here's a good lesson, compared to typeSpecGetDefaults this is trivial,
 * because we don't have liveProperties
 */
function nodeSpecGetDefaults(
    ppsRecord,
    fieldName,
    /*BaseModelType.*/ modelDefaultValue = _NOTDEF,
) {
    const { fullKey } = ppsRecord;
    return _getFallback(fullKey, modelDefaultValue);
}

class TypeSpecPropertiesManager extends _CommonContainerComponent {
    // jshint ignore:start
    /**
     * could be as well:
     * initialUpdate(...args){
     *     return _BaseDynamicCollectionContainerComponent.prototype.initialUpdate.call(this, ...args);
     * }
     */
    initialUpdate =
        _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    // jshint ignore:end
    constructor(widgetBus, zones) {
        // provision widgets dynamically!
        super(widgetBus, zones);
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.widgetBus.getExternalName("typeSpecPath"));
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName("typeSpecPath"));
        return dependencies;
    }

    _createTypeSpecWrappers(typeSpecPath, rootTypeSpecPath) {
        const TypeClass = this.widgetBus.getEntry(typeSpecPath).constructor;
        if (TypeClass !== TypeSpecModel)
            // NOTE: The uses of TYPESPEC_PPS_MAP kind of binds this to
            // that Type. But this check is not strictly required, it's
            // a sanity check to confirm an assumption that was prevailing
            // when this code was written.
            throw new Error(
                `TYPE ERROR expected TypeSpecModel at path ${typeSpecPath} but instead got ${TypeClass.name}.`,
            );

        // Not sure how this is exactly needed/used
        // It seems like this is to capture and react to changes
        // in a parent, but so far, the parent can't be changed
        // because only one ui is visible at any time. Anyways
        // A change in a parent is only transported via typeSpecProperties@
        // but it's possible that we should reference the parent
        // typeSpecProperties@ here rather than the own.
        // require a parent animationProperties@ reference?
        // In stage-and-actors we find>
        //      this._animationPropertiesKey = `animationProperties@${this.widgetBus.rootPath.append('..', '..')}`;
        // In TypeSpecChildrenMeta we find:
        //       [`typeSpecProperties@${rootPath.append('..', '..')}`, '@parentProperties']
        //
        // So far it looks right to reference the current typeSpecProperties
        // not the parent. this is used in getLiveProperties via typeSpecGetDefaults
        // and it seems accurate to read the value on this level and not
        // on the parent level.
        const typeSpecPropertiesKey = `typeSpecProperties@${typeSpecPath}`, //.append('..', '..')}`
            //, updateDefaultsDependencies = [
            //      // [this._animationPropertiesKey, 'animationProperties@']
            //      // ['typeSpecProperties@', 'typeSpecProperties@']
            //      [typeSpecPropertiesKey, 'typeSpecProperties@']
            //  ]
            //, _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
            updateDefaultsDependencies = [
                [typeSpecPropertiesKey, "properties@"],
            ],
            requireUpdateDefaults = (/*changedMap*/) => {
                // FIXME: in this context, this method seems broken!
                // for once, it contains e.g. `value` as key in changedMap
                // but without calling context, it's not possible to turn
                // that into a more meaningful key.
                // Also, in UIManualAxesLocations opsz/autopsz is not properly
                // initialized when this returns false.
                // Since we are not in an animation context, we may
                // get away with always returning true, without a big
                // performance hit.

                // const result = Array.from(changedMap.keys())
                //                         .some(name=>_updateDefaultsNames.has(name));
                // console.warn(`>>>${this} requireUpdateDefaults ${result} changedMap:`, changedMap);
                // return result;
                return true;
            },
            getLiveProperties = () => {
                // NOTE: I don't think this case happens anymore, as
                // typeSpecPropertiesKey no longer tries to reference
                // the parent.
                return typeSpecPropertiesKey === "typeSpecProperties@"
                    ? null
                    : this.getEntry(typeSpecPropertiesKey);
            },
            getDefaults = typeSpecGetDefaults.bind(null, getLiveProperties);
        // console.log(`${this}updateDefaultsDependencies = `, updateDefaultsDependencies)
        const widgets = [
            [
                {
                    zone: "main",
                },
                [],
                StaticTag,
                "h3",
                {},
                (typeSpecPath.equals(rootTypeSpecPath) ? "Origin " : "") +
                    `Type-Spec:`,
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [["label", "value"]],
                UILineOfTextInput,
                "Label",
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [
                    "font", // requires local font only to indicate inheritance
                    // especially, so far, for this, it would be
                    // maybe better to get the rootFont via a primal
                    // typeSpecnion, rather than via a last reserver
                    // query into the model. Especially because there
                    // will always be the /font. For the other
                    // properties, however, it could be handled similarly,
                    // not having to query getDefaults ...
                    ["/font", "rootFont"],
                    ["typeSpecProperties@", "properties@"],
                ],
                UIFontLabel,
                ProcessedPropertiesSystemMap.createSimpleRecord(
                    SPECIFIC,
                    "font",
                ),
                "span",
                {},
                (font, inherited = false) => {
                    return (
                        `${font.nameVersion}` +
                        (inherited ? " (inherited)" : "")
                    );
                },
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [["/availableFonts", "options"], "activeFontKey"],
                FontSelect,
                true,
            ],
            // This should be set up using some kind of "template"
            // system, i.e.
            // - that fg/bf colors appear next to each other
            // - there's no double/multi defintion UI-widgets for the same item (label is defined above)
            // - some items don't require a widget, here maybe  `children` as
            //   those are already handled in the "Type-Spec Manager"
            // - autoOPSZ will be covered by UIManualAxesLocation and does
            //   not need extra handling
            // so far we have e.g. fontSize here and it's a NumberOrEmptyModel
            // but it says: Can't find generic UI-Element
            //
            // FIXME: Half way there.
            // The template would need to describe
            //      which types to use/not use
            //      where to put them
            //      how to group or separate them
            //      NOTE however, the color-picker may be a nice example
            //      for existing grouping behavior.
            [
                { rootPath: typeSpecPath, zone: "main" },
                [],
                UITypeDrivenContainer,
                // widgetBus, _zones
                this._zones,
                {
                    // injectable
                    getDefaults: getDefaults,
                    // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
                    //          via VideoproofController constructor initial resources: Error:
                    //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
                    //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
                    // Maybe this key is flawed in this context?
                    updateDefaultsDependencies,
                    genericTypeToUIElement,
                    requireUpdateDefaults,
                    // 'properties@': ['typeSpecProperties@', 'properties@']
                },
                // FIXME: the type of the root element should be fixed
                // to TypeSpecModel as well!
                TYPESPEC_PPS_MAP,
                // , 'Hello UITypeDrivenContainer'// label
            ],
            [
                {
                    rootPath: typeSpecPath,
                    zone: "main",
                },
                [
                    [".", "referenceItem"],
                    ["typeSpecProperties@", "properties@"],
                    // This is probably not required for the CommonActorProperties at all.
                ],
                UIshowProcessedProperties,
                "Type-Spec",
            ],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult),
            pathOrEmpty = changedMap.has("typeSpecPath")
                ? changedMap.get("typeSpecPath")
                : this.getEntry("typeSpecPath"),
            rootPath = Path.fromString(
                this.widgetBus.getExternalName("rootTypeSpec"),
            ),
            // If pathOrEmpty is empty or if the currently selected
            // (via typeSpecPath) TypeSpec got deleted and it doesn't exist
            // anymore, fallback to rootTypeSpec.
            [path, pathExists] = ((pathOrEmpty) => {
                if (pathOrEmpty.isEmpty)
                    // Assert rootPath always exists.
                    return [rootPath, true];
                const path = rootPath.append("children", ...pathOrEmpty.value),
                    rootState = this.getEntry("/"),
                    pathExists = getEntry(rootState, path, false) !== false;
                return [pathExists ? path : rootPath, pathExists];
            })(pathOrEmpty),
            rebuild = changedMap.has("typeSpecPath") || !pathExists;
        if (rebuild) {
            // deprovision widgets
            for (const widgetWrapper of this._widgets) widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set();

        // Keeping for debugging for now:
        // console.log(`${this.constructor.name}._provisionWidgets(compareResult):`, ...changedMap.keys()
        //     , `\n actor !== null`, actor !== null
        //     , `\n changedMap.has('actorPath')`, changedMap.has('actorPath')
        //     , `\n typeChanged`, typeChanged, `actorTypeKey`, actorTypeKey
        //     , `\n rebuild`, rebuild
        // )

        const widgetWrappers = [];

        if (rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            widgetWrappers.push(
                ...this._createTypeSpecWrappers(path, rootPath),
            );
        }

        this._widgets.push(...widgetWrappers);
        for (const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }

        return requiresFullInitialUpdate;
    }
}

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
class UIStylePatch extends _BaseContainerComponent {
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
                    // NOTE: I don't think this case happens anymore, as
                    // typeSpecPropertiesKey no longer tries to reference
                    // the parent.
                    //    return typeSpecPropertiesKey === 'typeSpecProperties@'
                    //        ? null
                    //        : this.getEntry(typeSpecPropertiesKey)
                    //        ;
                },
                getDefaults = (ppsRecord, fieldName, modelDefaultValue) => {
                    if (ppsRecord.fullKey === `${SPECIFIC}font`) {
                        const activeFontKey = this.getEntry(
                            settings.rootPath.append("activeFontKey"),
                        ); //.append('activeFontKey'));
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
                // AxesLocationsModel seems to require 'typeSpecProperties@'
                // which causes:
                //      Uncaught (in promise) Error: KEY ERROR not found identifier
                //      "typeSpecProperties@/activeState/stylePatchesSource/bold/instance"
                //      in [ProtocolHandler typeSpecProperties@]:
                //      typeSpecProperties@/activeState/typeSpec.
                //
                // We could filter the TYPESPEC_PPS_MAP and try to avoid
                // the error by not using AxesLocationsModel.
                //console.log(`${this} TYPESPEC_PPS_MAP`, TYPESPEC_PPS_MAP);

                // console.log(`${this} ... ${this.widgetBus.rootPath.append('instance')}`,
                //         this.widgetBus.getEntry(this.widgetBus.rootPath.append('instance')));
                // keys are:
                //    "baseFontSize", "relativeFontSize", "textColor",
                //    "backgroundColor", "autoOPSZ", "axesLocations",
                //    "activeFontKey", "font", "installedFonts"

                removeItems = new Set([
                    // 'baseFontSize' // Maybe only use in paragraph context
                ]),
                PPS_MAP = new ProcessedPropertiesSystemMap(
                    Array.from(TYPESPEC_PPS_MAP.entries()).filter(
                        ([key]) => !removeItems.has(key),
                    ),
                ),
                // keys is this are:
                //    "columnWidth", "leading", "baseFontSize", "relativeFontSize",
                //     "textColor", "backgroundColor", "stylePatches"
                // minus: "axesLocations" of course
                //
                // The main diff to the model are:
                //      "columnWidth", "leading"
                // The following are expected to be missing as well:
                //      "activeFontKey", "font", "installedFonts"

                // console.log(`${this} PPS_MAP`, PPS_MAP);
                updateDefaultsDependencies = [
                    // FIXME: here a fundamental flaw of the concept becomes apparent:
                    // font is only required for the OpenType-Features UI, but via this
                    // mechanism, the dependency is also injected into the ColorChooser
                    // UI. if we use "./font" as external name, the ColorChooser fails
                    // with a key error, as it doesn't have a font property. Using the
                    // absolute path fixes the symptom, howver, ColorChooser is now
                    // still loaded with the font dependency, which it doesn't have!
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
                    // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
                    //          via VideoproofController constructor initial resources: Error:
                    //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
                    //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
                    // Maybe this key is flawed in this context?
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
                // FIXME: the type of the root element should be fixed
                // to TypeSpec as well! (what does this mean?)
                PPS_MAP,
                //, 'Hello UITypeDrivenContainer'// label
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

/**
 * FIXME: this is also kind of a repeated pattern TypeSpecPropertiesManager
 * looks similar, however the details are a bit different because of the
 * different addressing in TypeSpec.
 * This version has diverged from the _BaseByPathPropertiesManager version
 * in type-spec-ramp. It makes typeKeyName optional, so, in that case
 * the type is disregarded. And the name became more generic.
 */
class _BaseByPathContainerComponent extends _CommonContainerComponent {
    initialUpdate =
        _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    constructor(
        widgetBus,
        _zones,
        className,
        pathEntryName,
        childrenMapEntryName,
        typeKeyName = null,
    ) {
        const localZoneElement = widgetBus.domTool.createElement("div", {
                class: className,
            }),
            zones = new Map([..._zones, ["local", localZoneElement]]);
        widgetBus.insertElement(localZoneElement);
        // provision widgets dynamically!
        super(widgetBus, zones);
        this._pathEntryName = pathEntryName;
        this._childrenMapEntryName = childrenMapEntryName;
        this._typeKeyName = typeKeyName;
        this._currentTypeKey = null;
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.widgetBus.getExternalName(this._pathEntryName));
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.widgetBus.getExternalName(this._pathEntryName));
        return dependencies;
    }
    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult),
            pathOrEmpty = changedMap.has(this._pathEntryName)
                ? changedMap.get(this._pathEntryName)
                : this.getEntry(this._pathEntryName),
            // in this case path is absolute, I believe
            rootPath = Path.fromString(
                this.widgetBus.getExternalName(this._childrenMapEntryName),
            ),
            path = !pathOrEmpty.isEmpty
                ? rootPath.append(...pathOrEmpty.value)
                : null,
            childrenMap = changedMap.has(this._childrenMapEntryName)
                ? changedMap.get(this._childrenMapEntryName)
                : this.getEntry(this._childrenMapEntryName),
            item = !pathOrEmpty.isEmpty
                ? // If path can't be resolved item becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                  getEntry(childrenMap, pathOrEmpty.value, null)
                : null,
            typeKey =
                item === null || this._typeKeyName === null
                    ? null
                    : item.get(this._typeKeyName).value,
            typeChanged = this._currentTypeKey !== typeKey,
            rebuild = changedMap.has(this._pathEntryName) || typeChanged;
        this._currentTypeKey = typeKey;
        if (rebuild) {
            // deprovision widgets
            for (const widgetWrapper of this._widgets) widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set(),
            widgetWrappers = [];
        if (rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            if (item !== null) {
                widgetWrappers.push(...this._createItemWrappers(path, item));
            } else {
                widgetWrappers.push(...this._createEmptyWrappers());
            }
        }

        this._widgets.push(...widgetWrappers);
        for (const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }
        return requiresFullInitialUpdate;
    }

    _createEmptyWrappers() {
        const widgets = [
            [{ zone: "local" }, [], StaticTag, "span", {}, "(Select an item)"],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(editingNodePath, item) {
        const widgets = [
            [
                { zone: "local" },
                [],
                StaticTag,
                "span",
                {},
                `(_createItemWrappers is not implemented ${item} ${editingNodePath})`,
            ],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}

class StylePatchPropertiesManager extends _BaseByPathContainerComponent {
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
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(stylePatchPath, item) {
        const TypeClass = item.constructor;
        if (TypeClass !== StylePatchModel)
            // NOTE: This check is not strictly required, it's
            // a sanity check to confirm.
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
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}

class NodeSpecPropertiesManager extends _BaseByPathContainerComponent {
    constructor(widgetBus, _zones) {
        super(
            widgetBus,
            _zones,
            "ui_node_spec-properties_manager", // className
            "nodeSpecPath", // pathEntryName
            "childrenOrderedMap", // childrenMapEntryName
            null, // typeKeyName=null
        );
    }

    _createEmptyWrappers() {
        const widgets = [
            [
                { zone: "local" },
                [],
                StaticTag,
                "span",
                {},
                "(Select a NodeSpec)",
            ],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(path) {
        const key = path.parts.at(-1),
            widgets = [
                [
                    {
                        zone: "local",
                    },
                    [],
                    StaticTag,
                    "h3",
                    {},
                    `NodeSpec: ${key}`,
                ],
            ];

        const injectable = {
            getDefaults: nodeSpecGetDefaults,
            // Using updateDefaultsDependencies (with typeSpecProperties@) in here causes an error:
            //          via VideoproofController constructor initial resources: Error:
            //          KEY ERROR not found identifier "typeSpecProperties@/activeState/typeSpec/textColor"
            //          in [ProtocolHandler typeSpecProperties@]: typeSpecProperties@/activeState/typeSpec.
            // Maybe this key is flawed in this context?
            updateDefaultsDependencies: [], //updateDefaultsDependencies
            genericTypeToUIElement, // ??
            requireUpdateDefaults: () => true, //
        };
        widgets.push([
            {
                rootPath: path,
                zone: "local",
            },
            [],
            UITypeDrivenContainer,
            this._zones,
            injectable,
            NODESPEC_PPS_MAP,
        ]);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}

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

class MapSelectButton extends DynamicTag {
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

class UIStylePatchesMap extends _UIBaseMap {
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
            // Should be a really simple item maybe displaying the label
            // Maybe we could edit the label.
            // But rather it is just to select, on click and to display
            // as selected, e.g. bold label
            Constructor = MapSelectButton,
            args = [
                // Want this to be a Button.
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

// based on a copy of UIStylePatchesMap
class UINodeSpecMap extends _UIBaseMap {
    static ROOT_CLASS = `ui_node_spec_map`;
    static BASE_CLASSES = [...super.BASE_CLASSES, super.ROOT_CLASS];
    static TYPE_CLASS_PART = null;
    static VISUAL_ORDER_STRATEGY = _UIBaseMap.VISUAL_ORDER_STRATEGY_NATURAL;
    static KEY_ADD_BUTTON_LABEL = "create";
    static KEY_DATA_TRANSFER_TYPE =
        DATA_TRANSFER_TYPES.PROSEMIROOR_NODE_SPEC_PATH;

    get _initialWidgets() {
        const wasteBasket = [
            { zone: "local" },
            [[".", "rootCollection"]],
            WasteBasketDropTarget,
            "Delete NodeSpec",
            "",
            [this.constructor.KEY_DATA_TRANSFER_TYPE],
        ];
        const widgets = super._initialWidgets;
        widgets.splice(Infinity, 0, wasteBasket);
        return widgets;
    }

    // Uses this.MapModel.validateKey i.e. validateNodeSpecName

    // Same pattern as in UIStylePatchesMap, it has the button to select
    // the item to edit. we need that!
    _createWrapperValue(keyId, key) {
        const childWidgetBus = this._childrenWidgetBus,
            settings = {
                relativeRootPath: Path.fromParts(".", key),
                zone: keyId, // required to check if widgetWrapper.host === host
            },
            dependencyMappings = [
                // ['../stylePatchTypeKey', 'data']
                [this.widgetBus.getExternalName("nodeSpecPath"), "activePath"],
            ],
            Constructor = MapSelectButton,
            args = [
                // Want this to be a Button.
                "button",
                { class: "ui_node_spec_map-item-value" },
                [["click", (/*event*/) => this._onClickHandler(key)]],
                identity,
                "Edit", // initialContent
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
                selected = this.getEntry("nodeSpecPath");
            // this is a toggle
            if (!selected.isEmpty && selected.value.equals(path))
                selected.clear();
            else selected.value = path;
        });
    }
    // _createKeyValue(childrenOrderedMap): not required as super does:
    // childrenOrderedMap.constructor.Model.createPrimalDraft(childrenOrderedMap.dependencies)
    // and that is sufficient so far.
}

/**
 * Note: this kind of replaces DependentValue of Animanion as
 * it can also be used to define aliases, e.g:
 *  yield [`axesLocations/opsz`,  new SyntheticValue(identity, [`${GENERIC}fontSize`]];
 *  and from the look of it that's what DependentValue in Animanion
 * basically did. It can also do more,  e.g. represent a calculation
 * of pre-existing values. And we do the full dependency graph resolution
 * in here, it seems, after all simple to comprehend.
 */
export class SyntheticValue {
    constructor(fn, dependencies) {
        // NOTE: actually e.g. if the fn arguments is variable length, with
        // a ...rest parameter, zero-length arguments can make sense.
        // if(!dependencies.length)
        //     throw new Error(`VALUE ERROR dependencies can't be empty.`);
        Object.defineProperties(this, {
            fn: { value: fn },
            dependencies: { value: Object.freeze(Array.from(dependencies)) },
        });
    }
    toString() {
        return `[SyntheticValue ${this.dependencies.join(", ")}]`;
    }
    call(...args) {
        return this.fn(...args);
    }
}

function mapSetProperties(map, ...propertiesArgs) {
    for (const properties of propertiesArgs)
        for (const [propertyName, propertyValue] of properties)
            map.set(propertyName, propertyValue);
    return map;
}

/**
 * This got reduced to a collection of static functions.
 */
export class LocalScopeTypeSpecnion {
    static resolveSyntheticProperties(rawPropertyMap, parentPropertyValuesMap) {
        const syntheticProperties = new Set(
            Array.from(rawPropertyMap)
                .filter(
                    ([, /*propertyName*/ propertyValue]) =>
                        propertyValue instanceof SyntheticValue,
                )
                .map(([propertyName /*propertyValue*/]) => propertyName),
        );
        if (!syntheticProperties.size) return rawPropertyMap;

        const dependantsMap = new Map(),
            requirementsMap = new Map(),
            noDepsSet = new Set(parentPropertyValuesMap.keys());
        for (const propertyName of rawPropertyMap.keys()) {
            if (!syntheticProperties.has(propertyName)) {
                noDepsSet.add(propertyName);
                continue;
            }
            // It's a SyntheticProperty
            const synthProp = rawPropertyMap.get(propertyName);
            if (synthProp.dependencies.length === 0) {
                // NOTE We currently don't allow this configuration for
                // SyntheticProperties, but it's rather a semantic reason:
                // if there's no dependency, a value could be produced immediately.
                // Also, if the SyntheticProperty doesn't have local dependencies,
                // it resolves to NULL/not defined; this could change as well
                // but that would require a case and extra configuration.
                noDepsSet.add(propertyName);
                continue;
            }
            dependantsMap.set(propertyName, new Set(synthProp.dependencies));
            for (const dependency of synthProp.dependencies) {
                // _mapGetOrInit(requirementsMap, dependeny, ()=>[]).push(propertyName);
                if (!requirementsMap.has(dependency))
                    requirementsMap.set(dependency, []);
                requirementsMap.get(dependency).push(propertyName);
            }
        }
        const resolveOrder = topologicalSortKahn(
                noDepsSet,
                requirementsMap,
                dependantsMap,
            ),
            // don't modify rawPropertyMap in here!
            resultMap = new Map(rawPropertyMap),
            seen = new Set();
        for (const propertyName of resolveOrder) {
            if (
                !syntheticProperties.has(propertyName) ||
                seen.has(propertyName)
            )
                // all properties will end up in resolveOrder
                continue;
            // NOTE: topologicalSortKahn sometimes has duplicates, after
            // they got resolved once, it should be fine, resolving them
            // twice leads to an error. My case was setting 'axislocations/slnt'
            // on the root TypeSpec. I'm not sure now why it appears multiple
            // times in resolveOrder, it would be good to see the original
            // reason for that and eliminate it.
            seen.add(propertyName);
            const synthProp = resultMap.get(propertyName),
                args = [];
            let localDependencies = 0;
            for (const dependencyName of synthProp.dependencies) {
                if (resultMap.has(dependencyName)) {
                    localDependencies += 1;
                    // assert: !(resultMap.get(dependencyName) instanceof SyntheticProperty)
                    args.push(resultMap.get(dependencyName));
                } else if (parentPropertyValuesMap.has(dependencyName)) {
                    args.push(parentPropertyValuesMap.get(dependencyName));
                } else {
                    // else: this is going to be dropped because propertyName
                    // (no longer) can be resolved. I won't log a message
                    // as this is expected behavior.
                    break;
                }
            }
            if (
                localDependencies === 0 ||
                arguments.length !== synthProp.dependencies.length
            )
                resultMap.delete(propertyName);
            const value = synthProp.call(...args);
            if (value === null)
                // FIXME: not sure if this feature makes sense like this
                // but, if there's e.g. an axisLocation tag that is not
                // in the font, this can remove the tag from the results.
                resultMap.delete(propertyName);
            else resultMap.set(propertyName, value);
        }
        return resultMap;
    }

    static *propertiesGenerator(
        propertiesGenerators,
        typeSpec,
        parentPropertyValuesMap,
    ) {
        const outerTypespecnionAPI = {
            hasParentProtperty: parentPropertyValuesMap.has.bind(
                parentPropertyValuesMap,
            ),
            getParentProperty: parentPropertyValuesMap.get.bind(
                parentPropertyValuesMap,
            ),
        };
        for (const gen of propertiesGenerators.values())
            yield* gen(outerTypespecnionAPI, typeSpec);
    }
    /* NOTE: before accessing getPropertyValuesMap init is required.
     * This will create a cache, that will be around until initPropertyValuesMap
     * is called again or until the instance ceases to exist.
     */
    static initPropertyValuesMap(properties, parentPropertyValuesMap) {
        const rawPropertyMap = new Map(properties);
        return this.resolveSyntheticProperties(
            rawPropertyMap,
            parentPropertyValuesMap,
        );
    }
}

export class _BaseTypeSpecnion {
    static _NOTDEF = Symbol("_NOTDEF"); // jshint ignore:line

    constructor() {
        Object.defineProperties(this, {
            _localPropertyValuesMap: {
                get: () => {
                    throw new Error(
                        `NOT IMPLEMENTED {this}._localPropertyValuesMap.`,
                    );
                },
                set: (value) => {
                    Object.defineProperty(this, "_localPropertyValuesMap", {
                        value,
                    });
                },
                configurable: true,
                writtable: true,
            },
            _propertyValuesMap: {
                get: () => {
                    throw new Error(
                        `NOT IMPLEMENTED {this}._propertyValuesMap.`,
                    );
                },
                set: (value) => {
                    Object.defineProperty(this, "_propertyValuesMap", {
                        value,
                    });
                },
                configurable: true,
                writtable: true,
            },
        });
    }

    toString() {
        return `[${this.constructor.name}]`;
    }
    getProperties() {
        return this._propertyValuesMap;
    }
    getOwnProperty(propertyName, defaultVal = super._NOTDEF) {
        if (!this._localPropertyValuesMap.has(propertyName)) {
            if (defaultVal !== this.constructor._NOTDEF) return defaultVal;
            throw new Error(
                `KEY ERROR ${propertyName} not in {$this.constructor.name}.`,
            );
        }
        return this._localPropertyValuesMap.get(propertyName);
    }
    // typeSpecnion.localPropertyNames => Array, all names that are defined by this scope
    get localPropertyNames() {
        return Array.from(this._localPropertyValuesMap.keys());
    }
    // compatibility to localTypeSpecnion API:
    getPropertyValuesMap() {
        return this._localPropertyValuesMap;
    }
}

class PatchedTypeSpecnion extends _BaseTypeSpecnion {
    constructor(parentMaps, rawProperties, stylePatchPropertyValuesMap) {
        super();

        // This does basically the same as HierarchicalScopeTypeSpecnion._initPropertyValuesMaps.
        // However, before LocalScopeTypeSpecnion.initPropertyValuesMap
        // stylePatchPropertyValuesMap is applied to unpatchedRawProperties
        // this is the actual application of the style patch!
        //
        //
        const [parentPropertyValuesMap, filteredParentPropertyValuesMap] =
            parentMaps;
        const _localRawProperties = mapSetProperties(
                new Map(),
                rawProperties,
                stylePatchPropertyValuesMap,
            ),
            // apply LocalScopeTypeSpecnion.resolveSyntheticProperties
            localPropertyValuesMap =
                LocalScopeTypeSpecnion.initPropertyValuesMap(
                    _localRawProperties,
                    parentPropertyValuesMap,
                ),
            // All properties in local override properties in parent
            propertyValuesMap = mapSetProperties(
                new Map(),
                filteredParentPropertyValuesMap,
                localPropertyValuesMap,
            );
        this._localPropertyValuesMap = localPropertyValuesMap;
        this._propertyValuesMap = propertyValuesMap;
    }
}
/**
 * Name is a portmanteau from TypeSpec + Onion
 * Like the peels of an onion these typeSpec property generators can
 * be stacked together. The inner layers can access the values of
 * the outer layers.
 *
 * NOTE: using this in type-tools-grid as well!
 */
export class HierarchicalScopeTypeSpecnion extends _BaseTypeSpecnion {
    constructor(
        propertiesGenerators,
        typeSpec,
        parentTypeSpecnionOrTypeSpecDefaultsMap,
        isInheritingPropertyFn = null,
    ) {
        super();
        // `typeSpecDefaultsMap` is only used/required if parentTypeSpecnion
        // is null. This is now reflected in the code, because that way it
        // is obvious that the typeSpecDefaultsMap is only needed at the
        // root, not at children in the hierarchy.
        const [parentTypeSpecnion, typeSpecDefaultsMap] =
            parentTypeSpecnionOrTypeSpecDefaultsMap instanceof _BaseTypeSpecnion
                ? [parentTypeSpecnionOrTypeSpecDefaultsMap, null]
                : [null, parentTypeSpecnionOrTypeSpecDefaultsMap];
        // must be a HierarchicalScopeTypeSpecnion as well/same interface
        // typeSpecnion.parentTypeSpecnion => typeSpecnion || null
        Object.defineProperty(this, "parentTypeSpecnion", {
            value: parentTypeSpecnion,
        });
        this._propertiesGenerators = propertiesGenerators;
        this._typeSpec = typeSpec;
        if (parentTypeSpecnion !== null && !isInheritingPropertyFn)
            throw new Error(
                "ASSERTION FAILED parentTypeSpecnion is not null but isInheritingPropertyFn is not set.",
            );
        this._isInheritingPropertyFn = isInheritingPropertyFn;
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
        [
            this._rawProperties,
            this._localPropertyValuesMap,
            this._propertyValuesMap,
        ] = this._initPropertyValuesMaps();
    }

    createPatched(stylePatchPropertyValuesMap) {
        return new PatchedTypeSpecnion(
            this._getParentMaps(),
            this._rawProperties,
            stylePatchPropertyValuesMap,
        );
    }

    _isInheritingProperty(property) {
        // By default all properties are inheriting, due to backward
        // compatibility, but we can inject different behavior.
        if (this._isInheritingPropertyFn)
            return this._isInheritingPropertyFn(property);
        return true;
    }

    _getParentMaps() {
        const parentPropertyValuesMap =
                this.parentTypeSpecnion === null
                    ? // FIXME: this is not exact enough, we need to differentiate
                      // whether to inherit or whether to take a value from the
                      // defaults.
                      this._typeSpecDefaultsMap // new Map()
                    : this.parentTypeSpecnion.getProperties(),
            // this creates a copy, so we don't change parentPropertyValuesMap.
            filteredParentPropertyValuesMap = new Map(
                Array.from(parentPropertyValuesMap).filter(
                    ([propertyName /*, value*/]) =>
                        this._isInheritingProperty(propertyName),
                ),
            );
        return [parentPropertyValuesMap, filteredParentPropertyValuesMap];
    }

    _initPropertyValuesMaps() {
        const [parentPropertyValuesMap, filteredParentPropertyValuesMap] =
                this._getParentMaps(),
            propertiesGen = LocalScopeTypeSpecnion.propertiesGenerator(
                this._propertiesGenerators,
                this._typeSpec,
                parentPropertyValuesMap,
            ),
            rawProperties = mapSetProperties(new Map(), propertiesGen);
        const localPropertyValuesMap =
                LocalScopeTypeSpecnion.initPropertyValuesMap(
                    rawProperties,
                    parentPropertyValuesMap,
                ),
            // All properties in local override properties in parent
            propertyValuesMap = mapSetProperties(
                new Map(),
                filteredParentPropertyValuesMap,
                localPropertyValuesMap,
            );
        return [rawProperties, localPropertyValuesMap, propertyValuesMap];
    }
}

/**
 * FIXME: these generators and the generators in stage-and-actors should
 * be synced. So far these are pretty much copies of the ones in
 * stage-and-actors, however, those also get `momentT` passed as an argument
 * and at least the axisLocationsGen also uses it. Keeping the implementations
 * apart/duplicated for the moment, to not get caught in handling wrong
 * assumptions of similarity.
 * However, eventually, all properties (as in processes properties system)
 * should be defined and handled similarly to increase the compatibility
 * between the sub-systems.
 */

/**
 * It looks so far to be *very* nice to calculate line-heigth-em/autoLinearLeading
 * in the properties directly instead of later where the value is used.
 * This way, we can use the value for other synthetic properties and the
 * calculation is at a central point instead of per user.
 *
 * This has implications on how we'll propagate parametric typography
 * in the future.
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
function* _pathSpecGen(
    getLeave,
    nextNode,
    parentPath,
    pathSpec,
    cursor = null,
) {
    if (!pathSpec.length) {
        if (!(cursor instanceof _AbstractSimpleOrEmptyModel && cursor.isEmpty))
            yield getLeave(parentPath, cursor);
        return;
    }
    const [head, ...tail] = pathSpec,
        keys =
            typeof head === "function"
                ? head(cursor) // to generate the keys for the items of a list, see PATH_SPEC_EXPLICIT_DIMENSION
                : head;
    for (const key of keys) {
        const nextCursor = nextNode ? nextNode(cursor, key) : null,
            path = [...parentPath, key];
        yield* _pathSpecGen(getLeave, nextNode, path, tail, nextCursor);
    }
}

/**
 * This only yields (flattens) the full path described in a pathSpec
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
export function* pathSpecPathsGen(pathSpec, prefix) {
    function getLeave(path /*, cursor*/) {
        return path;
    }
    for (const spec of pathSpec)
        yield* _pathSpecGen(getLeave, null, [prefix], spec);
}

/**
 *  This reads from a metamodel instance according to pathSpec.
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
export function* pathSpecValuesGen(pathSpec, prefix, data) {
    function nextNode(cursor, key) {
        return cursor.get(key);
    }
    function getLeave(path, cursor) {
        return [path.join("/"), cursor.value];
    }
    for (const spec of pathSpec)
        yield* _pathSpecGen(getLeave, nextNode, [prefix], spec, data);
}

// This will produce:
//  * {prefix to leading/} a/leading
//  * {prefix to leading/} a/lineWidth
//  * {prefix to leading/} b/leading
//  * {prefix to leading/} b/lineWidth
//  * {prefix to leading/} minLeading
//  * {prefix to leading/} maxLeading
const PATH_SPEC_AUTO_LINEAR_LEADING = [
    [
        ["a", "b"],
        ["leading", "lineWidth"],
    ],
    [["minLeading", "maxLeading"]],
];

/**
 * recursive helper function for _fillTree
 */
function _fillTreeGetNodeFromRegistry(registry, path) {
    const fullNodeKey = path.join("/");
    let node = registry.get(fullNodeKey);
    if (!node) {
        node = {};
        registry.set(fullNodeKey, node);
        const key = path.at(-1),
            parent = _fillTreeGetNodeFromRegistry(registry, path.slice(0, -1));
        parent[key] = node;
    }
    return node;
}

/**
 * Put a flat list of paths into a nested object, setting the leaves
 * to values from valuesMap.
 */
export function fillTreeFromPaths(prefix, paths, valuesMap) {
    const registry = new Map([[prefix, {}]]);
    for (const path of paths) {
        const fullKey = path.join("/"),
            lastKey = path.at(-1);
        const parent = _fillTreeGetNodeFromRegistry(
            registry,
            path.slice(0, -1),
        );
        if (!valuesMap.has(fullKey))
            throw new Error(
                `KEY ERROR fillTreeFromPaths "${fullKey}" is not in valuesMap.`,
            );
        parent[lastKey] = valuesMap.get(fullKey);
    }
    return registry.get(prefix);
}

function AutoLinearLeadingSyntheticValue(prefix) {
    const COLUMN_WIDTH_EN = `${GENERIC}columnWidth`,
        RELATIVE_FONT_SIZE = `${GENERIC}relativeFontSize`,
        argsNames = [COLUMN_WIDTH_EN, RELATIVE_FONT_SIZE],
        paths = [];
    for (const path of pathSpecPathsGen(
        PATH_SPEC_AUTO_LINEAR_LEADING,
        prefix,
    )) {
        const fullKey = path.join("/");
        argsNames.push(fullKey);
        paths.push(path);
    }

    function calculate(...args) {
        const valuesMap = new Map(zip(argsNames, args)),
            // NOTE: look at PATH_SPEC_AUTO_LINEAR_LEADING to see how this works
            { a, b, minLeading, maxLeading } = fillTreeFromPaths(
                prefix,
                paths,
                valuesMap,
            ),
            columnWidthEn = valuesMap.get(COLUMN_WIDTH_EN),
            relativeFontSize = valuesMap.get(RELATIVE_FONT_SIZE),
            actualColumnWidth = columnWidthEn / relativeFontSize;
        return runion_01_lineHeight(
            a,
            b,
            actualColumnWidth,
            minLeading,
            maxLeading,
        );
    }
    return new SyntheticValue(calculate, argsNames);
}

function* leadingGen(outerTypespecnionAPI, hostInstance) {
    for (const fieldName of getFieldsByType(
        hostInstance.constructor,
        LeadingAlgorithmModel,
    )) {
        const PREFIX = `${LEADING}${fieldName}`,
            ALGORITHM_TYPE = `${PREFIX}/algorithm`,
            LEADING_HEIGHT_EM = `${PREFIX}/line-height-em`,
            leadingAlgorithm = hostInstance.get(fieldName),
            algorithm = leadingAlgorithm.get("leadingAlgorithmTypeKey").value;
        if (algorithm === ForeignKey.NULL) {
            if (outerTypespecnionAPI.hasParentProtperty(ALGORITHM_TYPE)) {
                const algorithm =
                    outerTypespecnionAPI.getParentProperty(ALGORITHM_TYPE);
                if (algorithm === "AutoLinearLeading") {
                    // We always calculate this if the AutoLinearLeading
                    // is inherited, especially because `${GENERIC}columnWidth`
                    // could have changed in this layer.
                    yield [
                        LEADING_HEIGHT_EM,
                        new AutoLinearLeadingSyntheticValue(PREFIX),
                    ];
                }
            }
            continue;
        }
        const data = leadingAlgorithm.get("instance").wrapped;
        yield [ALGORITHM_TYPE, algorithm];
        if (algorithm === "AutoLinearLeading") {
            yield* pathSpecValuesGen(
                PATH_SPEC_AUTO_LINEAR_LEADING,
                PREFIX,
                data,
            );
            yield [
                LEADING_HEIGHT_EM,
                new AutoLinearLeadingSyntheticValue(PREFIX),
            ];
        } else if (algorithm === "ManualLeading")
            yield [LEADING_HEIGHT_EM, data.get("leading").value];
        else
            throw new Error(
                `NOT IMPLEMENTED leadingGen don't know how to handle algorithm type "${algorithm}".`,
            );
    }
}

function* fontGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const font = hostInstance.get("font");
    if (font !== ForeignKey.NULL) {
        yield [`${SPECIFIC}font`, font.value];
    }
}

/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 *
 */
function* baseFontSizeGen(outerTypespecnionAPI, hostInstance) {
    const baseFontSize = hostInstance.get("baseFontSize"),
        relativeFontSize = hostInstance.get("relativeFontSize");
    if (!baseFontSize.isEmpty)
        yield [`${GENERIC}baseFontSize`, baseFontSize.value];
    if (!relativeFontSize.isEmpty)
        yield [`${GENERIC}relativeFontSize`, relativeFontSize.value];
}

/**
 * Now, this becomes to be a "syntetic" value, it is created from
 * two original values and then calculated. Also, there's no actual
 * model data for this anymore.
 */
function* fontSizeGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const baseFontSize = hostInstance.get("baseFontSize"),
        relativeFontSize = hostInstance.get("relativeFontSize");
    if (baseFontSize.isEmpty && relativeFontSize.isEmpty)
        // font-size is defined by both of these values, if none is
        // defnied in here, the inherited value is just as good.
        return;

    // we already know that we have to yield as one of baseFontSize
    // or relativeFontSize is defined in this level/instance.
    // we don't know yet which one to take from local and which one to
    // inherit.
    // Ideally, if none of the args come from this level,
    // I don't want to evaluate the value, and just expect that
    // there will be an inherited value or a default in the Typespecnion.
    // The calling code could evaluate this. If none of the arguments
    // are local, don't define this derived value.
    // And, I don't want to resolve a dependency graph, so order is
    // relevant and the SyntheticValue are calculated in order, but likely
    // after all local generators have finished. So simple values that will
    // be yielded later will be available as well, also the results of
    // SynthethicValues that have been yielded before.
    function calculate(baseFontSize, relativeFontSize) {
        if (baseFontSize === null) return null;
        const fontSizeValue =
            baseFontSize * (relativeFontSize === null ? 1 : relativeFontSize);
        return fontSizeValue;
    }
    const args = [`${GENERIC}baseFontSize`, `${GENERIC}relativeFontSize`];
    // if either baseFontSize or relativeFontSize is defineded we should
    // yield the changed font size value.
    yield [`${GENERIC}fontSize`, new SyntheticValue(calculate, args)];
}

/**
 * hostInstance implements manualAxesLocationsModelMixin
 *              and fontSize
 * yield [propertyName, propertyValue]
 */
export function* axisLocationsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    // fontSize = hostInstance.get('fontSize')
    // => this is interesting, if hostInstance defines fontSize, we
    //    definitely use that, otherwise, going only via
    // outerAnimanionAPI.getProperty(`${GENERIC}fontSize`)
    const autoOPSZ = hostInstance.get("autoOPSZ").value;

    // I have this problem in grid where dimensionsGen runs after
    // axisLocationsGen dimensions gen may also set fontSize but
    // this SyntheticValue seems to be already resolved then. Maybe,
    // if this SyntheticValue for `axesLocations/opsz` could be resolved
    // much later, it would be working without passing ${GENERIC}autoOPSZ
    // so that it can be interpreted regardless later.
    yield [`${GENERIC}autoOPSZ`, autoOPSZ];
    if (autoOPSZ) {
        // autoOPSZ => opsz is the same pt value as the fontSize that
        // is applied to this level.
        //
        // if this remains the only useful case for outerTypespecnionAPI.getProperty
        // it should probably be replaced with some more powerful api
        // It would be nice if `${GENERIC}fontSize` would be
        // sufficient here! but maybe we need to decide when not to
        // use it.
        //if(baseFontSizeValue !== null)

        // this is effectively an alias of fontSize.
        // this should only result in a value if fontSizeValue doesn't
        // resolve to null, in which case using the inherited value
        // is correct, e.g like no yielding this.
        yield [
            `axesLocations/opsz`,
            new SyntheticValue(identity, [`${GENERIC}fontSize`]),
        ];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = hostInstance.get("axesLocations");
    for (const [axisTag, axisValue] of axesLocations) {
        if (autoOPSZ && axisTag === "opsz")
            // It was already yielded above and also should not
            // be present in here.
            continue;
        // Other than fontSize axesLocations are just not present when
        // at their default value.
        // I'm using the 'axesLocations/' prefix so it's easier to
        // distinguish. But also, it can be used dirextly as a path
        // in getEntry.
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
}

export function* openTypeFeaturesGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const openTypeFeatures = hostInstance.get("openTypeFeatures");
    for (const [featureTag, featureValue] of openTypeFeatures) {
        yield [`${OPENTYPE_FEATURES}${featureTag}`, featureValue.value];
    }
}

export function* languageTagGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const languageTag = hostInstance.get("languageTag");
    let hasLocalEntry = false;
    for (const [subTag, subTagValue] of languageTag) {
        const path = `${LANGUAGE}${subTag}`;
        if (subTagValue.isEmpty) {
            if (!outerTypespecnionAPI.hasParentProtperty(path))
                // Yield null to at least create some value in the local
                // liveProperties, for `${LANGUAGE}lang` (createLanguageTag)
                // to not fail. Basically this creates a kind of optional,
                // not set, arguments. null will also not be inherited.
                yield [path, null];
            continue;
        }
        hasLocalEntry = true;
        yield [path, subTagValue.value];
    }
    if (hasLocalEntry) {
        // Only if lang has local changes (we assume each local value to
        // be a change, even if the value is equal), we yield it, otherwise
        // the expection is that an upper element applies the attribute and
        // the languageTag is inherited (by the means of the DOM).
        const args = LanguageTagModel.fields
            .keys()
            .map((key) => `${LANGUAGE}${key}`);
        yield [`${LANGUAGE}lang`, new SyntheticValue(createLanguageTag, args)];
    }
}

function createMargin(value, unit, baseFontSize, fontSize, lineHeightEm) {
    if (value === null || unit === null) return null;
    if (unit === "lineHeight") return `${value * lineHeightEm * fontSize}pt`;
    if (unit === "em") return `${value * fontSize}pt`;
    if (unit === "baseEm") return `${value * baseFontSize}pt`;
    // e.g. unit === 'pt'
    return `${value}${unit}`;
}

function* marginsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const blockMargins = hostInstance.get(`blockMargins`),
        basePath = `${GENERIC}blockMargins/`;
    for (const [targetName /*start or end*/, margin] of blockMargins) {
        const targetPath = `${basePath}${targetName}`; // no trailing slash!!
        for (const [itemName, itemValue] /* unit or value */ of margin) {
            const path = `${targetPath}/${itemName}`; // generic/blockMargins/start/unit
            if (itemValue.isEmpty) {
                if (!outerTypespecnionAPI.hasParentProtperty(path))
                    // same rationale as in languageTagGen
                    yield [path, null];
                continue;
            }
            yield [path, itemValue.value];
        }
        const args = [
            `${targetPath}/value`,
            `${targetPath}/unit`,
            `${GENERIC}baseFontSize`,
            `${GENERIC}fontSize`,
            `${LEADING}leading/line-height-em`,
        ];
        yield [`${targetPath}`, new SyntheticValue(createMargin, args)];
    }
}

function calculateFontAxisValueSynthetic(axisTag, logiVal, font) {
    const axisRanges = font.axisRanges;
    if (!(axisTag in axisRanges))
        // In this case, the result value becomes null
        // i.e. 'axesLocations/wxht': null
        // FIXME: it would be nice to remove null values from the
        // results set.
        return null;
    const axisRange = axisRanges[axisTag];
    if (!(logiVal in axisRange)) return null;
    return axisRange[logiVal];
}

// path = 'axesLocations/hello'
// axisTag = 'wght'
// if(logiVal === 'number')
//      axesLocations/hello: axisValue.get('numericValue').value
//  else
//      axesLocations/hello/logicalValue: logiVal[default|min|max]
//      axesLocations/hello: syntheticValue('wght', ...['axesLocations/hello/logicalValue', 'SPECIFIC/font'])
function* axesMathAxisLocationValueGen(path, axisTag, axisValue) {
    // axisValue is a AxesMathAxisLocationValueModel
    const logiVal = axisValue.get("logicalValue").value;

    if (logiVal === "number") {
        const rawNumber = axisValue.get("numericValue").value;
        // DO we need this? would only work if axisRange was available
        // , clampedNumber = Math.min(axisRange.max, Math.max(axisRange.min, rawNumber))
        yield [path, rawNumber];
    } else {
        const logiValKey = `${path}/logicalValue`;
        yield [logiValKey, logiVal];
        const args = [logiValKey, `${SPECIFIC}font`];
        yield [
            path,
            new SyntheticValue(
                calculateFontAxisValueSynthetic.bind(null, axisTag),
                args,
            ),
        ];
    }
}

function* axisMathLocationsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const autoOPSZItem = hostInstance.get("autoOPSZ");
    if (!autoOPSZItem.isEmpty && autoOPSZItem.value) {
        // autoOPSZ => opsz is the same pt value as the fontSize that
        // is applied to this level.
        //
        // if this remains the only useful case for outerTypespecnionAPI.getProperty
        // it should probably be replaced with some more powerful api
        // It would be nice if `${GENERIC}fontSize` would be
        // sufficient here! but maybe we need to decide when not to
        // use it.
        //if(baseFontSizeValue !== null)

        // this is effectively an alias of fontSize.
        // this should only result in a value if fontSizeValue doesn't
        // resolve to null, in which case using the inherited value
        // is correct, e.g like no yielding this.
        yield [
            `axesLocations/opsz`,
            new SyntheticValue(identity, [`${GENERIC}fontSize`]),
        ];
    }

    const axesLocations = hostInstance.get("axesLocations");
    for (const [axisTag, axisValue] of axesLocations) {
        if (axisTag === "opsz" && !autoOPSZItem.isEmpty && autoOPSZItem.value)
            continue;
        yield* axesMathAxisLocationValueGen(
            `axesLocations/${axisTag}`,
            axisTag,
            axisValue,
        );
    }
}

// FIXME: There's another way specified in here to identify
// fields as GENERIC. But also, i.e. fontSizeGen already yields
// `${GENERIC}fontSize` so this should not!!!
const REGISTERED_GENERIC_TYPESPEC_FIELDS = Object.freeze(
        new FreezableSet([
            // script+language!
            "textAlign",
            "direction",
            "columnWidth",
        ]),
    ),
    TYPE_SPEC_PROPERTIES_GENERATORS = Object.freeze([
        // numericPropertiesGen
        colorsGen,
        fontGen,
        baseFontSizeGen,
        fontSizeGen, // must come before axisLocationsGen
        axisLocationsGen,
        openTypeFeaturesGen,
        languageTagGen,
        marginsGen, // not inline
        getPropertiesBroomWagonGen(GENERIC, REGISTERED_GENERIC_TYPESPEC_FIELDS),
        leadingGen,
    ]),
    _GENERIC_STYLEPATCH_FIELDS = Object.freeze(
        new FreezableSet([
            // empty so far
        ]),
    ),
    STYLE_PATCH_PROPERTIES_GENERATORS = Object.freeze([
        colorsGen /* re-used */,
        fontGen,
        baseFontSizeGen /* re-used */,
        // FIXME: I think I would prefer it if we wouldn't have to
        // include this, when the patch would be applied to the
        // older definition of this from the parent typeSpec. but it isn't,
        // It also seems that would change the semantics a lot. Now
        // Synthetic values are resolved as soon as possible, and that would
        // shift it to as late as possible.
        fontSizeGen,
        // Not sure if the treatment of autoOPSZ in axisLocationsGen
        // is actually OK! It could be! Then we could re-use it in
        // here!
        // NOTE also that in this case the values are AxesMathAxisLocationValueModel
        // which need resolution when the font is aussured to be known
        // i.e. where this patch and the typeSpec get mixed.
        axisMathLocationsGen,
        openTypeFeaturesGen,
        languageTagGen,
        getPropertiesBroomWagonGen(
            GENERIC,
            _GENERIC_STYLEPATCH_FIELDS,
        ) /* lind of re-used */,
    ]);
export class TypeSpecLiveProperties extends _BaseComponent {
    constructor(
        widgetBus,
        typeSpecPropertiesGenerators,
        isInheritingPropertyFn = null,
        typeSpecDefaultsMap = null,
    ) {
        super(widgetBus);
        this._propertiesGenerators = typeSpecPropertiesGenerators;
        this._typeSpecnion = null;
        this.propertyValuesMap = null;
        // only used if also hasParentProperties
        this._isInheritingPropertyFn = isInheritingPropertyFn;
        if (this.hasParentProperties && typeSpecDefaultsMap !== null)
            throw new Error(
                `VALUE ERROR ${this} typeSpecDefaultsMap must be null if hasParentProperties.`,
            );
        else if (!this.hasParentProperties && typeSpecDefaultsMap === null)
            throw new Error(
                `VALUE ERROR ${this} typeSpecDefaultsMap must NOT be null if not hasParentProperties.`,
            );
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
    }

    get typeSpecnion() {
        if (this._typeSpecnion === null)
            throw new Error(
                "LIFECYCLE ERROR this._typeSpecnion is null, must update initially first.",
            );
        return this._typeSpecnion;
    }

    get hasParentProperties() {
        return this.widgetBus.wrapper.dependencyReverseMapping.has(
            "@parentProperties",
        );
    }

    update(changedMap) {
        const hasRootFont =
            this.widgetBus.wrapper.dependencyReverseMapping.has("rootFont");
        let typeSpecnionChanged = false;

        if (
            changedMap.has("typeSpec") ||
            changedMap.has("@parentProperties") ||
            changedMap.has("rootFont")
        ) {
            const hasLocalChanges = changedMap.has("typeSpec"),
                fontChanged = changedMap.has("rootFont"),
                typeSpec_ = changedMap.has("typeSpec")
                    ? changedMap.get("typeSpec")
                    : this.getEntry("typeSpec"),
                // I had a case where typeSpec is a dynamic model
                // it would be nice to define the dependency in such a
                // way that it would be unwrapped here.
                typeSpec = typeSpec_.hasWrapped ? typeSpec_.wrapped : typeSpec_;
            if (this.hasParentProperties) {
                const parentProperties = changedMap.has("@parentProperties")
                        ? changedMap.get("@parentProperties")
                        : this.getEntry("@parentProperties"),
                    localChanged =
                        hasLocalChanges || this._typeSpecnion === null,
                    parentChanged =
                        this._typeSpecnion === null ||
                        parentProperties.typeSpecnion !==
                            this._typeSpecnion.parentTypeSpecnion;
                // Don't rebuild if the components haven't changed.
                if (localChanged || parentChanged || fontChanged) {
                    this._typeSpecnion = new HierarchicalScopeTypeSpecnion(
                        this._propertiesGenerators,
                        typeSpec,
                        parentProperties.typeSpecnion,
                        this._isInheritingPropertyFn,
                    );
                    typeSpecnionChanged = true;
                }
            } else {
                // typeSpecDefaultsMap only comes in at root, when
                // !this.hasParentProperties
                let typeSpecDefaultsMap = this._typeSpecDefaultsMap;
                // This is a hack, but it will work solidly for a while.
                // Eventually I'd like to figure a more conceptually robust way
                // how to distribute this kind of external, from the TypeSpec
                // structure, injected/inherited dynamic dependencies; or maybe
                // just formalize this.
                if (hasRootFont) {
                    const fontValue = (
                        changedMap.has("rootFont")
                            ? changedMap.get("rootFont")
                            : this.getEntry("rootFont")
                    ).value;
                    typeSpecDefaultsMap = new Map(this._typeSpecDefaultsMap);
                    typeSpecDefaultsMap.set(`${SPECIFIC}font`, fontValue);
                }

                this._typeSpecnion = new HierarchicalScopeTypeSpecnion(
                    this._propertiesGenerators,
                    typeSpec,
                    typeSpecDefaultsMap,
                    // potentiallly, here a local typespecnion with a typespec populated withh all the default values...
                );
                typeSpecnionChanged = true;
            }
        }
        if (typeSpecnionChanged) {
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `typeSpecProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }

    getPropertyValuesMap() {
        // returns  this._typeSpecnion._localPropertyValuesMap
        return this._typeSpecnion.getPropertyValuesMap();
    }
}

/**
 * This is to determine and cache the set of properties of a StylePatch.
 * for a SimpleStylePatch, this would not really be necessary, but the
 * CompositeStylePatch requires some rules and the result can be reused
 * by each StyleLink without re-processing.
 */
export class StylePatchSourceLiveProperties extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this.propertyValuesMap = null;

        // keys in a SimpleStylePatch are so far:
        //      baseFontSize, relativeFontSize, textColor,
        //      backgroundColor, axesLocations, autoOPSZ, activeFontKey,
        //      font, installedFonts

        this._propertiesGenerators = STYLE_PATCH_PROPERTIES_GENERATORS;
    }

    *_propertiesGenerator(simpleStylePatch) {
        for (const gen of this._propertiesGenerators.values()) {
            yield* gen(
                // outerTypespecnionAPI
                {
                    // keeping these for now so we can re-use generators
                    // from LocalScopeTypeSpecnion.*_propertiesGenerator
                    hasParentProtperty: () => false,
                    getParentProperty: (...args) => {
                        throw new Error(
                            `KEY ERROR ${this}.getParentProperty ${args.join(",     ")}`,
                        );
                    },
                    toString: () =>
                        `${this}._propertiesGenerator ${this.widgetBus.rootPath}`,
                },
                simpleStylePatch,
            );
        }
    }

    _resolveStylePatchRecursive(
        allStylePatchesMap,
        currentKeys,
        childResultsCache,
        stylePatch,
    ) {
        const typeKey = stylePatch.get("stylePatchTypeKey").value,
            instance = stylePatch.get("instance");
        if (typeKey === "SimpleStylePatch")
            return Array.from(this._propertiesGenerator(instance.wrapped));

        if (typeKey === "CompositeStylePatch") {
            const styleKeys = instance.get("styles"),
                result = [];
            for (const [, keyItem] of styleKeys) {
                const key = keyItem.value;
                let childResult;
                if (currentKeys.has(key))
                    // don't follow circular references
                    continue;
                if (childResultsCache.has(key))
                    childResult = childResultsCache.get(key);
                else if (allStylePatchesMap.has(key)) {
                    const childStylePatch = allStylePatchesMap.get(key),
                        currentChildKeys = new Set([...currentKeys, key]);
                    childResult = this._resolveStylePatchRecursive(
                        allStylePatchesMap,
                        currentChildKeys,
                        childResultsCache,
                        childStylePatch,
                    );
                    childResultsCache.set(key, childResult);
                } else {
                    // key is not in allStylePatchesMap, this may be because
                    // the key got renamed, and we don't currently automatically
                    // rename all references to the style patch. It would be
                    // interesting though, maybe optional behavior. The tracking
                    // of those references could be organized by a higher level
                    // component, rather than by the UI that changes the actual
                    // key.
                    childResult = [];
                    childResultsCache.set(key, childResult);
                }
                for (const item of childResult) {
                    result.push(item);
                }
            }
            return result;
        }
        throw new Error(
            `NOT IMPLEMENTED ${this}._getPropertyValuesMap ` +
                `don't know how to handle type "${typeKey}".`,
        );
    }

    _getPropertyValuesMap(stylePatch) {
        const allStylePatchesMap = this.getEntry("stylePatchesSource"),
            currentChildKeys = new Set(),
            childResultsCache = new Map();
        return new Map(
            this._resolveStylePatchRecursive(
                allStylePatchesMap,
                currentChildKeys,
                childResultsCache,
                stylePatch,
            ),
        );
    }

    update(changedMap) {
        const stylePatch = changedMap.has("stylePatch")
                ? changedMap.get("stylePatch")
                : this.getEntry("stylePatch"),
            requireUpdate =
                changedMap.has("stylePatch") ||
                (changedMap.has("stylePatchesSource") &&
                    stylePatch.get("stylePatchTypeKey").value ===
                        "CompositeStylePatch");
        if (requireUpdate) {
            this.propertyValuesMap = this._getPropertyValuesMap(stylePatch);
            // This updates (subsequent) subscribers.
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `stylePatchProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }
}

export class StyleLinkLiveProperties extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this._typeSpecnion = null;
        this.propertyValuesMap = null;
    }

    get typeSpecnion() {
        if (this._typeSpecnion === null)
            throw new Error(
                "LIFECYCLE ERROR this._typeSpecnion is null, must update initially first.",
            );
        return this._typeSpecnion;
    }

    update(changedMap) {
        // NOTE: stylePatchProperties@ is null initially
        // but it is not set if the link becomes invalid (which is IMO not
        // an initial update) the this function is called without 'stylePatchesSource@'
        // in the changedMap. FIXME: in that case the value changes from
        // a StylePatchSourceLiveProperties to null component, it would be
        // really good to have that in changedMap!
        // When it changes from null to a StylePatchSourceLiveProperties
        // it's in the changedMap!
        // This is only true if the linking is broken by changing the key in
        // stylePatchesSource. When setting a broken link in stylePatchLinksMap
        // null is reported each time. This is likely because that triggers
        // an initial update.
        // We could add a dependency to stylePatchesSource for an additional
        // hint.
        //
        // eventually, if we update styleLinkProperties@ regardless,
        // each time this method is called, it doesn't matter so much.

        // A StylePatchSourceLiveProperties
        const stylePatchProperties = changedMap.has("stylePatchProperties@")
                ? changedMap.get("stylePatchProperties@")
                : this.getEntry("stylePatchProperties@"),
            // A TypeSpecLiveProperties
            typeSpecProperties = changedMap.has("typeSpecProperties@")
                ? changedMap.get("typeSpecProperties@")
                : this.getEntry("typeSpecProperties@"),
            stylePatchPropertyValuesMap =
                stylePatchProperties !== null
                    ? stylePatchProperties.propertyValuesMap
                    : new Map(),
            // NOTE stylePatchPropertyValuesMap.size can be 0 even if it
            // comes from stylePatchProperties.propertyValuesMap. The
            // default behavior of a style patch is to set nothing.
            newTypeSpecnion =
                stylePatchPropertyValuesMap.size !== 0
                    ? typeSpecProperties.typeSpecnion.createPatched(
                          stylePatchProperties.propertyValuesMap,
                      )
                    : typeSpecProperties.typeSpecnion;
        if (this._typeSpecnion !== newTypeSpecnion) {
            // console.log(`styleLinkProperties@ ${this.widgetBus.rootPath} new typeSpecnion`, newTypeSpecnion, this);
            this._typeSpecnion = newTypeSpecnion;
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `styleLinkProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }

    getPropertyValuesMap() {
        return this._typeSpecnion.getPropertyValuesMap();
    }
}

class StylePatchSourcesMeta extends _BaseDynamicMapContainerComponent {
    // NOTE: in here we could probably handle changed as changed just fine.
    // I'm not sure if it would be an optimization though, however,
    // so far _BaseDynamicMapContainerComponent raises if HANDLE_CHANGED_AS_NEW
    // is not true a NOT IMPLEMENTED ERROR.
    [HANDLE_CHANGED_AS_NEW] = true;
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        return [
            {
                rootPath,
                "stylePatchProperties@": rootPath.toString(),
            },
            [
                [".", "stylePatch"],
                [
                    this.widgetBus.getExternalName("collection"),
                    "stylePatchesSource",
                ],
            ],
            StylePatchSourceLiveProperties,
        ];
    }
    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus,
            // , args = [this._zones]
            [settings, dependencyMappings, Constructor, ...args] =
                this._getWidgetSetup(rootPath);
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
}

class TypeSpecChildrenMeta extends _BaseDynamicMapContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
    constructor(
        widgetBus,
        zones,
        typeSpecPropertiesGenerators,
        isInheritingPropertyFn,
        widgets = [],
    ) {
        super(widgetBus, zones, widgets);
        this._typeSpecPropertiesGenerators = typeSpecPropertiesGenerators;
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        return [
            {
                rootPath,
            },
            [
                [".", "typeSpec"],
                // parent is always two levels above from here
                // as this is children/{index}
                [
                    `typeSpecProperties@${rootPath.append("..", "..")}`,
                    "@parentProperties",
                ],
                [
                    this.widgetBus.getExternalName("stylePatchesSource"),
                    "stylePatchesSource",
                ],
            ],
            TypeSpecMeta,
            this._zones,
            this._typeSpecPropertiesGenerators,
            this._isInheritingPropertyFn,
        ];
    }
    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus,
            // , args = [this._zones]
            [settings, dependencyMappings, Constructor, ...args] =
                this._getWidgetSetup(rootPath);
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
}

class StyleLinksMeta extends _BaseDynamicMapContainerComponent {
    // important here, as we use the value of each entry in the path
    // of the stylePatchProperties@
    [HANDLE_CHANGED_AS_NEW] = true;
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        // console.log(`${this}._getWidgetSetup rootPath: ${rootPath}`); // /activeState/typeSpec/stylePatches/bold
        const stylePatchesSourcePath = Path.fromString(
                this.widgetBus.getExternalName("stylePatchesSource"),
            ),
            keyItem = this.getEntry(rootPath),
            key = keyItem.value;
        // key is an empty string in case of (NULL-STYLE)
        // in case key is not in stylePatchesSource ("miracle"):
        // "bold" is available
        return [
            {
                rootPath,
                "styleLinkProperties@": rootPath.toString(),
            },
            [
                [
                    `stylePatchProperties@${stylePatchesSourcePath.append(key)}`,
                    `stylePatchProperties@`,
                ],
                [
                    `typeSpecProperties@${rootPath.append("..", "..")}`,
                    "typeSpecProperties@",
                ],
            ],
            StyleLinkLiveProperties,
        ];
    }
    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus,
            // , args = [this._zones]
            [settings, dependencyMappings, Constructor, ...args] =
                this._getWidgetSetup(rootPath);
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
}

/**
 * It's smarter to build the AnimationLiveProperties (and possibly other "meta data")
 * structure independent from StageHTML, as we may have different rendereing
 * targets, but the property propagation can and should be shared across.
 * Also, having the animationProperties@ registry relative to the top controller
 * of this module -- i.e. global -- makes this simple.
 */
export class TypeSpecMeta extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        typeSpecPropertiesGenerators,
        isInheritingPropertyFn = null,
        typeSpecDefaultsMap = null,
    ) {
        const widgets = [
            [
                {
                    "typeSpecProperties@": widgetBus.rootPath.toString(),
                },
                [
                    ...widgetBus.wrapper.getDependencyMapping(
                        widgetBus.wrapper.constructor.DEPENDECIES_ALL,
                    ),
                ],
                TypeSpecLiveProperties,
                typeSpecPropertiesGenerators,
                isInheritingPropertyFn,
                typeSpecDefaultsMap,
            ],
            [
                {},
                [
                    [
                        widgetBus.getExternalName("stylePatchesSource"),
                        "stylePatchesSource",
                    ],
                    ["stylePatches", "collection"],
                ],
                StyleLinksMeta,
                zones,
            ],
            [
                {},
                [
                    ["children", "collection"],
                    [
                        widgetBus.getExternalName("stylePatchesSource"),
                        "stylePatchesSource",
                    ],
                ],
                TypeSpecChildrenMeta,
                zones,
                typeSpecPropertiesGenerators,
                isInheritingPropertyFn,
                [], // widgets
            ],
        ];
        super(widgetBus, zones, widgets);
    }
}

class GenericUpdater extends _BaseComponent {
    constructor(widgetBus, updateHandlerFn) {
        super(widgetBus);
        this._updateHandlerFn = updateHandlerFn;
    }
    update(changedMap) {
        return this._updateHandlerFn(changedMap);
    }
}

// I'm unsure about this, as the parent node can (and probably should from
// time to time) call normalize() and then this.node may become disconnected.
// I.e. this part of the model may be better handled directly in UIDocumentTextRuns
// or UIDocumentSegment than with it's own component.
//
// maybe only to receive updates?
//     styleLinkProperties@
class UIDocumentTextRun extends _BaseContainerComponent {
    constructor(widgetBus, zones, originTypeSpecPath, documentRootPath) {
        super(widgetBus, zones);
        this.node = this._domTool.createTextNode("(initializing)");
        this.widgetBus.insertDocumentNode(this.node);
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._stylerWrapper = null;
        const widgets = [
            [
                {},
                [
                    //    'styleLink',
                    "text",
                    //, [this.widgetBus.getExternalName('typeSpecLink') ,'typeSpecLink']
                ],
                GenericUpdater,
                this._updateNode.bind(this),
            ],
        ];
        this._initWidgets(widgets);
    }

    _updateNode(changedMap) {
        if (changedMap.has("text")) {
            const { Node } = this._domTool.window,
                text = changedMap.get("text").value;
            if (this.node.nodeType === Node.TEXT_NODE)
                this.node.data = text; // it's an element
            else this.node.textContent = text;
        }
    }

    // _getStyleLinkProperties() {
    //     // => StyleLinkLivePropertiesPath
    //     const styleLinkItem = this.getEntry('styleLink');
    //     if(styleLinkItem.isEmpty)
    //         return null;
    //     const styleLink = styleLinkItem.value
    //         // this should be the same as in the parent DocumentElement
    //         // I wonder if I could pass this down. However, it can change,
    //         // and this way we update on change!
    //       , typeSpecPath = this._getBestTypeSpecPath()
    //       , styleLinkPropertiesId = `styleLinkProperties@${Path.fromParts(typeSpecPath, 'stylePatches', styleLink)}`
    //       , protocolHandlerImplementation = this.widgetBus.getProtocolHandlerImplementation('styleLinkProperties@', null)
    //       ;
    //     if(protocolHandlerImplementation === null)
    //         throw new Error(`KEY ERROR ProtocolHandler for identifier "styleLinkProperties@" not found.`);
    //     // check if styleLinkPropertiesId exists, otherwise return null
    //     if(protocolHandlerImplementation.hasRegistered(styleLinkPropertiesId))
    //         return styleLinkPropertiesId;
    //     return null;
    // }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;
    _getPathOfTypes = UIDocumentElement.prototype._getPathOfTypes;

    _swapNode(newNode) {
        if (this.node.parentElement)
            this.node.parentElement.replaceChild(newNode, this.node);
        this.node = newNode;
    }

    _setNodeToTextNode() {
        const text = this.getEntry("text").value,
            textNode = this._domTool.createTextNode(text);
        this._swapNode(textNode);
    }

    _setNodeToElement(styleName) {
        const text = this.getEntry("text").value,
            element = this._domTool.createElement("span", {}, text);
        if (styleName !== null)
            element.setAttribute("data-style-name", styleName);
        this._swapNode(element);
    }

    _createStylerWrapper(styleLinkProperties, styleName = null) {
        const { Node } = this._domTool.window;
        if (styleLinkProperties === null) {
            // node to textNode
            if (this.node.nodeType !== Node.TEXT_NODE)
                this._setNodeToTextNode();
            return null;
        }

        // FIXME: this might also be different for the linked style
        // e.g. for a null-style we might not want to have an element?
        // probably, we want to have an element.
        // ALSO: the tag will probably become determined via the style...
        // a callback from the styler could do the trick!
        if (this.node.nodeType !== Node.ELEMENT_NODE)
            this._setNodeToElement(styleName);

        // node to element
        const settings = {},
            dependencyMappings =
                styleLinkProperties === null
                    ? []
                    : [
                          [styleLinkProperties, "properties@"],
                          ["/font", "rootFont"],
                      ],
            Constructor =
                styleLinkProperties === null
                    ? UIDocumentUnkownStyleStyler
                    : UIDocumentStyleStyler,
            args = [this.node];
        return this._initWrapper(
            this._childrenWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _getStyleLinkPropertiesId(typeSpecPropertiesPath, styleLink) {
        const styleLinkPropertiesId = `styleLinkProperties@${typeSpecPropertiesPath.append("stylePatches", styleLink)}`,
            protocolHandlerImplementation =
                this.widgetBus.getProtocolHandlerImplementation(
                    "styleLinkProperties@",
                    null,
                );
        if (protocolHandlerImplementation === null)
            throw new Error(
                `KEY ERROR ProtocolHandler for identifier "styleLinkProperties@" not found.`,
            );
        // check if styleLinkPropertiesId exists, otherwise return null
        if (protocolHandlerImplementation.hasRegistered(styleLinkPropertiesId))
            return styleLinkPropertiesId;
        return null;
        // throw new Error(`KEY ERROR styleLinkPropertiesId "${styleLinkPropertiesId}" not found in styleLinkProperties@.`);
    }

    _getStyleName(node) {
        const marksList = node.get("marks");
        for (const mark of marksList.value) {
            const markType = mark.get("typeKey").value;
            if (markType !== "generic-style") continue;
            const attrs = mark.get("attrs");
            if (!attrs.has("data-style-name")) continue;
            const styleNameAttr = attrs.get("data-style-name");
            if (styleNameAttr.get("type").value !== "string") continue;
            return styleNameAttr.get("string").value;
        }
        return null;
    }

    _provisionWidgets(...args /* compareResult */) {
        // 0, -1: don't include the current "text" type
        const pathOfTypes = this._getPathOfTypes(this.widgetBus.rootPath).slice(
                0,
                -1,
            ),
            typeSpecPropertiesPath = this._getTypeSpecPropertiesId(
                pathOfTypes,
                true /*asPath*/,
            ),
            node = this.getEntry("."),
            styleName = this._getStyleName(node),
            styleLinkPropertiesId =
                styleName === null
                    ? null
                    : this._getStyleLinkPropertiesId(
                          typeSpecPropertiesPath,
                          styleName,
                      ),
            oldId =
                this._stylerWrapper !== null
                    ? this._widgets.indexOf(this._stylerWrapper)
                    : -1;
        if (oldId === -1) {
            // inital
            this._stylerWrapper = this._createStylerWrapper(
                styleLinkPropertiesId,
                styleName,
            );
            if (this._stylerWrapper !== null)
                this._widgets.splice(0, 0, this._stylerWrapper);
        } else {
            const oldWrapper = this._widgets[oldId];
            if (
                oldWrapper.dependencyReverseMapping.get(
                    "styleLinkProperties@",
                ) !== styleLinkPropertiesId
            ) {
                const newWrapper = this._createStylerWrapper(
                    styleLinkPropertiesId,
                    styleName,
                );
                if (newWrapper === null) this._widgets.splice(oldId, 1);
                else this._widgets.splice(oldId, 1, newWrapper);
                oldWrapper.destroy();
                this._stylerWrapper = newWrapper;
            }
        }
        return super._provisionWidgets(...args);
    }
}

export class UIDocumentElementTypeSpecDropTarget extends _BaseDropTarget {
    static BASE_CLASS = "ui_document_element_typespec";

    constructor(widgetBus, applicableTypes, element) {
        super(
            widgetBus,
            null /*effectLabel*/,
            null /*effectLabel*/,
            applicableTypes,
        );
        this._addEventListeners(element);
        this.element = element;
    }

    initTemplate() {
        /*pass*/
        return [];
    }

    _dropHandlerImplementation(event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if (!take) return;
        return this._changeState(() => {
            const typeSpecLink = this.getEntry("typeSpecLink");
            typeSpecLink.value = event.dataTransfer.getData(type);
            // if anything needs to change immediately, here would be
            // a chance to invoke a callback. OR, maybe, a CoherenceFunction
        });
    }
}

class ProseMirrorGeneralDocumentStyler extends _BaseComponent {
    update(changedMap) {
        const element = this.widgetBus.getWidgetById("proseMirror").element;
        const propertyValuesMap = (
            changedMap.has("properties@")
                ? changedMap.get("properties@")
                : this.getEntry("properties@")
        ).typeSpecnion.getProperties();

        if (changedMap.has("properties@")) {
            const outerColorPropertiesMap = [
                    [`${COLOR}backgroundColor`, "background-color"],
                ],
                getDefault = (property) => {
                    return [true, getRegisteredPropertySetup(property).default];
                };
            actorApplyCSSColors(
                element,
                propertyValuesMap,
                getDefault,
                outerColorPropertiesMap,
            );
            setLanguageTag(element, propertyValuesMap);
            // NOTE: apply paddings (use padding instead of margins)
            // especially left and top, but ideally also right and bottom
            // This is because we don't apply styles directly to the actual
            // document element, but rather to the parent of that. (.prosemirror-host)
            // i.e the element in here is a lot like the outerElement.
            //
            // NOTE: it could be worth to try to treat the actual .ProseMirror
            // document like the innerElement.
        }
    }
}

// This should inject it's own e.g. <p> element.
// It's interesting, the "nodesContainer" might have to change when the
// typeSpec changes! Thus, creating nodesContainer in the constructor might
// be not ideal. Definitely must look at the 'node'/'typeSpec@' in update.
//
// We could just copy all the content nodes when we change the nodesContainer,
// a child, thus, should not save the parent container ever.
// Interesting how/if insertElement plays along.

class UIDocumentElement extends _BaseContainerComponent {
    constructor(
        widgetBus,
        _zones,
        originTypeSpecPath,
        documentRootPath,
        baseClass = "typeroof-document-element",
    ) {
        const zones = new Map(_zones);
        super(widgetBus, zones);

        // figure out the ta of the element
        const current = this.getEntry("."),
            typeKey = current.get("typeKey").value,
            nodeSpecMap = this.getEntry("nodeSpec");
        let tag = "div"; // default
        if (nodeSpecMap.has(typeKey)) {
            // FIXME: must update when this.typeKey or nodeSpec[typeKey] changes!
            const nodeSpec = nodeSpecMap.get(typeKey);
            tag = nodeSpec.get("tag", { value: tag }).value;
        }
        const localContainer = widgetBus.domTool.createElement(tag, {
            class: `${baseClass}`,
        });
        zones.set("local", localContainer);

        this.node = localContainer;
        // localContainer.addEventListener('click', this._handleClick.bind(this));
        this.nodesElement = localContainer;
        this.widgetBus.insertDocumentNode(this.node);

        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._typeSpecStylerWrapper = null;
        const widgets = [
            // [
            //     {}
            //   , [
            //         'typeSpecLink'
            //     ]
            //   , UIDocumentElementTypeSpecDropTarget
            //   , [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH]
            //   , this.node // CAUTION REQUIRES UPDATE IF NODE CHANGES
            // ]
            [
                {},
                [
                    ["./content", "collection"],
                    [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                    [
                        this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                        "nodeSpecToTypeSpec",
                    ],
                ],
                UIDocumentNodes,
                this._zones,
                this.nodesElement,
                originTypeSpecPath,
                documentRootPath,
            ],
        ];
        this._initWidgets(widgets);
    }

    // Just a transformation of the metamodel document, to
    // see the synchronization of the prosemirror document in action.
    // _handleClick(/*event*/) {
    //     this._changeState(()=>{
    //         const parent = this.getEntry(this.widgetBus.rootPath.parent)// a 'content' list
    //           , key = this.widgetBus.rootPath.parts.at(-1)
    //           , self = parent.get(key)
    //         parent.splice(key, 0, self);// insert self, i.e. as a copy.
    //     });
    // }

    _getTypeSpecPropertiesId = getTypeSpecPropertiesIdMethod;

    _createTypeSpecStylerWrapper(typeSpecProperties) {
        const settings = {},
            dependencyMappings = [
                [typeSpecProperties, "properties@"],
                ["/font", "rootFont"],
            ],
            Constructor = UIDocumentTypeSpecStyler,
            args = [this.node, this.node];
        return this._initWrapper(
            this._childrenWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _getPathOfTypes(localPath) {
        const pathOfTypes = [];
        let currentPath = localPath;
        do {
            const current = this.getEntry(currentPath);
            pathOfTypes.unshift(current.get("typeKey").value);
            currentPath = currentPath.parent.parent;
        } while (currentPath.startsWith(this._documentRootPath));
        return pathOfTypes;
    }

    _provisionWidgets(/* compareResult */) {
        // if typeSpecLink has changed or if typeSpecProperties@ of id: 'type-spec-styler' does not exist
        //       get an existing typeSpecProperties@ for the new value
        //       existing means got back to root. originTypeSpecPath will exist
        //
        // if new typeSpecProperties !== old typeSpecProperties
        //       replace the widget
        //
        const pathOfTypes = this._getPathOfTypes(this.widgetBus.rootPath),
            typeSpecProperties = this._getTypeSpecPropertiesId(pathOfTypes),
            oldId =
                this._typeSpecStylerWrapper !== null
                    ? this._widgets.indexOf(this._typeSpecStylerWrapper)
                    : -1;
        if (oldId === -1) {
            // inital
            this._typeSpecStylerWrapper =
                this._createTypeSpecStylerWrapper(typeSpecProperties);
            this._widgets.splice(0, 0, this._typeSpecStylerWrapper);
        } else {
            const oldWrapper = this._widgets[oldId];
            if (
                oldWrapper.dependencyReverseMapping.get(
                    "typeSpecProperties@",
                ) !== typeSpecProperties
            ) {
                const newWrapper =
                    this._createTypeSpecStylerWrapper(typeSpecProperties);
                this._widgets.splice(oldId, 1, newWrapper);
                oldWrapper.destroy();
                this._typeSpecStylerWrapper = newWrapper;
            }
        }
        return super._provisionWidgets();
    }
}

class UIDocumentNode extends _BaseContainerComponent {
    constructor(widgetBus, zones, originTypeSpecPath, documentRootPath) {
        super(widgetBus, zones);
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._currentTypeKey = null;
    }

    _createWrapperForType(typeKey) {
        const settings = {
            rootPath: Path.fromParts("."),
            id: "contentWidget",
        };
        let Constructor, dependencyMappings;
        if (typeKey === "text") {
            dependencyMappings = [
                "text",
                [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                [
                    this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                    "nodeSpecToTypeSpec",
                ],
            ];
            Constructor = UIDocumentTextRun;
        } else {
            // if(typeKey === 'Element') {
            dependencyMappings = [
                ["./content", "nodes"],
                [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                [
                    this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                    "nodeSpecToTypeSpec",
                ],
            ];
            Constructor = UIDocumentElement;
        }
        //else
        //    throw new Error(`KEY ERROR unknown typeKey: "${typeKey}".`);

        const args = [
                this._zones,
                this._originTypeSpecPath,
                this._documentRootPath,
            ],
            childWidgetBus = this._childrenWidgetBus;
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }

    _provisionWidgets(/* compareResult */) {
        const nodes = this.getEntry(this.widgetBus.rootPath.parent),
            key = this.widgetBus.rootPath.parts.at(-1),
            node = nodes.get(key),
            typeKey = node.get("typeKey").value;
        if (this._currentTypeKey === typeKey) return new Set();
        this._currentTypeKey = typeKey;
        const newWrapper = this._createWrapperForType(typeKey),
            deleted = this._widgets.splice(0, Infinity, newWrapper);
        for (const wrapper of deleted) this._destroyWidget(wrapper);
        return super._provisionWidgets();
    }
}

// It's interesting on the one hand, each segment requires it's own
// control, e.g. to change the typeSpecLink, on the other hand,
// it requires the data to render properly, and that is very depending
// on the settings.
class UIDocumentNodes extends _BaseDynamicMapContainerComponent {
    // important here, as we use the value of each entry in the path
    // of the stylePatchProperties@
    constructor(
        widgetBus,
        zones,
        nodesElement,
        originTypeSpecPath,
        documentRootPath,
    ) {
        super(widgetBus, zones);
        this._nodesElement = nodesElement;
        this._nodeSlots = new Map();
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;

        // If I could/would override childWidgetBus.insertElement here, it
        // should be possible to improve management
        // but that would even trickle down as it's an inheritance...
        const insertNodeIntoSlot = this._insertNodeIntoSlot.bind(this);
        this._childrenWidgetBus.insertDocumentNode = function (node) {
            // "this" is the widgetBus of the component that actually calls
            // this! It's inherited. i.e. this.rootPath is for example for
            // an UIDocumentTextRun: /activeState/document/nodes/7/instance/nodes/0/instance
            insertNodeIntoSlot(this.nodeKey, node);
        };
    }

    /**
     * Assumptions
     *   - after initialization each nodeWidget, has a nodeWidget.node
     *   - each widget,in order before this, is completely initialized.
     *     by the time this method is called
     *   - the widget calling this is not yet completely intialized:
     *          this._keyToWidget.get(nodeKey).widget === null
     *
     * This would break if a node would call _insertNodeIntoSlot
     * multiple times (we don't do this yet). We could however
     * in that case change the interface to a beforeWidget.nodes = []
     * then insert after beforeWidget.nodes.at(-1)
     */
    _insertIntoSlot(collection, nodeKey, node) {
        const getNodeByIndex = (i) => {
            const key =
                    collection instanceof _AbstractListModel
                        ? `${i}`
                        : collection.keyOfIndex(i),
                nodeWidgetWrapper = this._keyToWidget.get(key);
            return nodeWidgetWrapper.widget.getWidgetWrapperById(
                "contentWidget",
                null,
            )?.widget?.node;
        };
        let keyIndex;
        if (collection instanceof _AbstractListModel) {
            const [index, message] = collection.keyToIndex(nodeKey);
            if (index === null) throw new Error(message);
            keyIndex = index;
        } else keyIndex = collection.indexOfKey(nodeKey);

        if (keyIndex < 0)
            throw new Error(
                `NOT FOUND ERROR don't know where to insert ` +
                    `${nodeKey} as it was not found in collection (${keyIndex}).`,
            );
        if (keyIndex === 0) {
            for (let i = keyIndex + 1; i < collection.size; i++) {
                const siblingNode = getNodeByIndex(i);
                if (
                    siblingNode &&
                    siblingNode.parentElement &&
                    siblingNode.parentElement === this._nodesElement
                ) {
                    siblingNode.parentElement.insertBefore(node, siblingNode);
                    return;
                }
            }
        } else {
            for (let i = keyIndex - 1; i < collection.size; i++) {
                const siblingNode = getNodeByIndex(i);
                if (
                    siblingNode &&
                    siblingNode.parentElement &&
                    siblingNode.parentElement === this._nodesElement
                ) {
                    // insertAfter => if there is no siblingNode.nextSibling ir behaves like append
                    siblingNode.parentElement.insertBefore(
                        node,
                        siblingNode.nextSibling,
                    );
                    return;
                }
            }
        }
        // no appropriate sibling that is in in the document was found
        // we have also local elements before (ui controls/meta)
        // so append seems the right choice.
        this._nodesElement.append(node);
    }

    /**
     * Via this meachic in place, we completely bypass the element management
     * of ComponentWrapper, which would be used via insertElement and would
     * make reinsert work, but also removal on destoy...
     * Hence, reordering and removal must be managed here as well!
     *      - we override _destroyWidget
     *      - we implement the optional _reorderChildren
     *
     * This doesn't keep a direct reference to the inserted nodes, that
     * way the widgets can themselves replace nodes.
     */
    _insertNodeIntoSlot(nodeKey, node) {
        const collection = this.getEntry("collection");
        this._insertIntoSlot(collection, nodeKey, node);
    }

    _reorderChildren(reorderReasons, reorderStartIndex) {
        if (!reorderReasons.has("changed")) return;
        const collection = this.getEntry("collection"),
            keys = Array.from(collection.keys()).slice(reorderStartIndex);
        for (const key of keys) {
            const nodeWidget = this._keyToWidget.get(key).widget,
                widgetWrapper = nodeWidget.getWidgetWrapperById(
                    "contentWidget",
                    null,
                ),
                node = widgetWrapper?.widget?.node;
            if (!node)
                // not initialized yet
                continue;
            this._insertIntoSlot(collection, key, node);
        }
    }

    _destroyWidget(widgetWrapper) {
        const node = widgetWrapper.widget.getWidgetById("contentWidget").node;
        this._nodesElement.removeChild(node);
        super._destroyWidget(widgetWrapper);
    }

    _createWrapper(rootPath) {
        const key = rootPath.parts.at(-1),
            settings = {
                rootPath: rootPath,
                nodeKey: key,
            },
            dependencyMappings = [
                [this.widgetBus.getExternalName("collection"), "collection"],
                [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                [
                    this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                    "nodeSpecToTypeSpec",
                ],
            ],
            Constructor = UIDocumentNode,
            args = [
                this._zones,
                this._originTypeSpecPath,
                this._documentRootPath,
            ],
            childWidgetBus = Object.create(this._childrenWidgetBus); // inherit
        childWidgetBus.nodeKey = key;
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
}

// Currently unused, but the way to render a document equivalent
// to the rendering of ProseMirror, without ProseMirror
export class UIDocument extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        originTypeSpecPath,
        baseClass = "typeroof-document",
    ) {
        const documentContainer = widgetBus.domTool.createElement("article", {
            class: baseClass,
        });
        widgetBus.insertElement(documentContainer);
        super(widgetBus, zones);
        this.nodesElement = documentContainer;
        const widgets = [
            [
                {},
                [
                    ["content", "collection"],
                    [this.widgetBus.getExternalName("nodeSpec"), "nodeSpec"],
                    [
                        this.widgetBus.getExternalName("nodeSpecToTypeSpec"),
                        "nodeSpecToTypeSpec",
                    ],
                ],
                UIDocumentNodes,
                this._zones,
                this.nodesElement,
                originTypeSpecPath,
                this.widgetBus.rootPath, // documentRootPath
            ],
        ];
        this._initWidgets(widgets);
    }
}

/**
 * This is basically the central control switchboard for the ProseMirror
 * integration. So far, especially the IDs are required by the components
 * to work and to interact.
 */
class ProseMirrorContext extends _BaseContainerComponent {
    static ID_MAP = Object.freeze({
        menu: "proseMirrorMenu",
        proseMirror: "proseMirror",
        subscriptions: "typeSpecSubscriptionsRegistry",
    });

    constructor(
        widgetBus,
        zones,
        proseMirrorSettings /* e.g. {zone:'layout'}*/,
        originTypeSpecPath,
        menuSettings /* e.g. {zone:'main'}*/,
    ) {
        super(widgetBus, zones, [
            [
                // IMPORTANT: must be before ProseMirror
                { ...menuSettings, id: new.target.ID_MAP.menu },
                [
                    // "stylePatchesSource",
                    // "typeSpec",
                    // "proseMirrorSchema",
                    "nodeSpecToTypeSpec",
                    // "document",
                ],
                UIProseMirrorMenu,
                originTypeSpecPath,
            ],
            [
                { ...proseMirrorSettings, id: new.target.ID_MAP.proseMirror },
                ["proseMirrorSchema", "document"],
                ProseMirror,
                proseMirrorDefaultSchema,
                new.target.ID_MAP,
            ],
            // My feeling is that there might be unnecessary invocation
            // of dom updates... i.e. when prosemirror initializes a node
            // and then directly after when the update reaches this component.
            // Maybe, it's possible to then skip the unnecessary update.
            //
            // At least, when prosemirror updates first, we potentially
            // don't update nodes in here that Prosemirror then deletes
            // so, this should come after ProseMirror, and ideally only
            // applying updates to the rest, where it is required still.
            [
                { id: new.target.ID_MAP.subscriptions },
                ["nodeSpecToTypeSpec", "typeSpec"],
                TypeSpecSubscriptions,
                zones,
                originTypeSpecPath,
            ],
            [
                {},
                [
                    [
                        `typeSpecProperties@${originTypeSpecPath.toString()}`,
                        "properties@",
                    ],
                ],
                ProseMirrorGeneralDocumentStyler,
            ],
        ]);
    }
}

const _skipPrefix = new Set([
    // This is very complicated as axesLocations have different default
    // values depending on the actual font. So if there's no font, there
    // can't be a value. This is why modelDefaultValue is injected, because
    // the caller may know a default value, but it may also not know, there's
    // no guarantee!
    "axesLocations/",
    OPENTYPE_FEATURES,
    LANGUAGE,
    // "font" is really the only case of this so far, there could
    // be the document font as a default maybe, as it cannot be not
    // set at all, hence it also must be loaded and available.
    SPECIFIC,
    // not yet thought through
    "stylePatches/",
]);
const _skipFullKey = new Set([
    // `${GENERIC}blockMargins`
]);
function _getTypeSpecDefaultsMap(typeSpecDependencies) {
    const defaultTypeSpec = (() => {
            const draft = TypeSpecModel.createPrimalDraft(typeSpecDependencies);
            for (const [fieldName, ppsRecord] of TYPESPEC_PPS_MAP) {
                if (_skipPrefix.has(ppsRecord.prefix)) continue;
                if (_skipFullKey.has(ppsRecord.fullKey)) continue;
                if (ppsRecord.prefix == COLOR) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        color = culoriToColor(defaultValue, draft.dependencies);
                    draft.set(fieldName, color);
                } else if (ppsRecord.prefix == LEADING) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        leading = deserializeLeadingAlgorithmModel(
                            draft.dependencies,
                            defaultValue,
                        );
                    draft.set(fieldName, leading);
                } else if (ppsRecord.fullKey === `${GENERIC}blockMargins`) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        margins = deserializeManualMarginsModel(
                            draft.dependencies,
                            defaultValue,
                        );
                    draft.set(fieldName, margins);
                } else {
                    const defaultValue = typeSpecGetDefaults(
                        () => null,
                        ppsRecord,
                        fieldName,
                    );
                    draft.get(fieldName).value = defaultValue;
                }
            }
            return draft.metamorphose();
        })(),
        properties = LocalScopeTypeSpecnion.propertiesGenerator(
            TYPE_SPEC_PROPERTIES_GENERATORS,
            defaultTypeSpec,
            new Map(),
        ),
        localPropertyValuesMap = LocalScopeTypeSpecnion.initPropertyValuesMap(
            properties,
            new Map(),
        ),
        typeSpecDefaultsMap = new FreezableMap(localPropertyValuesMap);
    Object.freeze(typeSpecDefaultsMap);
    return typeSpecDefaultsMap;
}

class TypeSpecRampController extends _BaseContainerComponent {
    constructor(widgetBus, _zones) {
        // BUT: we may need a mechanism to handle typeSpec inheritance!
        // widgetBus.wrapper.setProtocolHandlerImplementation(
        //    ...SimpleProtocolHandler.create('animationProperties@'));
        const typeSpecManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "type_spec-manager",
                },
            ),
            propertiesManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "properties-manager",
                },
            ),
            stylePatchesManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "style_patches-manager",
                },
            ),
            nodeSpecManagerContainer = widgetBus.domTool.createElement("div", {
                class: "node_spec-manager",
            }),
            // To have this first within editorManagerContainer.
            proseMirrorEditorMenuContainer = widgetBus.domTool.createElement(
                "div",
                { class: "editor-manager-prosemirror" },
            ),
            editorManagerContainer = widgetBus.domTool.createElement(
                "div",
                {
                    class: "editor-manager",
                },
                proseMirrorEditorMenuContainer,
            ),
            zones = new Map([
                ..._zones,
                ["type_spec-manager", typeSpecManagerContainer],
                ["properties-manager", propertiesManagerContainer],
                ["style_patches-manager", stylePatchesManagerContainer],
                ["node_spec-manager", nodeSpecManagerContainer],
                ["editor-manager", editorManagerContainer],
                ["prose-mirror-editor-menu", proseMirrorEditorMenuContainer],
            ]),
            typeSpecRelativePath = Path.fromParts(".", "typeSpec"),
            originTypeSpecPath = widgetBus.rootPath.append(
                ...typeSpecRelativePath,
            );
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create("typeSpecProperties@"),
        );

        // the source style patches
        widgetBus.wrapper.setProtocolHandlerImplementation(
            // does not raise when not found, instead returns null
            ...SimpleProtocolHandler.create("stylePatchProperties@", {
                notFoundFallbackValue: null,
            }),
        );

        // the linked stylePatchProperties@ plus typeSpecProperties@
        widgetBus.wrapper.setProtocolHandlerImplementation(
            ...SimpleProtocolHandler.create("styleLinkProperties@"),
        );
        // widgetBus.insertElement(stageManagerContainer);
        super(widgetBus, zones);

        const typeSpecDefaultsMap = _getTypeSpecDefaultsMap(
            widgetBus.getEntry(originTypeSpecPath).dependencies,
        );

        const widgets = [
            [
                {
                    rootPath: widgetBus.rootPath,
                },
                [["stylePatchesSource", "collection"]],
                StylePatchSourcesMeta,
                zones,
            ],
            [
                {
                    rootPath: typeSpecRelativePath,
                },
                [
                    [".", "typeSpec"],
                    [
                        widgetBus.rootPath
                            .append("stylePatchesSource")
                            .toString(),
                        "stylePatchesSource",
                    ],
                    // special, reqired only for the root instance
                    ["/font", "rootFont"],
                ],
                TypeSpecMeta,
                zones,
                TYPE_SPEC_PROPERTIES_GENERATORS,
                isInheritingPropertyFn,
                typeSpecDefaultsMap,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "Editor",
                editorManagerContainer,
                true,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "Styles",
                stylePatchesManagerContainer,
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "TypeSpecs",
                typeSpecManagerContainer,
            ],
            [
                {
                    zone: "type_spec-manager",
                },
                [],
                SelectAndDragByOptions,
                "Create",
                "", //'drag and drop into Rap-Editor.'
                [
                    // options [type, label, value]
                    [
                        DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE,
                        "Type Spec",
                        "TypeSpec",
                    ],
                ],
            ],
            [
                { zone: "type_spec-manager" },
                [
                    ["typeSpec/children", "activeActors"],
                    ["editingTypeSpec", "editingActor"],
                ],
                TypeSpecTreeEditor,
                {
                    // dataTransferTypes
                    PATH: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH,
                    CREATE: DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_CREATE,
                },
            ],
            [
                {
                    zone: "type_spec-manager",
                },
                [["typeSpec/children", "rootCollection"]],
                WasteBasketDropTarget,
                "Delete",
                "", //'drag and drop into trash-bin.'
                [DATA_TRANSFER_TYPES.TYPE_SPEC_TYPE_SPEC_PATH],
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "TypeSpec Properties",
                propertiesManagerContainer,
            ],
            [
                {},
                [
                    ["editingTypeSpec", "typeSpecPath"],
                    ["typeSpec/children", "children"],
                    ["typeSpec", "rootTypeSpec"],
                ],
                TypeSpecPropertiesManager,
                new Map([...zones, ["main", propertiesManagerContainer]]),
            ],
            [
                {
                    zone: "style_patches-manager",
                    relativeRootPath: Path.fromParts(".", "stylePatchesSource"),
                },
                [
                    [".", "childrenOrderedMap"],
                    ["../editingStylePatch", "stylePatchPath"],
                ],
                UIStylePatchesMap, // search for e.g. UIAxesMathLocation in videoproof-array-v2.mjs
                zones,
                [], // eventHandlers
                null, // label 'Style Patches'
                true, // dragAndDrop
            ],
            [
                {
                    zone: "style_patches-manager",
                },
                [["typeSpec/children", "rootCollection"]],
                WasteBasketDropTarget,
                "Delete",
                "", //'drag and drop into trash-bin.'
                [
                    DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_PATH,
                    DATA_TRANSFER_TYPES.TYPE_SPEC_STYLE_PATCH_LINK_PATH,
                    // to delete the axesLocations values coming from UIAxesMathLocation
                    DATA_TRANSFER_TYPES.AXESMATH_LOCATION_VALUE_PATH,
                ],
            ],
            [
                {
                    zone: "style_patches-manager",
                    relativeRootPath: Path.fromParts(".", "stylePatchesSource"),
                },
                [
                    [".", "childrenOrderedMap"],
                    ["../editingStylePatch", "stylePatchPath"],
                ],
                StylePatchPropertiesManager,
                new Map([...zones, ["main", stylePatchesManagerContainer]]),
            ],
            //  , [
            //        {
            //            zone: 'layout'
            //          , relativeRootPath: Path.fromParts('.','document')
            //        }
            //      , [
            //              ['../proseMirrorSchema/nodes', 'nodeSpec']
            //            , ['../nodeSpecToTypeSpec', 'nodeSpecToTypeSpec']
            //        ]
            //      , UIDocument
            //      , zones
            //      , originTypeSpecPath
            //    ]
            [
                {},
                [],
                ProseMirrorContext,
                zones,
                // proseMirrorSettings
                { zone: "layout" },
                originTypeSpecPath,
                // menuSettings
                { zone: "prose-mirror-editor-menu" },
            ],
            [
                { zone: "editor-manager" },
                [["showParameters", "value"]],
                UICheckboxInput,
                "show-parameters", // classToken
                getRegisteredPropertySetup(`${GENERIC}showParameters`).label, //label
            ],
            [
                { zone: "main" },
                [],
                Collapsible,
                "NodeSpecs",
                nodeSpecManagerContainer,
            ],
            [
                { zone: "node_spec-manager" },
                [
                    ["./proseMirrorSchema/nodes", "childrenOrderedMap"],
                    ["editingNodeSpecPath", "nodeSpecPath"],
                ],
                UINodeSpecMap,
                new Map([...zones, ["main", nodeSpecManagerContainer]]),
                [], // eventHandlers
                "NodeSpec-Map",
                true, // dragEntries (dragAndDrop)
            ],
            [
                {
                    zone: "node_spec-manager",
                },
                [
                    ["./proseMirrorSchema/nodes", "childrenOrderedMap"],
                    ["editingNodeSpecPath", "nodeSpecPath"],
                ],
                NodeSpecPropertiesManager,
                new Map([...zones, ["main", nodeSpecManagerContainer]]),
            ],
            [
                { zone: "node_spec-manager" },
                [
                    ["./nodeSpecToTypeSpec", "childrenOrderedMap"],
                    // In this configuration we map "NodeSpec to TypeSpec"
                    // The directionality is not necessarily obvious, but
                    // NodeSpec is the key as a nodeSpec can only have one
                    // TypeSpec, TypeSpec is the value as we can have multiple
                    // NodeSpecs use the same TypeSpec.
                    // However, the "TypeSpec" is called the "source", so
                    // source and target may not be the right words.
                    // sourceMap is inherited from UIStylePatchesLinksMap
                    // maybe we need to change that in here.
                    ["./typeSpec", "sourceMap"], // these are the values of the map
                    ["./proseMirrorSchema/nodes", "targetMap"], // these are the keys of the map
                ],
                // based on UIStylePatchesLinksMap
                UINodeSpecToTypeSpecLinksMap,
                new Map([...zones, ["main", nodeSpecManagerContainer]]),
                [], // eventHandlers
                "NodeSpec to TypeSpec",
                true, // dragEntries (dragAndDrop)
            ],
        ];
        this._initWidgets(widgets);
    }
    update(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("typeSpecProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("stylePatchProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("styleLinkProperties@")
            .resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("typeSpecProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("stylePatchProperties@")
            .resetUpdatedLog();
        this.widgetBus.wrapper
            .getProtocolHandlerImplementation("styleLinkProperties@")
            .resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export { TypeSpecRampModel as Model, TypeSpecRampController as Controller };
