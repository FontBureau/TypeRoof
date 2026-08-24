import { _AbstractEnumModel } from "../../metamodel.mjs";

// Choosing as base "Viewer" as default value as it has likely the least
// resource requirements.
export const DocumentRendererModeModel = _AbstractEnumModel.createClass(
    "DocumentRendererModeModel",
    ["editor", "viewer", "compare"],
    "viewer",
);

export class DocumentRendererModeDfltEditorModel extends DocumentRendererModeModel {
    static defaultValue = "editor";
}

export class DocumentRendererModeDfltCompareModel extends DocumentRendererModeModel {
    static defaultValue = "compare";
}
