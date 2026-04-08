import { _BaseContainerComponent } from "../../basics.mjs";
import { UIDocumentNodes } from "./ui-document-nodes.typeroof.jsx";

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
