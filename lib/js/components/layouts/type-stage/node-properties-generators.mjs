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
import { DEMARCATION_INHERITANCE, TOMBSTONE } from "./type-specnion.mjs";
import { identity, pullFrom, zip } from "../../../util.mjs";
import { lengthToCSSUnit } from "../../length-models.mjs";
import {
    runion_01_lineHeight,
    enToPt,
    enToPtNumeric,
} from "../../type-spec/fundamentals.mjs";
import {
    calculateHorizontalRunion,
    normalizeColumnConfig,
    validateColumnConfig,
} from "./horizontal-layout-runion.mjs";

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
export function* availableSizesGen(inputCascade, hostContext) {
    if (hostContext !== null) return; // root scope only — see docstring
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

const HORIZONTAL_LAYOUT = "horizontalLayout/";

function* manualHorizontalLayoutGen(inputCascade /*, hostContext*/) {
    // The sparse style inputs (lineLength, inlineMargins, columnCount,
    // columnGutter) enter via generator-body INPUT CHECKS: the style
    // channel resolves unset inputs to ABSENT (the createInlineLength
    // synthetic drops on null value/unit), and the resolver drops
    // synthetics with unresolvable deps — an optional input can't flow
    // as a synthetic dependency. So all of them are baked as bound
    // arguments (possibly undefined, the calculation applies its own
    // defaults); when lineLength is unset, the fill variant (basis =
    // remaining width) results.
    const lineLengthEn = inputCascade.get(`${GENERIC}lineLength`),
        marginStartEn = inputCascade.get(`${GENERIC}inlineMargins/start`),
        marginEndEn = inputCascade.get(`${GENERIC}inlineMargins/end`),
        columnCount = inputCascade.get(`${GENERIC}columnCount`),
        gutterEn = inputCascade.get(`${GENERIC}columnGutter`),
        args = [`${LAYOUT}availableWidth`, `${GENERIC}fontSize`];

    // One calculation over the inputs, yielding the geometry pieces.
    // The first five arguments are bound below (baked style inputs);
    // only the two always-resolvable layout facts flow as synthetic
    // dependencies.
    function calculateGeometry(
        lineLengthEn,
        marginStartEn,
        marginEndEn,
        columnCount,
        gutterEn,
        availableWidthPT,
        fontSizePT,
    ) {
        const enFactor = 0.5 * fontSizePT, // pt per local en
            availableWidthEn = availableWidthPT / enFactor,
            // Sparse-input defaults: margins 0, one column, no gutter.
            marginStartEnOr0 = marginStartEn ?? 0,
            marginEndEnOr0 = marginEndEn ?? 0,
            columnCountOr1 = columnCount ?? 1,
            gutterEnOr0 = gutterEn ?? 0,
            // remaining for coulumns and gutters
            remainingEn = Math.max(
                0,
                availableWidthEn - marginStartEnOr0 - marginEndEnOr0,
            ),
            guttersEn = (columnCountOr1 - 1) * gutterEnOr0,
            // lineLength is the PER-COLUMN measure; when unset, the
            // columns subdivide the remaining width evenly (fill).
            columnWidthEn =
                lineLengthEn ?? (remainingEn - guttersEn) / columnCountOr1,
            widthEn =
                marginStartEnOr0 +
                columnCountOr1 * columnWidthEn +
                guttersEn +
                marginEndEnOr0;
        return {
            widthPT: widthEn * enFactor,
            columnWidthPT: Math.max(0, columnWidthEn) * enFactor,
        };
    }

    yield [
        `${LAYOUT}_geometry`,
        new SyntheticValue(
            calculateGeometry.bind(
                null,
                lineLengthEn,
                marginStartEn,
                marginEndEn,
                columnCount,
                gutterEn,
            ),
            args,
            { optional: true },
        ),
    ];

    for (const [propertyName, key] of [
        [`${LAYOUT}width`, "widthPT"],
        // The column box: handed to children as their availableWidth (via
        // the inheritance control below — a re-route over the settled
        // local value, so the control never reads its own under-
        // construction output).
        [`${LAYOUT}columnWidth`, "columnWidthPT"],
    ])
        yield [
            propertyName,
            new SyntheticValue(pullFrom(key), [`${LAYOUT}_geometry`], {
                optional: true,
            }),
        ];
}

// Maps the style channel's columnGutter dynamic-model instance to the
// plain config shape createColumnGap expects. Key mapping: the model's
// GutterPoint "gutter" becomes "gap"; an empty minGutter maps to 0 (a
// gutter is physical — unbounded below would mean overlapping
// columns), an empty maxGutter to Infinity (unbounded above).
function columnGapConfigFromInstance(instance) {
    const algorithm = instance.get("columnGutterAlgorithmTypeKey").value;
    if (algorithm === "constant")
        return {
            algorithm,
            value: instance.get("instance").wrapped.get("value").value,
        };
    if (algorithm === "linear") {
        const linear = instance.get("instance").wrapped,
            point = (name) => {
                const pointInstance = linear.get(name);
                return {
                    columnWidth: pointInstance.get("columnWidth").value,
                    gap: pointInstance.get("gutter").value,
                };
            },
            minGutter = linear.get("minGutter"),
            maxGutter = linear.get("maxGutter");
        return {
            algorithm,
            a: point("a"),
            b: point("b"),
            min: minGutter.isEmpty ? 0 : minGutter.value,
            max: maxGutter.isEmpty ? Infinity : maxGutter.value,
        };
    }
    throw new Error(`KEY ERROR unknown columnGutter algorithm "${algorithm}".`);
}

export function* horizontalLayoutRunionGen(inputCascade /*, hostContext ,*/) {
    // Generator-body INPUT CHECKS: the style channel yields the runion
    // config as horizontalLayout/* keys (see horizontalLayoutRunion in
    // properties-generators.mjs). The description must be complete to
    // execute; when it isn't, the runion doesn't run here — the keys
    // keep inheriting (until an executing scope tombstones them via
    // the consumption policy), so a descendant can still complete the
    // config locally and become the executing scope.
    const minLineLength = inputCascade.get(`${HORIZONTAL_LAYOUT}minLineLength`),
        paddingRatioStart = inputCascade.get(
            `${HORIZONTAL_LAYOUT}paddingRatioStart`,
        ),
        columnGutterInstance = inputCascade.get(
            `${HORIZONTAL_LAYOUT}columnGutter`,
        ),
        growColumns = inputCascade.get(`${HORIZONTAL_LAYOUT}growColumns`),
        columns = inputCascade.get(`${HORIZONTAL_LAYOUT}columns`);
    if (
        minLineLength === undefined ||
        columnGutterInstance === undefined ||
        columns === undefined ||
        // An empty columns list is only complete when growth is
        // actually possible (Infinity or a number >= 1) — pure
        // min-driven growth (mirrors the dispatcher's check).
        (!columns.size &&
            growColumns !== Infinity &&
            !(typeof growColumns === "number" && growColumns >= 1))
    )
        return;

    // Assemble and normalize in the generator body: this is where the
    // description meets a concrete node, so config errors surface here.
    // An invalid config is an authoring error — logged, and the runion
    // doesn't run (same continuation as the incomplete case).
    const rawConfig = {
        minLineLength,
        // LengthValueListModel instance → plain numbers (EN).
        // (Metamodel lists iterate [key, item] pairs.)
        columns: Array.from(columns, ([, item]) => item.value),
        // undefined → normalizeColumnConfig defaults (false / [3/5, 2/5]).
        growColumns,
        columnGap: columnGapConfigFromInstance(columnGutterInstance),
        // PercentNumberModel is 0–100; the config wants a ratio.
        paddingRatio:
            paddingRatioStart === undefined
                ? undefined
                : [paddingRatioStart / 100, 1 - paddingRatioStart / 100],
    };
    let columnConfig;
    try {
        for (const warning of validateColumnConfig(rawConfig))
            console.warn(`horizontalLayoutRunion config: ${warning}`);
        columnConfig = normalizeColumnConfig(rawConfig);
    } catch (error) {
        console.error(
            `horizontalLayoutRunion: invalid config, falling back to fill.`,
            error,
        );
        // A contradictory config is an authoring error; geometry must
        // still resolve (otherwise leading/block-margins collapse).
        yield* manualHorizontalLayoutGen(inputCascade);
        return;
    }

    // The boundary conversion: layout facts (availableWidth) are
    // absolute pt, the runion computes in EN of this scope's fontSize.
    // columnConfig is baked (bound); only the two always-resolvable
    // facts flow as synthetic dependencies. The runion returns null
    // for degenerate widths — the optional chain below drops then.
    function calculate(columnConfig, availableWidthPT, fontSizePT) {
        return calculateHorizontalRunion(
            availableWidthPT / (0.5 * fontSizePT),
            columnConfig,
        );
    }

    yield [
        `${LAYOUT}_runion`,
        new SyntheticValue(
            calculate.bind(null, columnConfig),
            [`${LAYOUT}availableWidth`, `${GENERIC}fontSize`],
            { optional: true },
        ),
    ];

    yield [
        `${GENERIC}columnCount`,
        new SyntheticValue(pullFrom("columnCount"), [`${LAYOUT}_runion`], {
            optional: true,
        }),
    ];

    const propertyRouting = [];
    {
        const pullFromKeys = [
                "lineLength",
                "columnCount",
                "columnGutter",
                "marginStart",
                "marginEnd",
            ],
            rawPropertyTargets = pullFromKeys.map((key) => {
                // The runion's margins are the element's inline margins:
                // route them to the paths the styler consumes (and the
                // consumption policy tombstones for descendants).
                if (key === "marginStart")
                    return `${GENERIC}inlineMargins/start`;
                if (key === "marginEnd") return `${GENERIC}inlineMargins/end`;
                return `${GENERIC}${key}`;
            }),
            ptPropertyTargets = pullFromKeys.map((key, index) => {
                // was `${LAYOUT}columnWidth' but that one can't be a string
                // e.g. "123pt" and must be a number
                if (key === "lineLength") return null;
                // columnCount is not in EN
                if (key === "columnCount") return null;
                return `${rawPropertyTargets[index]}/pt`;
            });
        propertyRouting.push(
            ...zip(pullFromKeys, rawPropertyTargets, ptPropertyTargets),
        );
    }
    for (const [
        pullFromKey,
        rawPropertyTarget,
        ptPropertyTarget,
    ] of propertyRouting) {
        yield [
            rawPropertyTarget,
            new SyntheticValue(pullFrom(pullFromKey), [`${LAYOUT}_runion`], {
                optional: true,
            }),
        ];
        if (ptPropertyTarget !== null)
            yield [
                ptPropertyTarget,
                new SyntheticValue(enToPt, [
                    rawPropertyTarget,
                    `${GENERIC}fontSize`,
                ]),
            ];
    }

    yield [
        `${LAYOUT}columnWidth`,
        new SyntheticValue(enToPtNumeric, [
            `${GENERIC}lineLength`,
            `${GENERIC}fontSize`,
        ]),
    ];

    yield [
        `${LAYOUT}width`,
        new SyntheticValue(
            (runionData, fontSize) =>
                enToPtNumeric(pullFrom("fullWidth")(runionData), fontSize),
            [`${LAYOUT}_runion`, `${GENERIC}fontSize`],
        ),
    ];
}

/**
 * Inheritance policy: a scope that EXECUTED a horizontal layout
 * (marker layout/_runion or layout/_geometry present in the settled
 * own keys) CONSUMES the description and its geometry inputs — they
 * are withheld from node descendants. What flows down instead is the
 * resulting pt fact: availableWidth ← columnWidth (the dispatcher's
 * re-route, layout/* names, deliberately not matched here).
 *
 * Prefix matching covers all derived forms (…/value, …/unit, …/pt,
 * compiled synthetics) including future ones. The pure-fill case
 * (nothing configured) also yields _geometry — harmless: there are
 * no matching keys to withhold. Explicit local controls win over
 * policy (resurrection hatch, see _resolveInheritableProperties).
 *
 * NOTE: the execution markers can also arrive via inheritance (the
 * parent executed) — the check can't distinguish layers, but the
 * misfire is benign: any scope holding geometry inputs executed too.
 */
export function* horizontalLayoutConsumptionPolicyGen(ownPropertyKeys) {
    const executed =
        ownPropertyKeys.includes(`${LAYOUT}_runion`) ||
        ownPropertyKeys.includes(`${LAYOUT}_geometry`);
    if (!executed) return;
    // Internal execution markers: never inherited, they are scope-local
    // wiring for the synthetic graph.
    yield [`${LAYOUT}_runion`, TOMBSTONE];
    yield [`${LAYOUT}_geometry`, TOMBSTONE];
    for (const key of ownPropertyKeys)
        if (
            key.startsWith(HORIZONTAL_LAYOUT) ||
            key.startsWith(`${GENERIC}lineLength`) ||
            key.startsWith(`${GENERIC}columnGutter`) ||
            key.startsWith(`${GENERIC}inlineMargins`) ||
            key === `${GENERIC}columnCount`
        )
            yield [key, TOMBSTONE];
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
 *   columnWidthEn = lineLengthEn
 *                   ?? (remainingEn − (n−1) × gutterEn) / n
 *                                                       [n = columnCount, ≥ 1]
 *   (lineLength is the PER-COLUMN measure; when unset, the columns
 *   subdivide the remaining width evenly)
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
export function* horizontalLayoutNodePropertiesGen(inputCascade, hostContext) {
    const algorithm = inputCascade.get(`${HORIZONTAL_LAYOUT}algorithm`);
    // The runion executes only on a COMPLETE description (otherwise
    // the branch would produce no geometry at all and the leading/
    // block-margins chain collapses on the missing columnWidth). This
    // is the same presence check horizontalLayoutRunionGen applies;
    // hoisting it here decides the branch, so a freshly-selected
    // algorithm without config yet falls back to fill.
    const columnsValue = inputCascade.get(`${HORIZONTAL_LAYOUT}columns`),
        growColumnsValue = inputCascade.get(`${HORIZONTAL_LAYOUT}growColumns`),
        // Pure min-driven growth: an empty columns list is complete
        // when growth is actually possible (Infinity or a number >= 1).
        growthPossible =
            growColumnsValue === Infinity ||
            (typeof growColumnsValue === "number" && growColumnsValue >= 1),
        runionConfigIsComplete =
            algorithm === "HorizontalLayoutRunionModel" &&
            inputCascade.get(`${HORIZONTAL_LAYOUT}minLineLength`) !==
                undefined &&
            inputCascade.get(`${HORIZONTAL_LAYOUT}columnGutter`) !==
                undefined &&
            columnsValue !== undefined &&
            (columnsValue.size > 0 || growthPossible);

    if (runionConfigIsComplete)
        yield* horizontalLayoutRunionGen(inputCascade, hostContext);
    else
        // "ManualHorizontalLayoutModel" OR undefined (NULL default) OR
        // an incomplete runion description: empty inputs degrade to
        // fill — columnWidth = availableWidth.
        yield* manualHorizontalLayoutGen(inputCascade, hostContext);

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
export function* leadingNodePropertiesGen(inputCascade, hostContext) {
    void hostContext;
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
    // The synthetic depends on the LOCAL layout/columnWidth — the
    // node's own computed line box as computed by
    // horizontalLayoutNodePropertiesGen in the same scope (the resolver
    // chains the synthetics topologically). NOT layout/availableWidth:
    // that is the INPUT budget (inherited from the parent); the actual
    // line width is the column width after lineLength/margins/columns.
    function calculate(columnWidthPT, fontSizePT, relativeFontSize) {
        const actualLineWidthEn =
            columnWidthPT / (0.5 * fontSizePT) / relativeFontSize;
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
                `${LAYOUT}columnWidth`,
                `${GENERIC}fontSize`,
                `${GENERIC}relativeFontSize`,
            ],
            { optional: true },
        ),
    ];
}

function createBlockMargin(value, unit, baseFontSize, fontSize, lineHeightEm) {
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
    void hostContext; // part of the generator contract, unused here
    // FIXME: make that ${LAYOUT}
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
 * Inheritance policy: block margins are style, inherited via the
 * typeSpecnion (and CSS margins don't inherit either) — the node
 * channel must not re-propagate them through the parent layer of the
 * cascade. A node's margin config is consumed by its own margin
 * computation (blockMarginsLayoutGen). Unconditional: margins are
 * consumed whenever present.
 */
export function* blockMarginsConsumptionPolicyGen(ownPropertyKeys) {
    for (const key of ownPropertyKeys)
        if (key.startsWith(`${GENERIC}blockMargins`)) yield [key, TOMBSTONE];
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
