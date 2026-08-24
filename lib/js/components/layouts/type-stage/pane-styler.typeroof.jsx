import { _BaseComponent } from "../../basics/component.mjs";

import { lengthToCSSPX } from "../../length-models.mjs";
import { COLOR } from "../../registered-properties-definitions.mjs";
import { getRegisteredPropertySetup } from "../../registered-properties.mjs";
import { actorApplyCSSColors } from "../../actors/properties-util.mjs";
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
        const style = this._paneElement.style;

        // Sizing (width/height LengthModel fields x environment@layout)
        const environmentLayout = changedMap.has("environment@layout")
                ? changedMap.get("environment@layout")
                : this.getEntry("environment@layout"),
            width = changedMap.has("width")
                ? changedMap.get("width")
                : this.getEntry("width"),
            height = changedMap.has("height")
                ? changedMap.get("height")
                : this.getEntry("height"),
            environmentValues = { layout: environmentLayout },
            resolvedWidth = lengthToCSSPX(width, environmentValues, "width"),
            resolvedHeight = lengthToCSSPX(height, environmentValues, "height");

        if (resolvedWidth !== null)
            style.setProperty("width", `${resolvedWidth}px`);
        else style.removeProperty("width");

        if (resolvedHeight !== null)
            style.setProperty("height", `${resolvedHeight}px`);
        else style.removeProperty("height");

        // Document-level styling (backgroundColor, language tag)
        if (changedMap.has("properties@")) {
            const propertyValuesMap = changedMap
                    .get("properties@")
                    .typeSpecnion.getProperties(),
                outerColorPropertiesMap = [
                    [`${COLOR}backgroundColor`, "background-color"],
                ],
                getDefault = (property) => [
                    true,
                    getRegisteredPropertySetup(property).default,
                ];
            actorApplyCSSColors(
                this._paneElement,
                propertyValuesMap,
                getDefault,
                outerColorPropertiesMap,
            );
            setLanguageTag(this._paneElement, propertyValuesMap);
        }
    }
}
