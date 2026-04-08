import { _BaseContainerComponent } from "../../basics.mjs";
import { Path } from "../../../metamodel.mjs";
import { UIDocumentTextRun } from "./ui-document-text-run.typeroof.jsx";
import { UIDocumentElement } from "./ui-document-element.typeroof.jsx";

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
