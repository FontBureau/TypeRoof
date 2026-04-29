import { SyntheticValue } from "./synthetic-value.mjs";
import { _pathSpecGen } from "./path-spec-gen.mjs";
import {
    ForeignKey,
    getFieldsByType,
    FreezableSet,
    FreezableMap,
} from "../../../metamodel.mjs";
import {
    SPECIFIC,
    GENERIC,
    LEADING,
    LANGUAGE,
    OPENTYPE_FEATURES,
    getPropertiesBroomWagonGen,
    COLOR,
} from "../../registered-properties-definitions.mjs";
import {
    TypeSpecModel,
    LeadingAlgorithmModel,
    deserializeLeadingAlgorithmModel,
    deserializeManualMarginsModel,
} from "../../type-spec-models.mjs";
import {
    LanguageTagModel,
    createLanguageTag,
} from "../../language-tags.typeroof.jsx";
import { fillTreeFromPaths } from "./fill-tree-from-paths.mjs";
import { identity, zip } from "../../../util.mjs";
import { colorsGen, culoriToColor } from "../../color.mjs";
import { runion_01_lineHeight } from "../../type-spec-fundamentals.mjs";
import { TYPESPEC_PPS_MAP } from "./typespec-pps-map.mjs";
import { typeSpecGetDefaults } from "./type-spec-get-defaults.mjs";
import { LocalScopeTypeSpecnion } from "./base-type-specnion.typeroof.jsx";

// This will produce:
//  * {prefix to leading/} a/leading
//  * {prefix to leading/} a/lineWidth
//  * {prefix to leading/} b/leading
//  * {prefix to leading/} b/lineWidth
//  * {prefix to leading/} minLeading
//  * {prefix to leading/} maxLeading
const PATH_SPEC_AUTO_LINEAR_LEADING = [
    [
        ["a", "b"],
        ["leading", "lineWidth"],
    ],
    [["minLeading", "maxLeading"]],
];

/**
 * This only yields (flattens) the full path described in a pathSpec
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
function* pathSpecPathsGen(pathSpec, prefix) {
    function getLeave(path /*, cursor*/) {
        return path;
    }
    for (const spec of pathSpec)
        yield* _pathSpecGen(getLeave, null, [prefix], spec);
}

function* fontGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    const font = hostInstance.get("font");
    if (font !== ForeignKey.NULL) {
        yield [`${SPECIFIC}font`, font.value];
    }
}

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

function createMargin(value, unit, baseFontSize, fontSize, lineHeightEm) {
    if (value === null || unit === null) return null;
    if (unit === "lineHeight") return `${value * lineHeightEm * fontSize}pt`;
    if (unit === "em") return `${value * fontSize}pt`;
    if (unit === "baseEm") return `${value * baseFontSize}pt`;
    // e.g. unit === 'pt'
    return `${value}${unit}`;
}

function* marginsGen(
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
                if (!outerTypespecnionAPI.hasParentProtperty(path))
                    // same rationale as in languageTagGen
                    yield [path, null];
                continue;
            }
            yield [path, itemValue.value];
        }
        const args = [
            `${targetPath}/value`,
            `${targetPath}/unit`,
            `${GENERIC}baseFontSize`,
            `${GENERIC}fontSize`,
            `${LEADING}leading/line-height-em`,
        ];
        yield [`${targetPath}`, new SyntheticValue(createMargin, args)];
    }
}

function AutoLinearLeadingSyntheticValue(prefix) {
    const COLUMN_WIDTH_EN = `${GENERIC}columnWidth`,
        RELATIVE_FONT_SIZE = `${GENERIC}relativeFontSize`,
        argsNames = [COLUMN_WIDTH_EN, RELATIVE_FONT_SIZE],
        paths = [];
    for (const path of pathSpecPathsGen(
        PATH_SPEC_AUTO_LINEAR_LEADING,
        prefix,
    )) {
        const fullKey = path.join("/");
        argsNames.push(fullKey);
        paths.push(path);
    }

    function calculate(...args) {
        const valuesMap = new Map(zip(argsNames, args)),
            // NOTE: look at PATH_SPEC_AUTO_LINEAR_LEADING to see how this works
            { a, b, minLeading, maxLeading } = fillTreeFromPaths(
                prefix,
                paths,
                valuesMap,
            ),
            columnWidthEn = valuesMap.get(COLUMN_WIDTH_EN),
            relativeFontSize = valuesMap.get(RELATIVE_FONT_SIZE),
            actualColumnWidth = columnWidthEn / relativeFontSize;
        return runion_01_lineHeight(
            a,
            b,
            actualColumnWidth,
            minLeading,
            maxLeading,
        );
    }
    return new SyntheticValue(calculate, argsNames);
}

