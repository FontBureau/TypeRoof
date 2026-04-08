import { _BaseContainerComponent } from "../../basics.mjs";
import {
    UIProseMirrorMenu,
    TypeSpecSubscriptions,
} from "../../prosemirror/type-spec.typeroof.jsx";
import { ProseMirror } from "../../prosemirror/integration.typeroof.jsx";
import { schemaSpec as proseMirrorDefaultSchema } from "../../prosemirror/default-schema";
import { ProseMirrorGeneralDocumentStyler } from "./prose-mirror-general-document-styler.typeroof.jsx";

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
