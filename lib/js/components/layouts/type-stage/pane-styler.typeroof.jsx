import { _BaseComponent } from "../../basics/component.mjs";
import { COLOR, GENERIC } from "../../registered-properties-definitions.mjs";
import { getRegisteredPropertySetup } from "../../registered-properties.mjs";
import {
    actorApplyCSSColors,
    actorApplyCssProperties,
} from "../../actors/properties-util.mjs";
import { setLanguageTag } from "../../language-tags.typeroof.jsx";

/**
 * Applies the type-stage layout-level document surface styling to a
 * pane element — the editor's .ui_prosemirror_host or the viewer's
 * article.typeroof-document:
 *
 * - sizing: the LengthModel width/height fields, resolved against the
 *   'environment@' protocol. width must always be bound (coherence
 *   guarantees); height may be unset -> the pane grows to fit content
 *   (CSS min-height:100% on the pane covers the background-to-viewport
 *   requirement where sufficient). When height is set, content may
 *   overflow visibly.
 *
 * - document-level styling: backgroundColor and language tag from the
 *   properties@ protocol (document root typeSpecnion properties),
 *   mirroring what ProseMirrorGeneralDocumentStyler did for the editor
 *   pane only.
 *
 * Reacts to model changes (width/height/typeSpec edits), environment
 * changes (host resize) and properties@ updates.
 */
export class TypeStagePaneStyler extends _BaseComponent {
    constructor(widgetBus, paneElement) {
        super(widgetBus);
        this._paneElement = paneElement;
    }

    update(changedMap) {
        // Document-level styling (backgroundColor, language tag)
        if (changedMap.has("properties@")) {
            const propertyValuesMap = changedMap
                    .get("properties@")
                    .typeSpecnion.getProperties(),
                colorPropertiesMap = [
                    [`${COLOR}backgroundColor`, "background-color"],
                ],
                propertiesData = [
                    [`${GENERIC}availableWidth`, "width", "pt"],
                    [`${GENERIC}availableHeight`, "height", "pt"],
                ],
                getDefault = (property) => {
                    if (
                        property === `${GENERIC}availableWidth` ||
                        property === `${GENERIC}availableHeight`
                    ) {
                        return [false, ""];
                    }
                    return [true, getRegisteredPropertySetup(property).default];
                };
            actorApplyCSSColors(
                this._paneElement,
                propertyValuesMap,
                getDefault,
                colorPropertiesMap,
            );
            actorApplyCssProperties(
                this._paneElement,
                propertyValuesMap,
                getDefault,
                propertiesData,
            );

            setLanguageTag(this._paneElement, propertyValuesMap);
        }
    }
}
