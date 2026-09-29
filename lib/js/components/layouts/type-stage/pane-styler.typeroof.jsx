import { _BaseComponent } from "../../basics/component.mjs";
import { CascadingMap } from "../../cascading-map.mjs";
import { COLOR, LAYOUT } from "../../registered-properties-definitions.mjs";
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
        // Document-level styling (backgroundColor, language tag) and
        // pane geometry (from the nodeProperties@ channel).
        if (
            changedMap.has("properties@") ||
            changedMap.has("nodeProperties@")
        ) {
            const typeSpecProperties = changedMap.has("properties@")
                    ? changedMap.get("properties@")
                    : this.getEntry("properties@"),
                // null until the root TypeSpecLiveProperties registers
                // (notFoundFallbackValue); the pane keeps its unset
                // width/height in that case.
                nodePropertiesEntry = changedMap.has("nodeProperties@")
                    ? changedMap.get("nodeProperties@")
                    : this.getEntry("nodeProperties@"),
                nodePropertiesMap =
                    nodePropertiesEntry === null
                        ? new Map()
                        : nodePropertiesEntry.nodeProperties.getProperties(),
                // Named-layer cascade like the node styler: node facts
                // win over style facts (geometry from the node channel
                // shadows any style-side remnant of the same key).
                propertyValuesMap = new CascadingMap([
                    ["node", nodePropertiesMap],
                    ["style", typeSpecProperties.typeSpecnion.getProperties()],
                ]),
                colorPropertiesMap = [
                    [`${COLOR}backgroundColor`, "background-color"],
                ],
                propertiesData = [
                    [`${LAYOUT}availableWidth`, "width", "pt"],
                    [`${LAYOUT}availableHeight`, "height", "pt"],
                ],
                getDefault = (property) => {
                    if (
                        property === `${LAYOUT}availableWidth` ||
                        property === `${LAYOUT}availableHeight`
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
