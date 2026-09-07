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
 * The horizontal-layout geometry of a node (5b): the node's own
 * content width derived from its typeSpec style facts (hostMap) and
 * the inherited available width (parent cascade), replacing the
 * typeSpecnion's geometry re-routes (see the commented-out sites in
 * properties-generators.mjs — the style-side yields stay there).
 *
 * Status: STUB for the width-semantics handoff. The proof of the
 * generator/synthetic machinery is the unit test in
 * node-properties.test.mjs (synthetic resolution through the node
 * cascade) and the widget-level behavior test in
 * type-stage-viewer-behavior (a node's effective map answers the
 * computed content width). The exact per-node width semantics — which
 * nodes yield which layout/* keys, how columnCount/columnGutter
 * divide the available width, tombstones — is deliberately left open
 * here; the current yield is the horizontalLayoutRunion formula
 * (lineLengthEN × 0.5 × fontSizePT), which every block node inherits
 * today.
 *
 * Yields nothing without the style facts in the host map (non-styled
 * nodes inherit the parent's width unchanged).
 */
export function* horizontalLayoutNodePropertiesGen(
    outerNodePropertiesAPI,
    hostMap,
) {
    const lineLengthEN = hostMap.get(`${GENERIC}lineLength`),
        fontSizePT = hostMap.get(`${GENERIC}fontSize`);
    if (lineLengthEN === undefined || fontSizePT === undefined) return;
    // The node's own content width in pt. STUB-YIELD: the
    // horizontalLayoutRunion formula; the width-semantics handoff
    // decides whether this becomes layout/width, feeds a column
    // division into children's layout/availableWidth, or both.
    // The dependencies arrive via the hostMap (the generator's input),
    // not the raw property map — hence computed here, not as a
    // SyntheticValue.
    yield [`${LAYOUT}availableWidth`, lineLengthEN * 0.5 * fontSizePT];
    // NOTE: no layout/width yield here — the CSS-width consumer reads
    // layout/width (the styler's innerPropertiesData), and the
    // width-semantics handoff decides which nodes apply their computed
    // content width as CSS width. Until then nodes inherit the
    // parent's width (today: the root pane width — 5a behavior).
}

/**
 * The node-properties generator set. Keys are used for
 * LocalScopeProperties.propertiesGenerator iteration (a Map).
 */
export const NODE_PROPERTIES_GENERATORS = new Map([
    ["availableSizesGen", availableSizesGen],
    ["horizontalLayoutNodePropertiesGen", horizontalLayoutNodePropertiesGen],
]);