/**
 *  This reads from a metamodel instance according to pathSpec.
 *
 * PathSpec is e.g.: PATH_SPEC_AUTO_LINEAR_LEADING
 */
function* pathSpecValuesGen(pathSpec, prefix, data) {
    function nextNode(cursor, key) {
        return cursor.get(key);
    }
    function getLeave(path, cursor) {
        return [path.join("/"), cursor.value];
    }
    for (const spec of pathSpec)
        yield* _pathSpecGen(getLeave, nextNode, [prefix], spec, data);
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
        if (algorithm === ForeignKey.NULL) {
            if (outerTypespecnionAPI.hasParentProtperty(ALGORITHM_TYPE)) {
                const algorithm =
                    outerTypespecnionAPI.getParentProperty(ALGORITHM_TYPE);
                if (algorithm === "AutoLinearLeading") {
                    // We always calculate this if the AutoLinearLeading
                    // is inherited, especially because `${GENERIC}columnWidth`
                    // could have changed in this layer.
                    yield [
                        LEADING_HEIGHT_EM,
                        new AutoLinearLeadingSyntheticValue(PREFIX),
                    ];
                }
            }
            continue;
        }
        const data = leadingAlgorithm.get("instance").wrapped;
        yield [ALGORITHM_TYPE, algorithm];
        if (algorithm === "AutoLinearLeading") {
            yield* pathSpecValuesGen(
                PATH_SPEC_AUTO_LINEAR_LEADING,
                PREFIX,
                data,
            );
            yield [
                LEADING_HEIGHT_EM,
                new AutoLinearLeadingSyntheticValue(PREFIX),
            ];
        } else if (algorithm === "ManualLeading")
            yield [LEADING_HEIGHT_EM, data.get("leading").value];
        else
            throw new Error(
                `NOT IMPLEMENTED leadingGen don't know how to handle algorithm type "${algorithm}".`,
            );
    }
}

/**
 * hostInstance implements manualAxesLocationsModelMixin
 *              and fontSize
 * yield [propertyName, propertyValue]
 */
