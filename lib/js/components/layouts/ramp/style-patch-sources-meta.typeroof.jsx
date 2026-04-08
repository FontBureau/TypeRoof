import {
    _BaseDynamicMapContainerComponent,
    HANDLE_CHANGED_AS_NEW,
} from "../../basics.mjs";
import { StylePatchSourceLiveProperties } from "./style-patch-source-live-properties.typeroof.jsx";

export class StylePatchSourcesMeta extends _BaseDynamicMapContainerComponent {
    // NOTE: in here we could probably handle changed as changed just fine.
    // I'm not sure if it would be an optimization though, however,
    // so far _BaseDynamicMapContainerComponent raises if HANDLE_CHANGED_AS_NEW
    // is not true a NOT IMPLEMENTED ERROR.
    [HANDLE_CHANGED_AS_NEW] = true;
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        return [
            {
                rootPath,
                "stylePatchProperties@": rootPath.toString(),
            },
            [
                [".", "stylePatch"],
                [
                    this.widgetBus.getExternalName("collection"),
                    "stylePatchesSource",
                ],
            ],
            StylePatchSourceLiveProperties,
        ];
    }
    _createWrapper(rootPath) {
        const childWidgetBus = this._childrenWidgetBus,
            // , args = [this._zones]
            [settings, dependencyMappings, Constructor, ...args] =
                this._getWidgetSetup(rootPath);
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
}
