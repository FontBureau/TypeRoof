import {
    _BaseDynamicMapContainerComponent,
    HANDLE_CHANGED_AS_NEW,
} from "../../basics.mjs";
import { Path } from "../../../metamodel.mjs";
import { StyleLinkLiveProperties } from "./style-link-live-properties.typeroof.jsx";

export class StyleLinksMeta extends _BaseDynamicMapContainerComponent {
    // important here, as we use the value of each entry in the path
    // of the stylePatchProperties@
    [HANDLE_CHANGED_AS_NEW] = true;
    constructor(widgetBus, zones) {
        super(widgetBus, zones);
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        // console.log(`${this}._getWidgetSetup rootPath: ${rootPath}`); // /activeState/typeSpec/stylePatches/bold
        const stylePatchesSourcePath = Path.fromString(
                this.widgetBus.getExternalName("stylePatchesSource"),
            ),
            keyItem = this.getEntry(rootPath),
            key = keyItem.value;
        // key is an empty string in case of (NULL-STYLE)
        // in case key is not in stylePatchesSource ("miracle"):
        // "bold" is available
        return [
            {
                rootPath,
                "styleLinkProperties@": rootPath.toString(),
            },
            [
                [
                    `stylePatchProperties@${stylePatchesSourcePath.append(key)}`,
                    `stylePatchProperties@`,
                ],
                [
                    `typeSpecProperties@${rootPath.append("..", "..")}`,
                    "typeSpecProperties@",
                ],
            ],
            StyleLinkLiveProperties,
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
