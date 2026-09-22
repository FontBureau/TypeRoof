import {
    ForeignKey,
    getFieldsByType,
    FreezableSet,
} from "../../../metamodel.mjs";
import {
    SPECIFIC,
    GENERIC,
    LEADING,
    LANGUAGE,
    LAYOUT,
    OPENTYPE_FEATURES,
    INTENT_STYLE_LINKS,
    MARK_STYLE_LINKS,
    getPropertiesBroomWagonGen,
} from "../../registered-properties-definitions.mjs";
import { isInheritingPropertyFn } from "../../registered-properties.mjs";
import { LeadingAlgorithmModel } from "../../type-spec/models.mjs";
import {
    LanguageTagModel,
    createLanguageTag,
} from "../../language-tags.typeroof.jsx";
import {
    SyntheticValue,
    PATH_SPEC_AUTO_LINEAR_LEADING,
    pathSpecValuesGen,
} from "./synthetic-values.mjs";
import { identity } from "../../../util.mjs";
import { TOMBSTONE } from "./type-specnion.mjs";
import { colorsGen } from "../../color.mjs";
import { cssUnitConvert, ABSOLUTE_UNITS } from "../../length-models.mjs";
function* fontGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const font = hostInstance.get("font");
    if (font !== ForeignKey.NULL) {
        yield [`${SPECIFIC}font`, font.value];
    }
}

// Phase 5b teardown: environment facts left the typeSpecnion — the
// nodeProperties@ channel owns them now (getRootNodePropertiesMap in
// live-properties.typeroof.jsx seeds the root scope; every scope
// inherits through the cascade). Commented out, not deleted (plan
// decision 6): the channel's new home is node-properties.mjs /
// node-properties-generators.mjs.
// function* environmentGen(
//     outerTypespecnionAPI,
// ) /*, hostInstance here a TypeSpecModel */ {
//     // this is forwarding the environment variables that got injected
//     // via the root typeSpecnion
//     for (const path of pathSpecPathsGen(PATH_SPEC_ENVIRONMENT_PROVIDER, null)) {
//         const pathStr = path.join("/"),
//             rootKey = `${SPECIFIC}root/environment/${pathStr}`,
//             descendantKey = `${SPECIFIC}environment/${pathStr}`;
//         let sourceKey = null;
//         if (outerTypespecnionAPI.hasParentProperty(rootKey))
//             sourceKey = rootKey;
//         else if (outerTypespecnionAPI.hasParentProperty(descendantKey))
//             sourceKey = descendantKey;
//         if (sourceKey === null) continue;
//         const value = outerTypespecnionAPI.getParentProperty(sourceKey);
//         yield [descendantKey, value];
//         if (sourceKey === rootKey)
//             yield [rootKey, TOMBSTONE, DEMARCATION_INHERITANCE];
//     }
// }

// Phase 5b teardown: the available-sizes resolution left the
// typeSpecnion — the nodeProperties@ channel's root scope computes it
// (availableSizesGen in node-properties-generators.mjs, layout/* keys).
// Commented out, not deleted (plan decision 6).
// The Idea is that only the root scope owns `${SPECIFIC}root/{width/height}
// properties.
// function* availableSizesGen(outerTypespecnionAPI /*, hostInstance*/) {
//     const getEnvironmentFn = (environmentKey, dim) => {
//         const fullKey = `${SPECIFIC}root/environment/${environmentKey}/${dim}`;
//         return outerTypespecnionAPI.getParentProperty(fullKey);
//     };
//     for (const dimension of ["width", "height"]) {
//         const sourceKey = `${SPECIFIC}root/${dimension}`,
//             lengthItem = outerTypespecnionAPI.getParentProperty(sourceKey);
//         if (!lengthItem) continue;
//         // this is root, now remove it from inheritance
//         yield [
//             `${SPECIFIC}root/${dimension}`,
//             TOMBSTONE,
//             DEMARCATION_INHERITANCE,
//         ];
//         const value = lengthToCSSUnit(
//             getEnvironmentFn,
//             lengthItem,
//             dimension,
//             "pt" /*targetUnit*/,
//         );
//         if (value === null) continue;
//         yield [`${GENERIC}available${_ucFirst(dimension)}`, value];
//         // The simplest case: width/height equal the available sizes.
//         // Only in root scope, where the available sizes exist; children
//         // receive width via the inheritance re-route in
//         // horizontalLayoutRunion.
//         yield [
//             `${GENERIC}${dimension}`,
//             new SyntheticValue(identity, [
//                 `${GENERIC}available${_ucFirst(dimension)}`,
//             ]),
//             DEMARCATION_PROPERTY,
//         ];
//     }
// }

