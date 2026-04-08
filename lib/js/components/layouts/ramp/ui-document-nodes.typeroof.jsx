import { _BaseDynamicMapContainerComponent } from "../../basics.mjs";
import { _AbstractListModel } from "../../../metamodel.mjs";
import { UIDocumentNode } from "./ui-document-node.typeroof.jsx";

// It's interesting on the one hand, each segment requires it's own
// control, e.g. to change the typeSpecLink, on the other hand,
// it requires the data to render properly, and that is very depending
// on the settings.
export class UIDocumentNodes extends _BaseDynamicMapContainerComponent {
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
