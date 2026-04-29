import { _BaseContainerComponent } from "../../basics.mjs";
import { GenericUpdater } from "./generic-updater.mjs";
import {
    getTypeSpecPropertiesIdMethod,
    UIDocumentStyleStyler,
    UIDocumentUnkownStyleStyler,
} from "../../prosemirror/type-spec.typeroof.jsx";
import { UIDocumentElement } from "./ui-document-element.typeroof.jsx";

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