/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 *
 */
function* baseFontSizeGen(outerTypespecnionAPI, hostInstance) {
    const baseFontSize = hostInstance.get("baseFontSize"),
        relativeFontSize = hostInstance.get("relativeFontSize");
    if (!baseFontSize.isEmpty)
        yield [`${GENERIC}baseFontSize`, baseFontSize.value];
    if (!relativeFontSize.isEmpty)
        yield [`${GENERIC}relativeFontSize`, relativeFontSize.value];
}

/**
 * Now, this becomes to be a "syntetic" value, it is created from
 * two original values and then calculated. Also, there's no actual
 * model data for this anymore.
 */
function* fontSizeGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const baseFontSize = hostInstance.get("baseFontSize"),
        relativeFontSize = hostInstance.get("relativeFontSize");
    if (baseFontSize.isEmpty && relativeFontSize.isEmpty)
        // font-size is defined by both of these values, if none is
        // defnied in here, the inherited value is just as good.
        return;

    // we already know that we have to yield as one of baseFontSize
    // or relativeFontSize is defined in this level/instance.
    // we don't know yet which one to take from local and which one to
    // inherit.
    // Ideally, if none of the args come from this level,
    // I don't want to evaluate the value, and just expect that
    // there will be an inherited value or a default in the Typespecnion.
    // The calling code could evaluate this. If none of the arguments
    // are local, don't define this derived value.
    // And, I don't want to resolve a dependency graph, so order is
    // relevant and the SyntheticValue are calculated in order, but likely
    // after all local generators have finished. So simple values that will
    // be yielded later will be available as well, also the results of
    // SynthethicValues that have been yielded before.
    function calculate(baseFontSize, relativeFontSize) {
        if (baseFontSize === null) return null;
        const fontSizeValue =
            baseFontSize * (relativeFontSize === null ? 1 : relativeFontSize);
        return fontSizeValue;
    }
    const args = [`${GENERIC}baseFontSize`, `${GENERIC}relativeFontSize`];
    // if either baseFontSize or relativeFontSize is defineded we should
    // yield the changed font size value.
    yield [`${GENERIC}fontSize`, new SyntheticValue(calculate, args)];
}

export function* axisLocationsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const autoOPSZ = hostInstance.get("autoOPSZ").value;
    yield [`${GENERIC}autoOPSZ`, autoOPSZ];
    if (autoOPSZ) {
        yield [
            `axesLocations/opsz`,
            new SyntheticValue(identity, [`${GENERIC}fontSize`]),
        ];
    }
    const axesLocations = hostInstance.get("axesLocations");
    for (const [axisTag, axisValue] of axesLocations) {
        if (autoOPSZ && axisTag === "opsz") continue;
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
}

export function* openTypeFeaturesGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const openTypeFeatures = hostInstance.get("openTypeFeatures");
    for (const [featureTag, featureValue] of openTypeFeatures) {
        yield [`${OPENTYPE_FEATURES}${featureTag}`, featureValue.value];
    }
}

