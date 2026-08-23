import { _BaseComponent } from "../../basics/component.mjs";

import { lengthToCSSPX } from "../../length-models.mjs";

/**
 * Applies the type-stage layout-level width/height (LengthModel fields,
 * resolved against the 'environment@' protocol) to a pane element —
 * the editor's .ui_prosemirror_host or the viewer's
 * article.typeroof-document.
 *
 * width must always be bound (coherence guarantees); height may be
 * unset -> the pane grows to fit content (CSS min-height:100% on the
 * pane covers the background-to-viewport requirement where sufficient).
 * When height is set, content may overflow visibly.
 *
 * Reacts to both model changes (width/height edits) and environment
 * changes (host resize), because it declares 'environment@layout' as a
 * dependency.
 */
export class TypeStagePaneStyler extends _BaseComponent {
    constructor(widgetBus, paneElement) {
        super(widgetBus);
        this._paneElement = paneElement;
    }

    update(changedMap) {
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
            resolvedHeight = lengthToCSSPX(height, environmentValues, "height"),
            style = this._paneElement.style;

        if (resolvedWidth !== null)
            style.setProperty("width", `${resolvedWidth}px`);
        else style.removeProperty("width");

        if (resolvedHeight !== null)
            style.setProperty("height", `${resolvedHeight}px`);
        else style.removeProperty("height");
    }
}
