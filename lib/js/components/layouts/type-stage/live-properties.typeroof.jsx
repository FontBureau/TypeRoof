import { zip } from "../../../util.mjs";
import { _BaseComponent } from "../../basics/component.mjs";
import { SPECIFIC, LAYOUT } from "../../registered-properties-definitions.mjs";
import { HierarchicalScopeTypeSpecnion } from "./type-specnion.mjs";
import { pathSpecValuesFromObjectGen } from "./synthetic-values.mjs";
import { STYLE_PATCH_PROPERTIES_GENERATORS } from "./properties-generators.mjs";
import {
    HierarchicalScopeNodeProperties,
    getRootNodePropertiesMap,
    NODE_PROPERTIES_INHERITANCE_POLICY,
} from "./node-properties.mjs";
import { NODE_PROPERTIES_GENERATORS } from "./node-properties-generators.mjs";
import {
    PATH_SPEC_ENVIRONMENT_PROVIDER,
    ENVIRONMENT_PROVIDER_KEYS,
    ENVIRONMENT_PROVIDER_ENTRIES,
} from "../../environment-provider.mjs";

/**
 * Derive the root scope's defaults map from the frozen base map and the
 * externally injected values (root font). Returns a FRESH map — the
 * base map is never mutated (it's a frozen FreezableMap whose .set()
 * silently no-ops, which is why in-place seeding silently dropped these
 * injections). Environment facts and root width/height moved to the
 * nodeProperties@ channel (getRootNodePropertiesMap).
 */
export function seedTypeSpecDefaults(
    baseDefaultsMap,
    // Phase 5b teardown: the environment/width/height options seed
    // nothing anymore (their typeSpecnion consumers — environmentGen,
    // availableSizesGen — are commented out in
    // properties-generators.mjs; the nodeProperties@ channel owns these
    // facts now). Kept for signature compatibility; no caller passes
    // them. Candidates for removal with the options' import sites.
    { rootFont = null, environment = null, width = null, height = null },
) {
    const typeSpecDefaultsMap = new Map(baseDefaultsMap);
    if (rootFont !== null) typeSpecDefaultsMap.set(`${SPECIFIC}font`, rootFont);
    if (environment !== null)
        for (const [key, value] of pathSpecValuesFromObjectGen(
            PATH_SPEC_ENVIRONMENT_PROVIDER,
            `${SPECIFIC}root/environment`, // prefix
            environment,
        ))
            typeSpecDefaultsMap.set(key, value);
    for (const [dimension, value] of [
        ["width", width],
        ["height", height],
    ])
        if (value !== null)
            typeSpecDefaultsMap.set(`${SPECIFIC}root/${dimension}`, value);
    return typeSpecDefaultsMap;
}

export class TypeSpecLiveProperties extends _BaseComponent {
    constructor(
        widgetBus,
        typeSpecPropertiesGenerators,
        inheritancePolicyGenerators,
        typeSpecDefaultsMap = null,
    ) {
        super(widgetBus);
        this._propertiesGenerators = typeSpecPropertiesGenerators;
        this._inheritancePolicyGenerators = inheritancePolicyGenerators;
        this._typeSpecnion = null;
        this._nodeProperties = null;
        this.propertyValuesMap = null;
        if (this.hasParentProperties && typeSpecDefaultsMap !== null)
            throw new Error(
                `VALUE ERROR ${this} typeSpecDefaultsMap must be null if hasParentProperties.`,
            );
        else if (!this.hasParentProperties && typeSpecDefaultsMap === null)
            throw new Error(
                `VALUE ERROR ${this} typeSpecDefaultsMap must NOT be null if not hasParentProperties.`,
            );
        this._typeSpecDefaultsMap = typeSpecDefaultsMap;
    }

    get typeSpecnion() {
        if (this._typeSpecnion === null)
            throw new Error(
                "LIFECYCLE ERROR this._typeSpecnion is null, must update initially first.",
            );
        return this._typeSpecnion;
    }