export function* languageTagGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const languageTag = hostInstance.get("languageTag");
    let hasLocalEntry = false;
    for (const [subTag, subTagValue] of languageTag) {
        const path = `${LANGUAGE}${subTag}`;
        if (subTagValue.isEmpty) {
            if (!outerTypespecnionAPI.hasParentProperty(path))
                // Yield null to at least create some value in the local
                // liveProperties, for `${LANGUAGE}lang` (createLanguageTag)
                // to not fail. Basically this creates a kind of optional,
                // not set, arguments. null will also not be inherited.
                yield [path, null];
            continue;
        }
        hasLocalEntry = true;
        yield [path, subTagValue.value];
    }
    if (hasLocalEntry) {
        // Only if lang has local changes (we assume each local value to
        // be a change, even if the value is equal), we yield it, otherwise
        // the expection is that an upper element applies the attribute and
        // the languageTag is inherited (by the means of the DOM).
        const args = LanguageTagModel.fields
            .keys()
            .map((key) => `${LANGUAGE}${key}`);
        yield [`${LANGUAGE}lang`, new SyntheticValue(createLanguageTag, args)];
    }
}

function* blockMarginsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const blockMargins = hostInstance.get(`blockMargins`),
        basePath = `${GENERIC}blockMargins/`;
    for (const [targetName /*start or end*/, margin] of blockMargins) {
        const targetPath = `${basePath}${targetName}`; // no trailing slash!!
        for (const [itemName, itemValue] /* unit or value */ of margin) {
            const path = `${targetPath}/${itemName}`; // generic/blockMargins/start/unit
            if (itemValue.isEmpty) {
                if (!outerTypespecnionAPI.hasParentProperty(path))
                    // same rationale as in languageTagGen
                    yield [path, null];
                continue;
            }
            yield [path, itemValue.value];
        }
    }
}

function* leadingGen(outerTypespecnionAPI, hostInstance) {
    for (const fieldName of getFieldsByType(
        hostInstance.constructor,
        LeadingAlgorithmModel,
    )) {
        const PREFIX = `${LEADING}${fieldName}`,
            ALGORITHM_TYPE = `${PREFIX}/algorithm`,
            LEADING_HEIGHT_EM = `${PREFIX}/line-height-em`,
            leadingAlgorithm = hostInstance.get(fieldName),
            algorithm = leadingAlgorithm.get("leadingAlgorithmTypeKey").value;

        if (algorithm === ForeignKey.NULL) continue;

        const data = leadingAlgorithm.get("instance").wrapped;
        yield [ALGORITHM_TYPE, algorithm];
        if (algorithm === "AutoLinearLeading") {
            // Config only: the a/b/min/max paths; the computed
            // line-height-em is produced per document node in the
            // node-properties channel.
            yield* pathSpecValuesGen(
                PATH_SPEC_AUTO_LINEAR_LEADING,
                PREFIX,
                data,
            );
        } else if (algorithm === "ManualLeading")
            yield [LEADING_HEIGHT_EM, data.get("leading").value];
        else
            throw new Error(
                `NOT IMPLEMENTED leadingGen don't know how to handle algorithm type "${algorithm}".`,
            );
    }
}

function calculateFontAxisValueSynthetic(axisTag, logiVal, font) {
    const axisRanges = font.axisRanges;
    if (!(axisTag in axisRanges))
        // In this case, the result value becomes null
        // i.e. 'axesLocations/wxht': null
        // FIXME: it would be nice to remove null values from the
        // results set.
        return null;
    const axisRange = axisRanges[axisTag];
    if (!(logiVal in axisRange)) return null;
    return axisRange[logiVal];
}

