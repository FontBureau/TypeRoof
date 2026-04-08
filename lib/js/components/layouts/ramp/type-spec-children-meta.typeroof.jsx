import {
    _BaseDynamicMapContainerComponent,
    HANDLE_CHANGED_AS_NEW,
} from "../../basics.mjs";
import { TypeSpecMeta } from "./type-spec-meta.typeroof.jsx";

export class TypeSpecChildrenMeta extends _BaseDynamicMapContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
    constructor(
        widgetBus,
        zones,
        typeSpecPropertiesGenerators,
        isInheritingPropertyFn,
        widgets = [],
    ) {
        super(widgetBus, zones, widgets);
        this._typeSpecPropertiesGenerators = typeSpecPropertiesGenerators;
        this._isInheritingPropertyFn = isInheritingPropertyFn;
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath) {
        return [
            {
                rootPath,
            },
            [
                [".", "typeSpec"],
                // parent is always two levels above from here
                // as this is children/{index}
                [
                    `typeSpecProperties@${rootPath.append("..", "..")}`,
                    "@parentProperties",
                ],
                [
                    this.widgetBus.getExternalName("stylePatchesSource"),
                    "stylePatchesSource",
                ],
            ],
            TypeSpecMeta,
            this._zones,
            this._typeSpecPropertiesGenerators,
            this._isInheritingPropertyFn,
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
