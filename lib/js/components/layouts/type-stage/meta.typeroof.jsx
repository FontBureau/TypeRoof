import {
    _BaseContainerComponent,
    _BaseDynamicMapContainerComponent,
    HANDLE_CHANGED_AS_NEW,
} from "../../basics/component.mjs";
import { Path } from "../../../metamodel.mjs";
import { getStyleLinks } from "../../registered-properties-definitions.mjs";
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

export class StyleLinksMeta extends _BaseContainerComponent {
    constructor(widgetBus, zones) {
        super(widgetBus, zones, []);
        this._keyToWidget = new Map();
        this._keyToEdge = new Map();
    }
    // required, otherwise with empty widgets, this won't receive updates.
    get dependencies() {
        const dependencies = super.dependencies;
        for (const externalName of this.widgetBus.wrapper.dependencyReverseMapping.values())
            dependencies.add(externalName);
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        for (const externalName of this.widgetBus.wrapper.dependencyMapping.keys())
            dependencies.add(externalName);
        return dependencies;
    }
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getWidgetSetup(rootPath, edge) {
        const stylePatchesSourcePath = Path.fromString(
                this.widgetBus.getExternalName("stylePatchesSource"),
            ),
            key = edge.get("stylePatch").value;
        // key is an empty string in case of NULL-STYLE (mode 'null-style')
        // or when the key is not in stylePatchesSource ("miracle"):
        // the style is available, but no patch is applied.
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
    _createWrapper(rootPath, edge) {
        const childWidgetBus = this._childrenWidgetBus,
            [settings, dependencyMappings, Constructor, ...args] =
                this._getWidgetSetup(rootPath, edge);
        return this._initWrapper(
            childWidgetBus,
            settings,
            dependencyMappings,
            Constructor,
            ...args,
        );
    }
    /**
     * Provision one StyleLinkLiveProperties per effective style-link edge
     * of this TypeSpec. Effective edges are carried by the typeSpecnion
     * properties stream (styleLinks/<key>), i.e. inherited edges are
     * included. Tombstoned keys are excluded by getStyleLinks, hence no
     * styleLinkProperties@ handler is registered for them and consumers
     * fall back to unknown-style handling ("the absence is the
     * inheritance").
     */
    _provisionWidgets(compareResult) {
        const requiresFullInitialUpdate = new Set();
        let typeSpecProperties;
        if (compareResult === undefined)
            // initial update (via _BaseContainerComponent.initialUpdate)
            typeSpecProperties = this.getEntry("typeSpecProperties@");
        else {
            const changedMap =
                this.widgetBus.wrapper.getChangedMapFromCompareResult(
                    compareResult.isInitial,
                    compareResult,
                );
            if (!changedMap.has("typeSpecProperties@"))
                return requiresFullInitialUpdate;
            typeSpecProperties = changedMap.get("typeSpecProperties@");
        }
        const effectiveLinks =
                typeSpecProperties === null
                    ? new Map()
                    : getStyleLinks(
                          typeSpecProperties.typeSpecnion.getProperties(),
                      ),
            deletedWidgets = new Set(this._widgets),
            newWidgets = [];
        for (const [key, edge] of effectiveLinks) {
            const currentWrapper = this._keyToWidget.get(key);
            if (
                currentWrapper !== undefined &&
                this._keyToEdge.get(key) === edge
            ) {
                // unchanged edge
                newWidgets.push(currentWrapper);
                deletedWidgets.delete(currentWrapper);
                continue;
            }
            // new or changed edge: (re)create the wrapper
            const widgetWrapper = this._createWrapper(
                this.widgetBus.rootPath.append("stylePatches", key),
                edge,
            );
            this._keyToWidget.set(key, widgetWrapper);
            this._keyToEdge.set(key, edge);
            newWidgets.push(widgetWrapper);
        }
        for (const widgetWrapper of deletedWidgets)
            this._destroyWidget(widgetWrapper);
        for (const key of this._keyToWidget.keys())
            if (!effectiveLinks.has(key)) {
                this._keyToWidget.delete(key);
                this._keyToEdge.delete(key);
            }
        this._widgets.splice(0, Infinity, ...newWidgets);
        for (const widgetWrapper of this._widgets) {
            if (widgetWrapper.widget === null) {
                this._createWidget(widgetWrapper);
                requiresFullInitialUpdate.add(widgetWrapper);
            }
        }
        return requiresFullInitialUpdate;
    }
    destroy() {
        super.destroy();
        this._keyToWidget.clear();
        this._keyToEdge.clear();
    }
}

export class TypeSpecChildrenMeta extends _BaseDynamicMapContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true;
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
                    [
                        `typeSpecProperties@${widgetBus.rootPath.toString()}`,
                        "typeSpecProperties@",
                    ],
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
