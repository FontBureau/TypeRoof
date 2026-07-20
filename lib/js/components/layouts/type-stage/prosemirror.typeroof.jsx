import {
    _BaseComponent,
    _BaseContainerComponent,
} from "../../basics/component.mjs";
import { Path } from "../../../metamodel.mjs";
import { COLOR } from "../../registered-properties-definitions.mjs";
import { actorApplyCSSColors } from "../../actors/properties-util.mjs";
import { getRegisteredPropertySetup } from "../../registered-properties.mjs";
import { setLanguageTag } from "../../language-tags.typeroof.jsx";
import {
    UIProseMirrorMenu,
    TypeSpecSubscriptions,
} from "../../prosemirror/type-spec.typeroof.jsx";
import {
    ProseMirror,
    getTypeSpecPropertiesIdMethod,
} from "../../prosemirror/integration.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchema } from "../../prosemirror/default-schema";

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
            // document element, but rather to the parent of that. (.ui_prosemirror_host)
            // i.e the element in here is a lot like the outerElement.
            //
            // NOTE: it could be worth to try to treat the actual .ProseMirror
            // document like the innerElement.
        }
    }
}

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
            ],
            [
                { id: new.target.ID_MAP.subscriptions },
                ["nodeSpecToTypeSpec", "typeSpec", "document"],
                TypeSpecSubscriptions,
                zones,
                originTypeSpecPath,
                { typeSpecLabels: true } /*nodeOutfitterOptions*/,
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

export class TypeStageProseMirrorContext extends BaseProseMirrorContext {
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
            ],
            [{}, ["showNodeTypeSpecLabels"], UpdateLabelListener],
            [
                { id: new.target.ID_MAP.subscriptions },
                ["nodeSpecToTypeSpec", "typeSpec", "document"],
                TypeSpecSubscriptions,
                zones,
                originTypeSpecPath,
                {
                    typeSpecLabels: () =>
                        this.getEntry("./showNodeTypeSpecLabels").value,
                } /*nodeOutfitterOptions*/,
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
