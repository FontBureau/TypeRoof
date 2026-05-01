import {
    _BaseContainerComponent,
    _BaseDynamicMapContainerComponent,
    HANDLE_CHANGED_AS_NEW,
} from "../../basics.mjs";
import { Path } from "../../../metamodel.mjs";
import {
    TypeSpecLiveProperties,
    StylePatchSourceLiveProperties,
    StyleLinkLiveProperties,
} from "./live-properties.typeroof.jsx";

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

/**
 * It's smarter to build the AnimationLiveProperties (and possibly other "meta data")
 * structure independent from StageHTML, as we may have different rendereing
 * targets, but the property propagation can and should be shared across.
 * Also, having the animationProperties@ registry relative to the top controller
 * of this module -- i.e. global -- makes this simple.
 */
export class TypeSpecMeta extends _BaseContainerComponent {
    constructor(
        widgetBus,
        zones,
        typeSpecPropertiesGenerators,
        isInheritingPropertyFn = null,
        typeSpecDefaultsMap = null,
    ) {
        const widgets = [
            [
                {
                    "typeSpecProperties@": widgetBus.rootPath.toString(),
                },
                [
                    ...widgetBus.wrapper.getDependencyMapping(
                        widgetBus.wrapper.constructor.DEPENDECIES_ALL,
                    ),
                ],
                TypeSpecLiveProperties,
                typeSpecPropertiesGenerators,
                isInheritingPropertyFn,
                typeSpecDefaultsMap,
            ],
            [
                {},
                [
                    [
                        widgetBus.getExternalName("stylePatchesSource"),
                        "stylePatchesSource",
                    ],
                    ["stylePatches", "collection"],
                ],
                StyleLinksMeta,
                zones,
            ],
            [
                {},
                [
                    ["children", "collection"],
                    [
                        widgetBus.getExternalName("stylePatchesSource"),
                        "stylePatchesSource",
                    ],
                ],
                TypeSpecChildrenMeta,
                zones,
                typeSpecPropertiesGenerators,
                isInheritingPropertyFn,
                [], // widgets
            ],
        ];
        super(widgetBus, zones, widgets);
    }
}
