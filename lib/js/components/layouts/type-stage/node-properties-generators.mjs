import { LAYOUT, GENERIC } from "../../registered-properties-definitions.mjs";
import { SyntheticValue } from "./synthetic-values.mjs";
import { identity } from "../../../util.mjs";
import { lengthToCSSUnit } from "../../length-models.mjs";

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
 * The node-properties generator set. Keys are used for
 * LocalScopeProperties.propertiesGenerator iteration (a Map).
 */
export const NODE_PROPERTIES_GENERATORS = new Map([
    ["availableSizesGen", availableSizesGen],
    ["horizontalLayoutNodePropertiesGen", horizontalLayoutNodePropertiesGen],
]);
