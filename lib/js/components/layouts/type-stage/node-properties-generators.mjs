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
import { DEMARCATION_INHERITANCE } from "./type-specnion.mjs";
import { identity, zip } from "../../../util.mjs";
import { lengthToCSSUnit } from "../../length-models.mjs";
import { runion_01_lineHeight } from "../../type-spec-fundamentals.mjs";

function _ucFirst(name) {
    return `${name[0].toUpperCase()}${name.slice(1)}`;
}

/**
 * The generator contract of the node-properties channel:
 *     gen(inputCascade, hostContext)
 *
 * inputCascade: CascadingMap([["typeSpec", typeSpecMap], ["parent", parentLayoutMap]])
 *     — the node's settled style facts + the inherited layout facts.
 *     Read it for INPUT checks (conditional yields). Own-scope values
 *     enter computation ONLY as synthetic dependencies (the resolver
 *     orders them); a generator body must never read its own yields.
 * hostContext: the document-node context ({node, nodeSpec, metaInfo,
 *     index, isLast}) or null at the root / while unset.
 */

/**
 * The root scope of the node-properties channel owns the document's
 * width/height (widget deps of the root, delivered via the typeSpec
 * layer's seeded defaults as `layout/width|height` LengthModels) and
 * resolves them against the environment facts (the parent/defaults
 * layer, `layout/environment/...`), yielding the available sizes in pt.
 *
 * Only the root scope has these keys — at any other node the
 * generator yields nothing (facts arrive via inheritance instead).
 */
