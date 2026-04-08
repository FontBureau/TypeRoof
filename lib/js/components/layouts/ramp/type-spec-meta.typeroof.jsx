import { _BaseContainerComponent } from "../../basics.mjs";
import { TypeSpecLiveProperties } from "./type-spec-live-properties.typeroof.jsx";
import { StyleLinksMeta } from "./style-links-meta.typeroof.jsx";
import { TypeSpecChildrenMeta } from "./type-spec-children-meta.typeroof.jsx";

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
