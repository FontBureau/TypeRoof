import {
    _BaseComponent,
    _BaseContainerComponent,
} from "../../basics/component.mjs";
import { Path } from "../../../metamodel.mjs";
import {
    UIProseMirrorMenu,
    TypeSpecSubscriptions,
} from "../../prosemirror/type-spec.typeroof.jsx";
import {
    ProseMirror,
    getTypeSpecPropertiesIdMethod,
} from "../../prosemirror/integration.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchema } from "../../prosemirror/default-schema";

class UpdateLabelListener extends _BaseComponent {
    update(changedMap) {
        const element = this.widgetBus.getWidgetById(
                BaseProseMirrorContext.ID_MAP.proseMirror,
            ).element,
            showLabels = changedMap.get("showNodeTypeSpecLabels").value;
        element.classList[showLabels ? "add" : "remove"]("has-node-labels");
    }
}

/**
 * This is basically the central control switchboard for the ProseMirror
 * integration. So far, especially the IDs are required by the components
 * to work and to interact.
 */

export class BaseProseMirrorContext extends _BaseContainerComponent {
    static ID_MAP = Object.freeze({
        menu: "proseMirrorMenu",
        proseMirror: "proseMirror",
        subscriptions: "typeSpecSubscriptionsRegistry",
    });
}

export class RampProseMirrorContext extends BaseProseMirrorContext {
    constructor(
        widgetBus,
        zones,
        proseMirrorSettings,
        originTypeSpecPath,
        menuSettings,
        proseMirrorHostElement = null,
    ) {
        super(widgetBus, zones, [
            [
                // IMPORTANT: must be before ProseMirror
                { id: new.target.ID_MAP.menu },
                [],
                UIProseMirrorMenu,
                zones,
                originTypeSpecPath,
                menuSettings,
            ],
            [
                { ...proseMirrorSettings, id: new.target.ID_MAP.proseMirror },
                [
                    "proseMirrorSchema",
                    "document",
                    "nodeSpecToTypeSpec",
                    "editingTypeSpec",
                ],
                ProseMirror,
                proseMirrorDefaultSchema,
                new.target.ID_MAP,
                originTypeSpecPath,
                ["editor-advanced", "has-node-labels"],
                proseMirrorHostElement,
            ],
            [
                { id: new.target.ID_MAP.subscriptions },
                ["nodeSpecToTypeSpec", "typeSpec", "document"],
                TypeSpecSubscriptions,
                zones,
                originTypeSpecPath,
                { typeSpecLabels: true } /*nodeOutfitterOptions*/,
            ],
            // NOTE: document-level styling (backgroundColor, language
            // tag) of the editor pane is applied by
            // TypeStagePaneStyler (registered in RampController).
        ]);
    }
}

export class TypeStageProseMirrorContext extends BaseProseMirrorContext {
    constructor(
        widgetBus,
        zones,
        proseMirrorSettings /* e.g. {zone:'layout'}*/,
        originTypeSpecPath,
        menuSettings /* e.g. {zone:'main'}*/,
        proseMirrorHostElement,
    ) {
        super(widgetBus, zones, [
            [
                // IMPORTANT: must be before ProseMirror
                { id: new.target.ID_MAP.menu },
                [],
                UIProseMirrorMenu,
                zones,
                originTypeSpecPath,
                menuSettings,
            ],
            [
                { ...proseMirrorSettings, id: new.target.ID_MAP.proseMirror },
                [
                    "proseMirrorSchema",
                    "document",
                    "nodeSpecToTypeSpec",
                    "editingTypeSpec",
                ],
                ProseMirror,
                proseMirrorDefaultSchema,
                new.target.ID_MAP,
                originTypeSpecPath,
                ["editor-advanced"],
                proseMirrorHostElement,
            ],
            [{}, ["showNodeTypeSpecLabels"], UpdateLabelListener],
            [
                { id: new.target.ID_MAP.subscriptions },
                ["nodeSpecToTypeSpec", "typeSpec", "document"],
                TypeSpecSubscriptions,
                zones,
                originTypeSpecPath,
                {
                    // The argument is the dependency-enforcing getEntry
                    // injected into the activationTest (see
                    // ComponentWrapper._activationTestGetEntry).
                    typeSpecLabels: (getEntry) =>
                        getEntry("showNodeTypeSpecLabels").value,
                } /*nodeOutfitterOptions*/,
            ],
            // NOTE: the document-level styling (backgroundColor,
            // language tag) for the editor pane is applied by
            // TypeStagePaneStyler (registered in TypeStageController),
        ]);
    }
}