    get nodeProperties() {
        if (this._nodeProperties === null)
            throw new Error(
                "LIFECYCLE ERROR this._nodeProperties is null, must update initially first.",
            );
        return this._nodeProperties;
    }

    get hasParentProperties() {
        return this.widgetBus.wrapper.dependencyReverseMapping.has(
            "@parentProperties",
        );
    }

    update(changedMap) {
        const getEntry = (key) =>
            changedMap.has(key) ? changedMap.get(key) : this.getEntry(key);

        let typeSpecnionChanged = false;
        if (
            [
                "typeSpec",
                "@parentProperties",
                "rootFont",
                ...ENVIRONMENT_PROVIDER_ENTRIES,
                "width",
                "height",
            ].some((k) => changedMap.has(k))
        ) {
            const hasLocalChanges = changedMap.has("typeSpec"),
                fontChanged = changedMap.has("rootFont"),
                typeSpec_ = getEntry("typeSpec"),
                // I had a case where typeSpec is a dynamic model
                // it would be nice to define the dependency in such a
                // way that it would be unwrapped here.
                typeSpec = typeSpec_.hasWrapped ? typeSpec_.wrapped : typeSpec_;
            if (this.hasParentProperties) {
                const parentProperties = getEntry("@parentProperties"),
                    localChanged =
                        hasLocalChanges || this._typeSpecnion === null,
                    parentChanged =
                        this._typeSpecnion === null ||
                        parentProperties.typeSpecnion !==
                            this._typeSpecnion.parentTypeSpecnion;
                // Don't rebuild if the components haven't changed.
                if (localChanged || parentChanged || fontChanged) {
                    this._typeSpecnion = new HierarchicalScopeTypeSpecnion(
                        this._propertiesGenerators,
                        typeSpec,
                        parentProperties.typeSpecnion,
                        this._inheritancePolicyGenerators,
                    );
                    typeSpecnionChanged = true;
                }
            } else {
                // typeSpecDefaultsMap only comes in at root, when
                // !this.hasParentProperties
                // This is a hack, but it will work solidly for a while.
                // Eventually I'd like to figure a more conceptually robust way
                // how to distribute this kind of external, from the TypeSpec
                // structure, injected/inherited dynamic dependencies; or maybe
                // just formalize this.
                // NOTE: seedTypeSpecDefaults derives a FRESH map: the base
                // map is frozen (its .set() silently no-ops), so in-place
                // seeding would silently drop the injected keys.
                const reverseMapping =
                        this.widgetBus.wrapper.dependencyReverseMapping,
                    hasRootFont = reverseMapping.has("rootFont"),
                    typeSpecDefaultsMap = seedTypeSpecDefaults(
                        this._typeSpecDefaultsMap,
                        {
                            rootFont: hasRootFont
                                ? getEntry("rootFont").value
                                : null,
                        },
                    );
                const rootNodePropertiesMap = getRootNodePropertiesMap(
                        Object.fromEntries(
                            zip(
                                ENVIRONMENT_PROVIDER_KEYS,
                                ENVIRONMENT_PROVIDER_ENTRIES.map(getEntry),
                            ),
                        ),
                    ),
                    nodePropertiesHostMap = new Map(rootNodePropertiesMap);
                for (const dimension of ["width", "height"])
                    if (reverseMapping.has(dimension))
                        nodePropertiesHostMap.set(
                            `${LAYOUT}${dimension}`,
                            getEntry(dimension),
                        );

                this._typeSpecnion = new HierarchicalScopeTypeSpecnion(
                    this._propertiesGenerators,
                    typeSpec,
                    typeSpecDefaultsMap,
                    this._inheritancePolicyGenerators,
                    // potentiallly, here a local typespecnion with a typespec populated withh all the default values...
                );
                typeSpecnionChanged = true;
                this._nodeProperties = new HierarchicalScopeNodeProperties(
                    NODE_PROPERTIES_GENERATORS,
                    nodePropertiesHostMap,
                    rootNodePropertiesMap,
                    // No inheritance policy yet: the socket is live, the
                    // width-semantics takeover supplies the content.
                    NODE_PROPERTIES_INHERITANCE_POLICY,
                );
            }
        }
        if (typeSpecnionChanged) {
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `typeSpecProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
            // Only the root instance (and only when its layout
            // registered the protocol) has a nodeProperties@
            // registration — e.g. type-tools-grid hasn't.
            if (
                this._nodeProperties !== null &&
                this.widgetBus.wrapper.hasProtocolHandlerRegistration(
                    "nodeProperties@",
                )
            ) {
                const [npIdentifier, npProtocolHandlerImplementation] =
                    this.widgetBus.getProtocolHandlerRegistration(
                        `nodeProperties@`,
                    );
                npProtocolHandlerImplementation.setUpdated(npIdentifier);
            }
        }
    }

    getPropertyValuesMap() {
        // returns  this._typeSpecnion._localPropertyValuesMap
        return this._typeSpecnion.getPropertyValuesMap();
    }
}

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
                    hasParentProperty: () => false,
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

export class StyleLinkLiveProperties extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this._typeSpecnion = null;
        this.propertyValuesMap = null;
    }

    get typeSpecnion() {
        if (this._typeSpecnion === null)
            throw new Error(
                "LIFECYCLE ERROR this._typeSpecnion is null, must update initially first.",
            );
        return this._typeSpecnion;
    }

    update(changedMap) {
        // NOTE: stylePatchProperties@ is null initially
        // but it is not set if the link becomes invalid (which is IMO not
        // an initial update) the this function is called without 'stylePatchesSource@'
        // in the changedMap. FIXME: in that case the value changes from
        // a StylePatchSourceLiveProperties to null component, it would be
        // really good to have that in changedMap!
        // When it changes from null to a StylePatchSourceLiveProperties
        // it's in the changedMap!
        // This is only true if the linking is broken by changing the key in
        // stylePatchesSource. When setting a broken link in stylePatchLinksMap
        // null is reported each time. This is likely because that triggers
        // an initial update.
        // We could add a dependency to stylePatchesSource for an additional
        // hint.
        //
        // eventually, if we update styleLinkProperties@ regardless,
        // each time this method is called, it doesn't matter so much.

        // A StylePatchSourceLiveProperties
        const stylePatchProperties = changedMap.has("stylePatchProperties@")
                ? changedMap.get("stylePatchProperties@")
                : this.getEntry("stylePatchProperties@"),
            // A TypeSpecLiveProperties
            typeSpecProperties = changedMap.has("typeSpecProperties@")
                ? changedMap.get("typeSpecProperties@")
                : this.getEntry("typeSpecProperties@"),
            stylePatchPropertyValuesMap =
                stylePatchProperties !== null
                    ? stylePatchProperties.propertyValuesMap
                    : new Map(),
            // NOTE stylePatchPropertyValuesMap.size can be 0 even if it
            // comes from stylePatchProperties.propertyValuesMap. The
            // default behavior of a style patch is to set nothing.
            newTypeSpecnion =
                stylePatchPropertyValuesMap.size !== 0
                    ? typeSpecProperties.typeSpecnion.createPatched(
                          stylePatchProperties.propertyValuesMap,
                      )
                    : typeSpecProperties.typeSpecnion;
        if (this._typeSpecnion !== newTypeSpecnion) {
            // console.log(`styleLinkProperties@ ${this.widgetBus.rootPath} new typeSpecnion`, newTypeSpecnion, this);
            this._typeSpecnion = newTypeSpecnion;
            // This should update subscribers that need to re-initialize
            const [identifier, protocolHandlerImplementation] =
                this.widgetBus.getProtocolHandlerRegistration(
                    `styleLinkProperties@`,
                );
            protocolHandlerImplementation.setUpdated(identifier);
        }
    }

    getPropertyValuesMap() {
        return this._typeSpecnion.getPropertyValuesMap();
    }
}
