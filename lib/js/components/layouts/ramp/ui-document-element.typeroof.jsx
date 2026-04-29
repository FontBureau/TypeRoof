import { _BaseContainerComponent } from "../../basics.mjs";
import { UIDocumentNodes } from "./ui-document-nodes.typeroof.jsx";
import {
    UIDocumentTypeSpecStyler,
    getTypeSpecPropertiesIdMethod,
} from "../../prosemirror/type-spec.typeroof.jsx";

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
