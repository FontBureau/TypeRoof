import { _BaseByPathContainerComponent } from "./base-by-path-container-component.typeroof.jsx";
import { StaticTag } from "../../generic.mjs";
import {
    StylePatchModel,
    getStylePatchFullLabel,
} from "../../type-spec-models.mjs";
import { UIStylePatch } from "./ui-style-patch.typeroof.jsx";

export class StylePatchPropertiesManager extends _BaseByPathContainerComponent {
    constructor(widgetBus, _zones) {
        super(
            widgetBus,
            _zones,
            "ui_style_patch-properties_manager", // className
            "stylePatchPath", // pathEntryName
            "childrenOrderedMap", // childrenMapEntryName
            "stylePatchTypeKey", // typeKeyName=null
        );
    }

    _createEmptyWrappers() {
        const widgets = [
            [{ zone: "local" }, [], StaticTag, "span", {}, "(Select a Style)"],
        ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }

    _createItemWrappers(stylePatchPath, item) {
        const TypeClass = item.constructor;
        if (TypeClass !== StylePatchModel)
            // NOTE: This check is not strictly required, it's
            // a sanity check to confirm.
            throw new Error(
                `TYPE ERROR expected StylePatchModel at path ${stylePatchPath} but instead got ${TypeClass.name}.`,
            );

        const typeKey = item.get(this._typeKeyName).value,
            label = getStylePatchFullLabel(typeKey),
            widgets = [
                [
                    {
                        zone: "local",
                    },
                    [],
                    StaticTag,
                    "h3",
                    {},
                    `Style: ${stylePatchPath.parts.at(-1)} – ${label}`,
                ],
                [
                    {
                        rootPath: stylePatchPath,
                        zone: "local",
                    },
                    [[this.widgetBus.rootPath.toString(), "sourceMap"]],
                    UIStylePatch,
                    this._zones,
                    stylePatchPath,
                ],
            ];
        // this._initWrapper(this._childrenWidgetBus, settings, dependencyMappings, Constructor, ...args);
        return widgets.map((widgetArgs) =>
            this._initWrapper(this._childrenWidgetBus, ...widgetArgs),
        );
    }
}