export function* axisLocationsGen(
    outerTypespecnionAPI,
    hostInstance /* here a TypeSpecModel */,
) {
    // fontSize = hostInstance.get('fontSize')
    // => this is interesting, if hostInstance defines fontSize, we
    //    definitely use that, otherwise, going only via
    // outerAnimanionAPI.getProperty(`${GENERIC}fontSize`)
    const autoOPSZ = hostInstance.get("autoOPSZ").value;

    // I have this problem in grid where dimensionsGen runs after
    // axisLocationsGen dimensions gen may also set fontSize but
    // this SyntheticValue seems to be already resolved then. Maybe,
    // if this SyntheticValue for `axesLocations/opsz` could be resolved
    // much later, it would be working without passing ${GENERIC}autoOPSZ
    // so that it can be interpreted regardless later.
    yield [`${GENERIC}autoOPSZ`, autoOPSZ];
    if (autoOPSZ) {
        // autoOPSZ => opsz is the same pt value as the fontSize that
        // is applied to this level.
        //
        // if this remains the only useful case for outerTypespecnionAPI.getProperty
        // it should probably be replaced with some more powerful api
        // It would be nice if `${GENERIC}fontSize` would be
        // sufficient here! but maybe we need to decide when not to
        // use it.
        //if(baseFontSizeValue !== null)

        // this is effectively an alias of fontSize.
        // this should only result in a value if fontSizeValue doesn't
        // resolve to null, in which case using the inherited value
        // is correct, e.g like no yielding this.
        yield [
            `axesLocations/opsz`,
            new SyntheticValue(identity, [`${GENERIC}fontSize`]),
        ];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = hostInstance.get("axesLocations");
    for (const [axisTag, axisValue] of axesLocations) {
        if (autoOPSZ && axisTag === "opsz")
            // It was already yielded above and also should not
            // be present in here.
            continue;
        // Other than fontSize axesLocations are just not present when
        // at their default value.
        // I'm using the 'axesLocations/' prefix so it's easier to
        // distinguish. But also, it can be used dirextly as a path
        // in getEntry.
        yield [`axesLocations/${axisTag}`, axisValue.value];
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
        // DO we need this? would only work if axisRange was available
        // , clampedNumber = Math.min(axisRange.max, Math.max(axisRange.min, rawNumber))
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
        // autoOPSZ => opsz is the same pt value as the fontSize that
        // is applied to this level.
        //
        // if this remains the only useful case for outerTypespecnionAPI.getProperty
        // it should probably be replaced with some more powerful api
        // It would be nice if `${GENERIC}fontSize` would be
        // sufficient here! but maybe we need to decide when not to
        // use it.
        //if(baseFontSizeValue !== null)

        // this is effectively an alias of fontSize.
        // this should only result in a value if fontSizeValue doesn't
        // resolve to null, in which case using the inherited value
        // is correct, e.g like no yielding this.
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
            if (!outerTypespecnionAPI.hasParentProtperty(path))
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

// FIXME: There's another way specified in here to identify
// fields as GENERIC. But also, i.e. fontSizeGen already yields
// `${GENERIC}fontSize` so this should not!!!
export const REGISTERED_GENERIC_TYPESPEC_FIELDS = Object.freeze(
        new FreezableSet([
            // script+language!
            "textAlign",
            "direction",
            "columnWidth",
        ]),
    ),
    TYPE_SPEC_PROPERTIES_GENERATORS = Object.freeze([
        // numericPropertiesGen
        colorsGen,
        fontGen,
        baseFontSizeGen,
        fontSizeGen, // must come before axisLocationsGen
        axisLocationsGen,
        openTypeFeaturesGen,
        languageTagGen,
        marginsGen, // not inline
        getPropertiesBroomWagonGen(GENERIC, REGISTERED_GENERIC_TYPESPEC_FIELDS),
        leadingGen,
    ]),
    _GENERIC_STYLEPATCH_FIELDS = Object.freeze(
        new FreezableSet([
            // empty so far
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

const _skipPrefix = new Set([
    // This is very complicated as axesLocations have different default
    // values depending on the actual font. So if there's no font, there
    // can't be a value. This is why modelDefaultValue is injected, because
    // the caller may know a default value, but it may also not know, there's
    // no guarantee!
    "axesLocations/",
    OPENTYPE_FEATURES,
    LANGUAGE,
    // "font" is really the only case of this so far, there could
    // be the document font as a default maybe, as it cannot be not
    // set at all, hence it also must be loaded and available.
    SPECIFIC,
    // not yet thought through
    "stylePatches/",
]);

const _skipFullKey = new Set([
    // `${GENERIC}blockMargins`
]);

export function _getTypeSpecDefaultsMap(typeSpecDependencies) {
    const defaultTypeSpec = (() => {
            const draft = TypeSpecModel.createPrimalDraft(typeSpecDependencies);
            for (const [fieldName, ppsRecord] of TYPESPEC_PPS_MAP) {
                if (_skipPrefix.has(ppsRecord.prefix)) continue;
                if (_skipFullKey.has(ppsRecord.fullKey)) continue;
                if (ppsRecord.prefix == COLOR) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        color = culoriToColor(defaultValue, draft.dependencies);
                    draft.set(fieldName, color);
                } else if (ppsRecord.prefix == LEADING) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        leading = deserializeLeadingAlgorithmModel(
                            draft.dependencies,
                            defaultValue,
                        );
                    draft.set(fieldName, leading);
                } else if (ppsRecord.fullKey === `${GENERIC}blockMargins`) {
                    const defaultValue = typeSpecGetDefaults(
                            () => null,
                            ppsRecord,
                            fieldName,
                        ),
                        margins = deserializeManualMarginsModel(
                            draft.dependencies,
                            defaultValue,
                        );
                    draft.set(fieldName, margins);
                } else {
                    const defaultValue = typeSpecGetDefaults(
                        () => null,
                        ppsRecord,
                        fieldName,
                    );
                    draft.get(fieldName).value = defaultValue;
                }
            }
            return draft.metamorphose();
        })(),
        properties = LocalScopeTypeSpecnion.propertiesGenerator(
            TYPE_SPEC_PROPERTIES_GENERATORS,
            defaultTypeSpec,
            new Map(),
        ),
        localPropertyValuesMap = LocalScopeTypeSpecnion.initPropertyValuesMap(
            properties,
            new Map(),
        ),
        typeSpecDefaultsMap = new FreezableMap(localPropertyValuesMap);
    Object.freeze(typeSpecDefaultsMap);
    return typeSpecDefaultsMap;
}