// path = 'axesLocations/hello'
// axisTag = 'wght'
// if(logiVal === 'number')
//      axesLocations/hello: axisValue.get('numericValue').value
//  else
//      axesLocations/hello/logicalValue: logiVal[default|min|max]
//      axesLocations/hello: syntheticValue('wght', ...['axesLocations/hello/logicalValue', 'SPECIFIC/font'])
function* axesMathAxisLocationValueGen(path, axisTag, axisValue) {
    // axisValue is a AxesMathAxisLocationValueModel
    const logiVal = axisValue.get("logicalValue").value;

    if (logiVal === "number") {
        const rawNumber = axisValue.get("numericValue").value;
        yield [path, rawNumber];
    } else {
        const logiValKey = `${path}/logicalValue`;
        yield [logiValKey, logiVal];
        const args = [logiValKey, `${SPECIFIC}font`];
        yield [
            path,
            new SyntheticValue(
                calculateFontAxisValueSynthetic.bind(null, axisTag),
                args,
            ),
        ];
    }
}

function* axisMathLocationsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const autoOPSZItem = hostInstance.get("autoOPSZ");
    if (!autoOPSZItem.isEmpty && autoOPSZItem.value) {
        yield [
            `axesLocations/opsz`,
            new SyntheticValue(identity, [`${GENERIC}fontSize`]),
        ];
    }

    const axesLocations = hostInstance.get("axesLocations");
    for (const [axisTag, axisValue] of axesLocations) {
        if (axisTag === "opsz" && !autoOPSZItem.isEmpty && autoOPSZItem.value)
            continue;
        yield* axesMathAxisLocationValueGen(
            `axesLocations/${axisTag}`,
            axisTag,
            axisValue,
        );
    }
}

/**
 * Yield one property per style-link edge: [`${STYLE_LINKS}${key}`, edge].
 * The edge (a StylePatchLinkModel instance) is inherited as a whole
 * struct; a child redefining the key overrides the parent's edge
 * wholesale (whole-edge override). mode 'unlinked' is the tombstone:
 * a literal null is yielded, which shadows the inherited entry in the
 * merged map; consumers treat null as absent ("the absence is the
 * inheritance").
 */
export function* styleLinksGen(outerTypespecnionAPI, hostInstance) {
    for (const [prefix, fieldName] of [
        [INTENT_STYLE_LINKS, "intentStyleLinks"],
        [MARK_STYLE_LINKS, "markStyleLinks"],
    ])
        for (const [key, edge] of hostInstance.get(fieldName))
            yield [
                `${prefix}${key}`,
                edge.get("mode").value === "unlinked" ? null : edge,
            ];
}

/**
 * This is responsible for setting
 * margin-inline-start, margin-inline-end, column-count, column-width,
 * column-gap, and to re-route the inherited width for its children such
 * that it equals column-width.
 * It's in so far complex, as we will have an automation running implementing
 * a fluid column-layout, however, if children set values explicitly, we'll
 * not override that using the automation results, instead, the explicit
 * configuration wins (if feasible).
 * We'll have one SyntheticValue that computes a Map of layout
 * values that are going to be unpacked and yielded each extra by further
 * SyntheticValues
 */

// one thought: I currently have the block-margins directly in the
// typeSpec struct, however, it would be nicer for this example to
// put the inline-margins into a sub-struct for horizontal layout:
// i.e. it could be manual, then the manual horioontal layout would
// be active and contain the margin-struct, or it could be automatic,
// then a higher level abstraction struct would be active and feed the
// algorithm. there would be no conficts, as it would be either-or.
// On the other side, it also be interesting to have the inline-margins
// top-level and only if they are not set explicitly, let the algorithm
// decide. that also coul fill up more: if everything of
// horizontalLayoutProperties is set but not columnCount, that one could
// still be calculated, or if only lineLength is missing, that could still
// be calculated. It's like a progressively enhanced variant and all the
// properties are directly top level accessible.
// We'd need a way to deal with e.g. a column-layout overflows the available
// width, that would mean, we should set width to something else than the
// configured value.
// There's a hint in that, that the width that we yield !== availableWidth
// i.e. width will be a synthetic value as well, that in the simplest case
// yields the same as available width but actually yields

