import { _BaseComponent } from "../../basics.mjs";
import { STYLE_PATCH_PROPERTIES_GENERATORS } from "./get-type-spec-defaults-map.mjs";

/**
 * This is to determine and cache the set of properties of a StylePatch.
 * for a SimpleStylePatch, this would not really be necessary, but the
 * CompositeStylePatch requires some rules and the result can be reused
 * by each StyleLink without re-processing.
 */
export class StylePatchSourceLiveProperties extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this.propertyValuesMap = null;

        // keys in a SimpleStylePatch are so far:
        //      baseFontSize, relativeFontSize, textColor,
        //      backgroundColor, axesLocations, autoOPSZ, activeFontKey,
        //      font, installedFonts

        this._propertiesGenerators = STYLE_PATCH_PROPERTIES_GENERATORS;
    }

    *_propertiesGenerator(simpleStylePatch) {
        for (const gen of this._propertiesGenerators.values()) {
            yield* gen(
                // outerTypespecnionAPI
                {
                    // keeping these for now so we can re-use generators
                    // from LocalScopeTypeSpecnion.*_propertiesGenerator
                    hasParentProtperty: () => false,
                    getParentProperty: (...args) => {
                        throw new Error(
                            `KEY ERROR ${this}.getParentProperty ${args.join(",     ")}`,
                        );
                    },
                    toString: () =>
                        `${this}._propertiesGenerator ${this.widgetBus.rootPath}`,
                },
                simpleStylePatch,
            );
        }
    }

    _resolveStylePatchRecursive(
        allStylePatchesMap,
        currentKeys,
        childResultsCache,
        stylePatch,
    ) {
        const typeKey = stylePatch.get("stylePatchTypeKey").value,
            instance = stylePatch.get("instance");
        if (typeKey === "SimpleStylePatch")
            return Array.from(this._propertiesGenerator(instance.wrapped));

        if (typeKey === "CompositeStylePatch") {
            const styleKeys = instance.get("styles"),
                result = [];
            for (const [, keyItem] of styleKeys) {
                const key = keyItem.value;
                let childResult;
                if (currentKeys.has(key))
                    // don't follow circular references
                    continue;
                if (childResultsCache.has(key))
                    childResult = childResultsCache.get(key);
                else if (allStylePatchesMap.has(key)) {
                    const childStylePatch = allStylePatchesMap.get(key),
                        currentChildKeys = new Set([...currentKeys, key]);
                    childResult = this._resolveStylePatchRecursive(
                        allStylePatchesMap,
                        currentChildKeys,
                        childResultsCache,
                        childStylePatch,
                    );
                    childResultsCache.set(key, childResult);
                } else {
                    // key is not in allStylePatchesMap, this may be because
                    // the key got renamed, and we don't currently automatically
                    // rename all references to the style patch. It would be
                    // interesting though, maybe optional behavior. The tracking
                    // of those references could be organized by a higher level
                    // component, rather than by the UI that changes the actual
                    // key.
                    childResult = [];
                    childResultsCache.set(key, childResult);
                }
                for (const item of childResult) {
                    result.push(item);
                }
            }
            return result;
        }
        throw new Error(
            `NOT IMPLEMENTED ${this}._getPropertyValuesMap ` +
                `don't know how to handle type "${typeKey}".`,
        );
    }

    _getPropertyValuesMap(stylePatch) {
        const allStylePatchesMap = this.getEntry("stylePatchesSource"),
            currentChildKeys = new Set(),
            childResultsCache = new Map();
        return new Map(
            this._resolveStylePatchRecursive(
                allStylePatchesMap,
                currentChildKeys,
                childResultsCache,
                stylePatch,
            ),
        );
    }

    update(changedMap) {
        const stylePatch = changedMap.has("stylePatch")
                ? changedMap.get("stylePatch")
                : this.getEntry("stylePatch"),
            requireUpdate =
                changedMap.has("stylePatch") ||
                (changedMap.has("stylePatchesSource") &&
                    stylePatch.get("stylePatchTypeKey").value ===
                        "CompositeStylePatch");
        if (requireUpdate) {
            this.propertyValuesMap = this._getPropertyValuesMap(stylePatch);
            // This updates (subsequent) subscribers.
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `stylePatchProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }
}
