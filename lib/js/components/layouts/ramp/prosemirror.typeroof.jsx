import {
    _BaseComponent,
    _BaseContainerComponent,
    _BaseDynamicMapContainerComponent,
} from "../../basics.mjs";
import { Path, _AbstractListModel } from "../../../metamodel.mjs";
import { COLOR } from "../../registered-properties-definitions.mjs";
import { actorApplyCSSColors } from "../../actors/properties-util.mjs";
import { getRegisteredPropertySetup } from "../../registered-properties.mjs";
import { setLanguageTag } from "../../language-tags.typeroof.jsx";
import { _BaseDropTarget } from "../../generic.mjs";
import {
    UIDocumentTypeSpecStyler,
    UIDocumentStyleStyler,
    UIDocumentUnkownStyleStyler,
    getTypeSpecPropertiesIdMethod,
    UIProseMirrorMenu,
    TypeSpecSubscriptions,
} from "../../prosemirror/type-spec.typeroof.jsx";
import { ProseMirror } from "../../prosemirror/integration.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchema } from "../../prosemirror/default-schema";

class GenericUpdater extends _BaseComponent {
    constructor(widgetBus, updateHandlerFn) {
        super(widgetBus);
        this._updateHandlerFn = updateHandlerFn;
    }
    update(changedMap) {
        return this._updateHandlerFn(changedMap);
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

// This should inject it's own e.g. <p> element.
// It's interesting, the "nodesContainer" might have to change when the
// typeSpec changes! Thus, creating nodesContainer in the constructor might
// be not ideal. Definitely must look at the 'node'/'typeSpec@' in update.
//
// We could just copy all the content nodes when we change the nodesContainer,
// a child, thus, should not save the parent container ever.
// Interesting how/if insertElement plays along.
export class UIDocumentElement extends _BaseContainerComponent {
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
        this.nodesElement = localContainer;
        this.widgetBus.insertDocumentNode(this.node);

        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._typeSpecStylerWrapper = null;
        const widgets = [
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

// I'm unsure about this, as the parent node can (and probably should from
// time to time) call normalize() and then this.node may become disconnected.
// I.e. this part of the model may be better handled directly in UIDocumentTextRuns
// or UIDocumentSegment than with it's own component.
//
// maybe only to receive updates?
//     styleLinkProperties@
export class UIDocumentTextRun extends _BaseContainerComponent {
    constructor(widgetBus, zones, originTypeSpecPath, documentRootPath) {
        super(widgetBus, zones);
        this.node = this._domTool.createTextNode("(initializing)");
        this.widgetBus.insertDocumentNode(this.node);
        this._originTypeSpecPath = originTypeSpecPath;
        this._documentRootPath = documentRootPath;
        this._stylerWrapper = null;
        const widgets = [
            [{}, ["text"], GenericUpdater, this._updateNode.bind(this)],
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
        if (protocolHandlerImplementation.hasRegistered(styleLinkPropertiesId))
            return styleLinkPropertiesId;
        return null;
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

export class UIDocumentNode extends _BaseContainerComponent {
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

// It's interesting on the one hand, each segment requires its own
// control, e.g. to change the typeSpecLink, on the other hand,
// it requires the data to render properly, and that is very depending
// on the settings.
export class UIDocumentNodes extends _BaseDynamicMapContainerComponent {
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

        const insertNodeIntoSlot = this._insertNodeIntoSlot.bind(this);
        this._childrenWidgetBus.insertDocumentNode = function (node) {
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
                    // insertAfter => if there is no siblingNode.nextSibling it behaves like append
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
     * Via this mechanism in place, we completely bypass the element management
     * of ComponentWrapper, which would be used via insertElement and would
     * make reinsert work, but also removal on destroy...
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
export class ProseMirrorContext extends _BaseContainerComponent {
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
                ["nodeSpecToTypeSpec"],
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
