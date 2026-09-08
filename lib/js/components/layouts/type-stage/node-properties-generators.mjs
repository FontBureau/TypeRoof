import {
    LAYOUT,
    GENERIC,
    LEADING,
} from "../../registered-properties-definitions.mjs";
import {
    SyntheticValue,
    PATH_SPEC_AUTO_LINEAR_LEADING,
    pathSpecPathsGen,
    fillTreeFromPaths,
} from "./synthetic-values.mjs";
import { identity, zip } from "../../../util.mjs";
import { lengthToCSSUnit } from "../../length-models.mjs";
import { runion_01_lineHeight } from "../../type-spec-fundamentals.mjs";

function _ucFirst(name) {
    return `${name[0].toUpperCase()}${name.slice(1)}`;
}

/**
 * The root scope of the node-properties channel owns the document's
 * width/height (widget deps of the root, delivered via the host map as
 * `layout/width|height` LengthModels) and resolves them against the
 * environment facts (inherited/defaults, `layout/environment/...`),
 * yielding the available sizes in pt.
 *
 * Only the root scope has these host keys — at any other node the
 * generator yields nothing (facts arrive via inheritance instead).
 *
 * Generator signature follows the shared convention:
 * gen(outerNodePropertiesAPI, hostMap).
 */
export function* availableSizesGen(outerNodePropertiesAPI, hostMap) {
    const getEnvironmentFn = (environmentKey, dim) =>
        outerNodePropertiesAPI.getParentProperty(
            `${LAYOUT}environment/${environmentKey}/${dim}`,
        );
    for (const dimension of ["width", "height"]) {
        const lengthItem = hostMap.get(`${LAYOUT}${dimension}`);
        if (!lengthItem) continue;
        const value = lengthToCSSUnit(
            getEnvironmentFn,
            lengthItem,
            dimension,
            "pt" /*targetUnit*/,
        );
        if (value === null) continue;
        yield [`${LAYOUT}available${_ucFirst(dimension)}`, value];
        // The simplest case: width/height equal the available sizes.
        // Only where the available sizes exist (the root scope);
        // children receive width via inheritance.
        yield [
            `${LAYOUT}${dimension}`,
            new SyntheticValue(identity, [
                `${LAYOUT}available${_ucFirst(dimension)}`,
            ]),
        ];
    }
}

/**
 * The horizontal-layout geometry of a node (width-semantics handoff,
 * 2026-09-08): computes the node's own CSS width and the available
 * width it hands to its children.
 *
 * Unit discipline:
 *   - inherited/stored layout facts (layout/availableWidth,
 *     layout/width) are always ABSOLUTE pt — box constraints, stable
 *     across scopes;
 *   - the horizontal typographic calculation runs in LOCAL EN
 *     (en of this node's fontSize): the inherited pt budget is
 *     converted at the boundary (availableWidthPT / (0.5 × fontSizePT)),
 *     the results are converted back (en × 0.5 × fontSizePT);
 *   - the style inputs arrive already resolved to local en from the
 *     typeSpecnion (hostMap: generic/lineLength, generic/inlineMargins/*,
 *     generic/columnGutter — SyntheticValue(createInlineLength, ...)
 *     outputs).
 *
 * Formula (all en except the starred pt boundaries):
 *   remainingEn = max(0, availableWidthEn* − marginStartEn − marginEndEn)
 *   basisEn = lineLengthEn ?? remainingEn
 *   columnWidthEn = (basisEn − (n−1) × gutterEn) / n     [n = columnCount, ≥ 1]
 *   widthEn = marginStartEn + n×columnWidthEn + (n−1)×gutterEn + marginEndEn
 *   layout/width = widthEn × 0.5 × fontSizePT*           (own CSS width; may
 *              overflow or undershoot availableWidth — deliberate)
 *   outbound layout/availableWidth = max(0, columnWidthEn) × 0.5 × fontSizePT*
 *              (children live inside the column; a child of an
 *              overflowing parent inherits the overflowing column width)
 *
 * Yields nothing without the style facts in the host map (non-styled
 * nodes inherit the parent's facts unchanged).
 */