// yield always pure numbers normalized to en of fontSize
function createInlineLength(value, unit, baseFontSize, fontSize) {
    if (value === null || unit === null) return null;
    if (unit === "em") return value * 2;
    if (unit === "baseEm") return (value * 2 * baseFontSize) / fontSize;
    if (unit === "en") return value;
    if (unit === "baseEn") return (value * baseFontSize) / fontSize;
    if (unit === "pt") return (value * 2) / fontSize;
    if (ABSOLUTE_UNITS.includes(unit))
        return (cssUnitConvert(value, unit, "pt") * 2) / fontSize;
    throw new Error(
        `VALUE ERROR don't know how to handle unit ${unit} ( in createInlineMargin)`,
    );
}

function* _inlineLengthGen(
    outerTypespecnionAPI,
    targetPath,
    inlineLengthValue,
) {
    for (const [itemName, itemValue] /* unit or value */ of inlineLengthValue) {
        const path = `${targetPath}/${itemName}`; // generic/inlineMargins/start/unit
        if (itemValue.isEmpty) {
            if (!outerTypespecnionAPI.hasParentProperty(path))
                // same rationale as in languageTagGen
                yield [path, null];
            continue;
        }
        yield [path, itemValue.value];
    }
}

function* inlineMarginsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const inlineMargins = hostInstance.get(`inlineMargins`),
        basePath = `${GENERIC}inlineMargins/`;
    for (const [targetName /*start or end*/, margin] of inlineMargins) {
        const targetPath = `${basePath}${targetName}`; // no trailing slash!!
        yield* _inlineLengthGen(outerTypespecnionAPI, targetPath, margin);
    }
}

// Phase 5b teardown: only referenced by the already-dead width yield
// below (itself commented out); the node channel computes widths now.
// Kept commented (plan decision 6) — the formula documents what a
// horizontal layout's total width is.
// function horizontalWidthSum(
//     lineLength,
//     columnCount,
//     columnGap,
//     marginInlineStart,
//     marginInlineEnd,
// ) {
//     return (
//         lineLength * columnCount +
//         columnGap * (columnCount - 1) +
//         marginInlineStart +
//         marginInlineEnd
//     );
// }

function enToPt(value, fontSize) {
    return `${(value / 2) * fontSize}pt`;
}

export function* manualHorizontalLayout(outerTypespecnionAPI, hostInstance) {
    // const horizontalLayoutProperties = [
    //     "lineLength",
    //     "columnCount",
    //     "columnGutter",
    //     // via inlineMarginsGen:
    //     // "marginInlineStart", `${GENERIC}inlineMargins/start`
    //     // "marginInlineEnd",   ``${GENERIC}inlineMargins/end`;`
    // ];

    yield* inlineMarginsGen(outerTypespecnionAPI, hostInstance);
    for (const inlineLengthName of ["lineLength", "columnGutter"]) {
        const targetPath = `${GENERIC}${inlineLengthName}`,
            inlineLengthValue = hostInstance.get(inlineLengthName);
        yield* _inlineLengthGen(
            outerTypespecnionAPI,
            targetPath,
            inlineLengthValue,
        );
    }

    const columnCount = hostInstance.get("columnCount");
    if (!columnCount.isEmpty)
        // could also yield `1` when empty
        yield [`${GENERIC}columnCount`, columnCount.value];
}

