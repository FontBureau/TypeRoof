import { LAYOUT } from "../../registered-properties-definitions.mjs";
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
 * The node-properties generator set. Keys are used for
 * LocalScopeProperties.propertiesGenerator iteration (a Map).
 */
export const NODE_PROPERTIES_GENERATORS = new Map([
    ["availableSizesGen", availableSizesGen],
]);