export function* horizontalLayoutNodePropertiesGen(
    outerNodePropertiesAPI,
    hostMap,
) {
    const fontSizePT = hostMap.get(`${GENERIC}fontSize`),
        availableWidthPT = outerNodePropertiesAPI.getParentProperty(
            `${LAYOUT}availableWidth`,
        );
    if (
        fontSizePT === undefined ||
        availableWidthPT === undefined ||
        availableWidthPT === null ||
        typeof fontSizePT !== "number"
    )
        return;
    const enFactor = 0.5 * fontSizePT, // pt per local en
        availableWidthEn = availableWidthPT / enFactor,
        marginStartEn = hostMap.get(`${GENERIC}inlineMargins/start`) ?? 0,
        marginEndEn = hostMap.get(`${GENERIC}inlineMargins/end`) ?? 0,
        remainingEn = Math.max(
            0,
            availableWidthEn - marginStartEn - marginEndEn,
        ),
        lineLengthEn = hostMap.get(`${GENERIC}lineLength`),
        basisEn = lineLengthEn ?? remainingEn,
        columnCount = hostMap.get(`${GENERIC}columnCount`) ?? 1,
        gutterEn = hostMap.get(`${GENERIC}columnGutter`) ?? 0,
        columnWidthEn = (basisEn - (columnCount - 1) * gutterEn) / columnCount,
        widthEn =
            marginStartEn +
            columnCount * columnWidthEn +
            (columnCount - 1) * gutterEn +
            marginEndEn;
    yield [`${LAYOUT}width`, widthEn * enFactor];
    yield [`${LAYOUT}availableWidth`, Math.max(0, columnWidthEn) * enFactor];
}

/**
 * The AutoLinearLeading runion, moved to the node channel: line-height
 * from the ACTUAL line width (the node's inherited
 * layout/availableWidth — its column width), instead of the
 * style-declared generic/lineLength (the typeSpecnion's
 * AutoLinearLeadingSyntheticValue).
 *
 * Unit discipline: availableWidthPT is absolute; the runion's
 * coordinate space is base-EN (the a/b points are configured in
 * base-EN), so the actual width is converted via
 *   actualLineWidthEn = (availableWidthPT / (0.5 × fontSizePT)) / relativeFontSize
 * (local en, then normalized to base en — the same normalization the
 * old synthetic applied to the declared lineLength).
 *
 * The algorithm configuration (leading/leading/algorithm, a, b,
 * min/max) stays in the typeSpecnion (leadingGen) — style settings.
 * Only the width-dependent output moves here.
 *
 * Yields layout/leading/line-height-em (unitless ratio) when the
 * AutoLinearLeading algorithm is configured (locally or inherited);
 * the styler's --line-height consumer reads it from the layout
 * channel. Children inherit the ratio; block descendants recompute
 * from their own column width.
 */
export function* leadingNodePropertiesGen(outerNodePropertiesAPI, hostMap) {
    const PREFIX = `${LEADING}leading`,
        ALGORITHM_TYPE = `${PREFIX}/algorithm`,
        algorithm = hostMap.get(ALGORITHM_TYPE);
    if (algorithm !== "AutoLinearLeading") return;
    const fontSizePT = hostMap.get(`${GENERIC}fontSize`),
        relativeFontSize = hostMap.get(`${GENERIC}relativeFontSize`);
    if (typeof fontSizePT !== "number" || typeof relativeFontSize !== "number")
        return;
    // The algorithm points from the settled style map (local en config
    // paths: leading/leading/a/leading etc.).
    const argNames = [`${LAYOUT}availableWidth`],
        paths = [];
    for (const path of pathSpecPathsGen(
        PATH_SPEC_AUTO_LINEAR_LEADING,
        PREFIX,
    )) {
        argNames.push(path.join("/"));
        paths.push(path);
    }
    const configValues = [];
    for (const fullKey of argNames.slice(1)) {
        const value = hostMap.get(fullKey);
        if (value === undefined || value === null) return; // config incomplete
        configValues.push(value);
    }
    const { a, b, minLeading, maxLeading } = fillTreeFromPaths(
        PREFIX,
        paths,
        new Map(zip(argNames.slice(1), configValues)),
    );
    // The synthetic depends on the LOCAL layout/availableWidth — the
    // node's own column width as computed by
    // horizontalLayoutNodePropertiesGen in the same scope (synthetic
    // resolution chains them; the parent-map read would see the
    // *parent's* width).
    function calculate(availableWidthPT) {
        const actualLineWidthEn =
            availableWidthPT / (0.5 * fontSizePT) / relativeFontSize;
        return runion_01_lineHeight(
            a,
            b,
            actualLineWidthEn,
            minLeading,
            maxLeading,
        );
    }
    yield [
        `${LAYOUT}leading/line-height-em`,
        new SyntheticValue(calculate, [`${LAYOUT}availableWidth`]),
    ];
}

/**
 * The node-properties generator set. Keys are used for
 * LocalScopeProperties.propertiesGenerator iteration (a Map).
 */
export const NODE_PROPERTIES_GENERATORS = new Map([
    ["availableSizesGen", availableSizesGen],
    ["horizontalLayoutNodePropertiesGen", horizontalLayoutNodePropertiesGen],
    ["leadingNodePropertiesGen", leadingNodePropertiesGen],
]);