const HORIZONTAL_LAYOUT = "horizontalLayout/";
export function* horizontalLayoutRunion(outerTypespecnionAPI, runionInstance) {
    // simple or-empty values
    // we'll need defaults for those
    for (const key of ["minLineLength", "paddingRatioStart"]) {
        const instance = runionInstance.get(key);
        if (instance.isEmpty) continue;
        yield [`${HORIZONTAL_LAYOUT}${key}`, instance.value];
    }

    {
        const key = "columnGutter",
            instance = runionInstance.get(key),
            algorithm = instance.get("columnGutterAlgorithmTypeKey").value;
        if (algorithm !== ForeignKey.NULL)
            // no need to unpack here, we don't do deep inhertiance
            // into this, and the consumer will be the SyntheticValue
            // alone, no end-user.
            // could yield the the instance directly, but then the
            // SyntheticValue would have to check by type and this
            // way it can check by typeKey, without importing the type.
            // Not sure if that's a real value in itself, but it seems
            // simpler.
            yield [`${HORIZONTAL_LAYOUT}${key}`, instance];
    }

    {
        const key = "growColumns",
            instance = runionInstance.get(key),
            mode = instance.get("mode");
        if (!mode.isEmpty) {
            let value;
            if (mode.value === "number")
                value = instance.get("numericValue").value;
            else if (mode.value === "false") value = false;
            else if (mode.value === "infinity") value = Infinity;
            else throw new Error(`VALUE ERROR unkown mode "${mode.value}".`);
            yield [`${HORIZONTAL_LAYOUT}${key}`, value];
        }
    }

    {
        // per-count maxes
        const key = "columns",
            instance = runionInstance.get(key);
        if (instance.size)
            // Inheriting into the list would be possible, but messy or
            // at least hard to follow by an operator!
            // So,  we don't inherit into the list at all, instead, we
            // even just yield the immutable instance, as, here as well,
            // the consumer is just the synthetic value.
            // We can inherit the full list however, as we don't yield
            // the empty list.
            // What would an empty list mean? always one column?
            yield [`${HORIZONTAL_LAYOUT}${key}`, instance];
    }
}

function* inlineLengthUnitsGen() {
    for (const enKey of [
        "lineLength",
        "columnGutter",
        "inlineMargins/start",
        "inlineMargins/end",
    ]) {
        const targetPath = `${GENERIC}${enKey}`;
        yield [
            `${targetPath}`,
            new SyntheticValue(
                createInlineLength,
                [
                    `${targetPath}/value`,
                    `${targetPath}/unit`,
                    `${GENERIC}baseFontSize`,
                    `${GENERIC}fontSize`,
                ],
                { optional: true },
            ),
        ];
        // NOTE: it could actually be nice if we could evaluate these\
        // lazily on read-time. I.e. evaluate on first read then cache.
        // That would mean we could have a whole lot of these values just
        // generated and not calculated. On the other hand, that effort
        // could also go into a properties reader abstraction, that compiles
        // unit values when reading, and also could cache.
        yield [
            `${targetPath}/pt`,
            new SyntheticValue(enToPt, [targetPath, `${GENERIC}fontSize`], {
                optional: true,
            }),
        ];
    }
}

export function* horizontalLayout(outerTypespecnionAPI, hostInstance) {
    const horizontalLayout = hostInstance.get("horizontalLayout");

    const algorithm = horizontalLayout.get(
        "horizontalLayoutAlgorithmTypeKey",
    ).value;

    if (algorithm !== ForeignKey.NULL)
        yield [`${HORIZONTAL_LAYOUT}algorithm`, algorithm];

    if (algorithm === "ManualHorizontalLayoutModel") {
        const manualInstance = horizontalLayout.get("instance").wrapped;
        yield* manualHorizontalLayout(outerTypespecnionAPI, manualInstance);
        // This does not apply to the HorizontalLayoutRunionModel
        // case, as that doesn't even specify those properties, so how can
        // it assume they exist?
        yield* inlineLengthUnitsGen();
    } else if (algorithm === "HorizontalLayoutRunionModel") {
        const runionInstance = horizontalLayout.get("instance").wrapped;
        yield* horizontalLayoutRunion(outerTypespecnionAPI, runionInstance);
    } else if (algorithm !== ForeignKey.NULL)
        throw new Error(
            `Don't know how to handle algorithm ${algorithm} ` +
                `of ${horizontalLayout}.`,
        );
}