export function* availableSizesGen(inputCascade /*, hostContext */) {
    const getEnvironmentFn = (environmentKey, dim) =>
        inputCascade.get(`${LAYOUT}environment/${environmentKey}/${dim}`);
    for (const dimension of ["width", "height"]) {
        const lengthItem = inputCascade.get(`${LAYOUT}${dimension}`);
        // Skip when unset (not a LengthModel) or when the key is a
        // number already (inherited/resolved, e.g. re-yield by a child
        // scope) — the root owns the LengthModel form.
        if (
            !lengthItem ||
            typeof lengthItem !== "object" ||
            typeof lengthItem.get !== "function"
        )
            continue;
        const value = lengthToCSSUnit(
            getEnvironmentFn,
            lengthItem,
            dimension,
            "pt" /*targetUnit*/,
        );
        if (value === null) continue;
        yield [`${LAYOUT}available${_ucFirst(dimension)}`, value];
        // NOTE: no layout/width|height identity yields — the geometry
        // generator (horizontalLayoutNodePropertiesGen) owns
        // layout/width everywhere, covering the root's fill case
        // (width = availableWidth when no style overrides). Two
        // generators yielding the same property collide in the raw
        // map: a later OPTIONAL yield that drops erases the earlier
        // resolvable one.
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
 *     typeSpecnion (typeSpec layer: generic/lineLength,
 *     generic/inlineMargins/*, generic/columnGutter — settled
 *     SyntheticValue(createInlineLength, ...) outputs; the registry
 *     defaults make them always resolvable).
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
 * All computation happens in synthetics — the resolver orders them
 * (layout/availableWidth resolves before layout/width locally, then
 * the re-yield of availableWidth for children reads the settled local
 * value via the cascade... no: synthetics resolve within the SAME
 * scope's raw map; the outbound yield is a second synthetic over the
 * same inputs).
 */
export function* horizontalLayoutNodePropertiesGen(
    inputCascade /*, hostContext */,
) {
    // lineLength enters via a generator-body INPUT CHECK: the style
    // channel resolves an unset lineLength to ABSENT (the
    // createInlineLength synthetic drops on null value/unit), and the
    // resolver drops synthetics with null-valued deps — an optional
    // input can't flow as a synthetic dependency. So: when lineLength
    // is set, it's baked as a constant; when unset, the fill variant
    // (basis = remaining width) is yielded instead.
    const lineLengthEn = inputCascade.get(`${GENERIC}lineLength`);
    const args = [
        `${LAYOUT}availableWidth`,
        `${GENERIC}fontSize`,
        `${GENERIC}inlineMargins/start`,
        `${GENERIC}inlineMargins/end`,
        `${GENERIC}columnCount`,
        `${GENERIC}columnGutter`,
    ];

    // One calculation over the inputs, yielding the geometry pieces.
    // lineLengthEnOrNull is baked (generator-body input check).
    function calculateGeometry(
        availableWidthPT,
        fontSizePT,
        marginStartEn,
        marginEndEn,
        columnCount,
        gutterEn,
    ) {
        const enFactor = 0.5 * fontSizePT, // pt per local en
            availableWidthEn = availableWidthPT / enFactor,
            // Sparse-input defaults: margins 0, one column, no gutter.
            marginStartEnOr0 = marginStartEn ?? 0,
            marginEndEnOr0 = marginEndEn ?? 0,
            columnCountOr1 = columnCount ?? 1,
            gutterEnOr0 = gutterEn ?? 0,
            remainingEn = Math.max(
                0,
                availableWidthEn - marginStartEnOr0 - marginEndEnOr0,
            ),
            basisEn = lineLengthEn ?? remainingEn,
            columnWidthEn =
                (basisEn - (columnCountOr1 - 1) * gutterEnOr0) / columnCountOr1,
            widthEn =
                marginStartEnOr0 +
                columnCountOr1 * columnWidthEn +
                (columnCountOr1 - 1) * gutterEnOr0 +
                marginEndEnOr0;
        return {
            widthPT: widthEn * enFactor,
            columnWidthPT: Math.max(0, columnWidthEn) * enFactor,
        };
    }

    yield [
        `${LAYOUT}width`,
        new SyntheticValue((...a) => calculateGeometry(...a).widthPT, args, {
            optional: true,
        }),
    ];
    // The column box: handed to children as their availableWidth (via
    // the inheritance control below — a re-route over the settled
    // local value, so the control never reads its own under-
    // construction output).
    yield [
        `${LAYOUT}columnWidth`,
        new SyntheticValue(
            (...a) => calculateGeometry(...a).columnWidthPT,
            args,
            { optional: true },
        ),
    ];
    // Children live inside the column: their availableWidth is the
    // column width. A child of an overflowing parent inherits the
    // overflowing column width. DEMARCATION_INHERITANCE: resolves
    // against the SETTLED local properties (resolveInheritableProperties
    // runs resolveSyntheticProperties over ownProperties), never
    // against this scope's under-construction yields.
    yield [
        `${LAYOUT}availableWidth`,
        new SyntheticValue(identity, [`${LAYOUT}columnWidth`], {
            optional: true,
        }),
        DEMARCATION_INHERITANCE,
    ];
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
 * min/max) stays in the typeSpecnion (leadingGen) — style settings,
 * read here from the typeSpec layer for the conditional yield.
 * Only the width-dependent output moves here.
 *
 * Yields layout/leading/line-height-em (unitless ratio) when the
 * AutoLinearLeading algorithm is configured (locally or inherited);
 * the styler's --line-height consumer reads it from the layout
 * channel. Children inherit the ratio; block descendants recompute
 * from their own column width.
 */
export function* leadingNodePropertiesGen(inputCascade /*, hostContext */) {
    const PREFIX = `${LEADING}leading`,
        ALGORITHM_TYPE = `${PREFIX}/algorithm`,
        LEADING_HEIGHT_EM_STYLE = `${PREFIX}/line-height-em`,
        algorithm = inputCascade.get(ALGORITHM_TYPE);
    if (algorithm === "ManualLeading") {
        // The style channel yields the configured value at
        // leading/leading/line-height-em (a plain number for
        // ManualLeading); re-yield it as the layout key the styler
        // reads. A re-route, not a computation — the style value is
        // the semantic source.
        const manualValue = inputCascade.get(LEADING_HEIGHT_EM_STYLE);
        if (manualValue === undefined || manualValue === null) return;
        yield [`${LAYOUT}leading/line-height-em`, manualValue];
        return;
    }
    if (algorithm !== "AutoLinearLeading") return;
    // The algorithm points (local en config paths:
    // leading/leading/a/leading etc.) — from the typeSpec layer via
    // the cascade; resolved values, always present when the algorithm
    // is configured (leadingGen null-yields them otherwise... check).
    const configNames = [],
        paths = [];
    for (const path of pathSpecPathsGen(
        PATH_SPEC_AUTO_LINEAR_LEADING,
        PREFIX,
    )) {
        configNames.push(path.join("/"));
        paths.push(path);
    }
    const configValues = [];
    for (const fullKey of configNames) {
        const value = inputCascade.get(fullKey);
        if (value === undefined || value === null) return; // config incomplete
        configValues.push(value);
    }
    const { a, b, minLeading, maxLeading } = fillTreeFromPaths(
        PREFIX,
        paths,
        new Map(zip(configNames, configValues)),
    );
    // The synthetic depends on the LOCAL layout/availableWidth — the
    // node's own column width as computed by
    // horizontalLayoutNodePropertiesGen in the same scope (the resolver
    // chains the synthetics topologically).
    function calculate(availableWidthPT, fontSizePT, relativeFontSize) {
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
        new SyntheticValue(
            calculate,
            [
                `${LAYOUT}availableWidth`,
                `${GENERIC}fontSize`,
                `${GENERIC}relativeFontSize`,
            ],
            { optional: true },
        ),
    ];
}

function createBlockMargin(value, unit, baseFontSize, fontSize, lineHeightEm) {
    console.log("createBlockMargin", {
        value,
        unit,
        baseFontSize,
        fontSize,
        lineHeightEm,
    });
    if (value === null || unit === null) return null;
    if (unit === "lineHeight") return `${value * lineHeightEm * fontSize}pt`;
    if (unit === "em") return `${value * fontSize}pt`;
    if (unit === "baseEm") return `${value * baseFontSize}pt`;
    // lineHeightAfter and emAfter must be resolved by the renderer,
    // which reads fontSize/line-height-em from the next sibling's typeSpecnion.
    if (unit === "lineHeightAfter" || unit === "emAfter") return null;
    // e.g. unit === 'pt'
    return `${value}${unit}`;
}

// depends on line-height-em which is a layout property
function* blockMarginsLayoutGen(inputCascade, hostContext) {
    // FIXME: make that ${LAYOUT}
    console.log(`blockMarginsLayoutGen hostContext:`, hostContext);
    const basePath = `${GENERIC}blockMargins/`;
    for (const targetName of ["start", "end"]) {
        const targetPath = `${basePath}${targetName}`; // no trailing slash!!
        // Input check: yield only where the inputs are wired (a layout
        // without the node-properties channel — e.g. type-tools-grid —
        // has neither the margin paths nor layout/leading in its
        // cascade; the synthetic would throw on unresolvable deps).
        if (
            !inputCascade.has(`${targetPath}/value`) ||
            !inputCascade.has(`${targetPath}/unit`)
        )
            continue;
        const args = [
            `${targetPath}/value`,
            `${targetPath}/unit`,
            `${GENERIC}baseFontSize`,
            `${GENERIC}fontSize`,
            `${LAYOUT}leading/line-height-em`,
        ];
        yield [`${targetPath}`, new SyntheticValue(createBlockMargin, args)];
    }
}

/**
 * The node-properties generator set. Keys are used for
 * LocalScopeProperties.propertiesGenerator iteration (a Map).
 */
export const NODE_PROPERTIES_GENERATORS = new Map([
    ["availableSizesGen", availableSizesGen],
    ["horizontalLayoutNodePropertiesGen", horizontalLayoutNodePropertiesGen],
    ["blockMarginsLayoutGen", blockMarginsLayoutGen],
    ["leadingNodePropertiesGen", leadingNodePropertiesGen],
]);