// FIXME: There's another way specified in here to identify
// fields as GENERIC. But also, i.e. fontSizeGen already yields
// `${GENERIC}fontSize` so this should not!!!
export const REGISTERED_GENERIC_TYPESPEC_FIELDS = Object.freeze(
        new FreezableSet([
            // script+language!
            "textAlign",
            "direction",
        ]),
    ),
    TYPE_SPEC_PROPERTIES_GENERATORS = Object.freeze([
        // Phase 5b teardown: environmentGen and availableSizesGen left
        // for the nodeProperties@ channel (commented out above).
        // numericPropertiesGen
        colorsGen,
        fontGen,
        baseFontSizeGen,
        fontSizeGen, // must come before axisLocationsGen
        axisLocationsGen,
        openTypeFeaturesGen,
        languageTagGen,
        blockMarginsGen,
        horizontalLayout,
        leadingGen,
        getPropertiesBroomWagonGen(GENERIC, REGISTERED_GENERIC_TYPESPEC_FIELDS),
        styleLinksGen,
    ]),
    _GENERIC_STYLEPATCH_FIELDS = Object.freeze(
        new FreezableSet([
            // empty so far
            "direction",
        ]),
    ),
    STYLE_PATCH_PROPERTIES_GENERATORS = Object.freeze([
        colorsGen /* re-used */,
        fontGen,
        baseFontSizeGen /* re-used */,
        // FIXME: I think I would prefer it if we wouldn't have to
        // include this, when the patch would be applied to the
        // older definition of this from the parent typeSpec. but it isn't,
        // It also seems that would change the semantics a lot. Now
        // Synthetic values are resolved as soon as possible, and that would
        // shift it to as late as possible.
        fontSizeGen,
        // Not sure if the treatment of autoOPSZ in axisLocationsGen
        // is actually OK! It could be! Then we could re-use it in
        // here!
        // NOTE also that in this case the values are AxesMathAxisLocationValueModel
        // which need resolution when the font is aussured to be known
        // i.e. where this patch and the typeSpec get mixed.
        axisMathLocationsGen,
        openTypeFeaturesGen,
        languageTagGen,
        getPropertiesBroomWagonGen(
            GENERIC,
            _GENERIC_STYLEPATCH_FIELDS,
        ) /* lind of re-used */,
    ]);

/**
 * The root's box seeds (layout/width, layout/height LengthModels from
 * typeSpecDefaultsMap) exist so the ROOT NODE scope can resolve
 * availableWidth/availableHeight. They are not style and must not
 * inherit down the typeSpec tree — at child typeSpecnions they leak
 * into node-scope cascades (observed: availableSizesGen re-yielding
 * the root's availableWidth at every child scope).
 */
export function* layoutRootSeedsPolicyGen(propertyNames) {
    for (const propertyName of propertyNames)
        if (
            propertyName === `${LAYOUT}width` ||
            propertyName === `${LAYOUT}height`
        )
            yield [propertyName, TOMBSTONE];
}

/**
 * The default inheritance policy: yield TOMBSTONE for every settled
 * property the registry marks non-inheriting. Injected into
 * HierarchicalScopeTypeSpecnion alongside TYPE_SPEC_PROPERTIES_GENERATORS
 * by the layout wiring files (index.typeroof.jsx). Any consumer can
 * substitute a different generator if the set must deviate from
 * registry semantics.
 * This kind of generator can only influence the same as DEMARCATION_INHERITANCE
 * influences, but it is running in a later phase, when the properties
 * have already settled, hence it can receive the list of `propertyNames`
 * and act upon it to influence how they are inherited.
 * It's also legal to yield values here, including SyntheticValue
 * which can be used to re-route existing values.
 */
export function* defaultInheritancePolicyGen(propertyNames) {
    for (const propertyName of propertyNames)
        if (!isInheritingPropertyFn(propertyName))
            yield [propertyName, TOMBSTONE];
}

/**
 * For ease of propagation this bundles some generators and delegates their
 * yields. It is also possible to use multiple generators at the configuration
 * site.
 */
export function* inheritancePolicyGen(propertyNames) {
    yield* defaultInheritancePolicyGen(propertyNames);
    yield* layoutRootSeedsPolicyGen(propertyNames);
}
