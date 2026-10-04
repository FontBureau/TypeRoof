/**
 * Justification potentials (milestone 4, phase 1): the per-font
 * treatment tables and their resolution.
 *
 * Renamed from varla-varfo's "justification specs" — "potentials":
 * "we ran out of narrowing potential, hence we try widening now".
 * The tables map a DESIGN-SPACE LOCATION to treatments: the levels
 * navigate by AXIS VALUES ONLY, in the table's declared dimension
 * order ([wght, wdth, opsz] here — the third level is the run's
 * OPSZ VALUE, not its font size: an explicit opsz is the author
 * declaring optical intent, and the potentials follow it).
 *
 * A leaf holds the treatments as [min, dflt, max] triples:
 *   - axis treatments (4-char tags, e.g. XTRA): axis values;
 *   - tracking: ABSOLUTE pt letter-spacing per glyph;
 *   - wordspace: FACTOR of the natural space advance (0 = natural).
 * Step semantics (the Treatment Planner, phase 2): one normalized
 * per-line step drives all enabled treatments in parallel, per-side
 * linear maps, clamp at ±1.
 *
 * Data ported VERBATIM (comments included — they carry provenance)
 * from varla-varfo/lib/js/typeSpec.mjs
 * (JUSTIFICATION_SPEC_ROBOTO_FLEX / JUSTIFICATION_SPEC_AMSTEL_VAR).
 * Entries within a level are MONOTONIC (descending in the source
 * data) — validated; interpolation relies on it. Levels may bottom
 * out early (a leaf at any depth).
 *
 * STUBS: hardcoded tables for Roboto Flex + Amstelvar flavors only,
 * discovered best-fit (most specific description wins; Roboto Flex
 * and Roboto Delta are sufficiently compatible). Document-editable
 * potentials (metamodel + storage) are a deliberately deferred
 * design question — see docs/planning/text-composition/ROADMAP.md
 * "Milestone 4 design notes".
 */

export type TreatmentTriple = [number, number, number]; // [min, dflt, max]
export type PotentialsLeaf = { [treatment: string]: TreatmentTriple };
export type PotentialsLevel =
    | PotentialsLeaf
    | { [key: string]: PotentialsLevel };

export interface PotentialsTable {
    /** Ordered axis tags, one per level (e.g. ["wght","wdth","opsz"]). */
    dimensions: string[];
    tree: PotentialsLevel;
}

/** Axis treatments have 4-char tags (XTRA, wdth); tracking and
 *  wordspace are the non-axes treatments. */
const _isAxisTreatment = (treatment: string): boolean => treatment.length === 4;

const _isLeaf = (level: PotentialsLevel): level is PotentialsLeaf => {
    const values = Object.values(level);
    return values.length > 0 && values.every((v) => Array.isArray(v));
};

/** Structural validation — the tables are code, so this throws at
 *  module load (see the bottom of this file): monotonic entries per
 *  level (ascending or descending), well-formed triples, and a
 *  uniform treatment key set across ALL leaves (interpolation
 *  between arbitrary branches relies on it).
 *  NOTE: integer-like object keys enumerate ascending by JS
 *  semantics regardless of declaration order (the descending stub
 *  data reads ascending here) — the monotonic check guards decimal
 *  (non-integer) stops; the resolver sorts defensively anyway. */
export function validatePotentialsTable(table: PotentialsTable): void {
    // the first leaf's key set is the reference for all others
    const reference: { keys: string[] | null } = { keys: null };
    const walk = (level: PotentialsLevel, path: string): void => {
        if (_isLeaf(level)) {
            const keys = Object.keys(level).sort();
            if (reference.keys === null) reference.keys = keys;
            else if (reference.keys.join("") !== keys.join(""))
                throw new Error(
                    `POTENTIALS ERROR leaf at ${path} has treatments ` +
                        `[${keys}] but the table's reference set is ` +
                        `[${reference.keys}] — all leaves must share ` +
                        `the same treatments.`,
                );
            for (const [treatment, triple] of Object.entries(level)) {
                if (triple.length !== 3 || triple.some((v) => !isFinite(v)))
                    throw new Error(
                        `POTENTIALS ERROR ${path}.${treatment} is not a ` +
                            `finite [min, dflt, max] triple.`,
                    );
                if (!(triple[0] <= triple[1] && triple[1] <= triple[2]))
                    throw new Error(
                        `POTENTIALS ERROR ${path}.${treatment} violates ` +
                            `min <= dflt <= max: [${triple}].`,
                    );
            }
            return;
        }
        const keys = Object.keys(level),
            numeric = keys.map((k) => {
                const value = parseFloat(k);
                if (!isFinite(value))
                    throw new Error(
                        `POTENTIALS ERROR level key "${k}" at ${path} ` +
                            `is not numeric.`,
                    );
                return value;
            }),
            ascending = numeric.every(
                (value, index) => index === 0 || numeric[index - 1]! <= value,
            ),
            descending = numeric.every(
                (value, index) => index === 0 || numeric[index - 1]! >= value,
            );
        if (!ascending && !descending)
            throw new Error(
                `POTENTIALS ERROR level at ${path} is not monotonic: ` +
                    `[${keys}] — entries must be numerically ordered.`,
            );
        for (const key of keys)
            walk(
                (level as { [key: string]: PotentialsLevel })[key]!,
                `${path}/${key}`,
            );
    };
    walk(table.tree, table.dimensions.join(">"));
}

/** largest key <= mark and smallest key >= mark, clamped at the
 *  edges (no extrapolation); keys ascending. */
const _findPosBetween = (
    mark: number,
    sortedKeys: number[],
): [number, number] => {
    let lower = sortedKeys[0]!,
        upper = lower;
    for (const key of sortedKeys) {
        if (mark >= key) lower = upper = key;
        if (mark <= key) {
            upper = key;
            break;
        }
    }
    return [lower, upper];
};

const _interpolateLeaf = (
    t: number,
    upper: PotentialsLeaf,
    lower: PotentialsLeaf,
): PotentialsLeaf => {
    const result: PotentialsLeaf = {};
    for (const [treatment, lowerTriple] of Object.entries(lower)) {
        const upperTriple = upper[treatment]!;
        result[treatment] = lowerTriple.map(
            (lowerValue, index) =>
                (upperTriple[index]! - lowerValue) * t + lowerValue,
        ) as TreatmentTriple;
    }
    return result;
};

/** Resolve a design-space location to a treatment leaf: separable
 *  multilinear interpolation over the table's declared dimension
 *  order (the varla-varfo _calculateFontSpec, hardened). Levels
 *  bottom out early (a leaf at any depth); out-of-range values
 *  clamp to the edge stop. The location must carry every dimension
 *  (discovery guarantees it). */
export function calculatePotentials(
    table: PotentialsTable,
    location: ReadonlyMap<string, number>,
): PotentialsLeaf {
    const resolve = (
        level: PotentialsLevel,
        depth: number,
        path: string,
    ): PotentialsLeaf => {
        // bottomed out (early or at full depth)
        if (_isLeaf(level)) return level;
        const dimension = table.dimensions[depth];
        if (dimension === undefined)
            throw new Error(
                `POTENTIALS ERROR the table is deeper than its ` +
                    `dimensions [${table.dimensions}] at ${path}.`,
            );
        const mark = location.get(dimension);
        if (mark === undefined)
            throw new Error(
                `POTENTIALS ERROR the location has no value for ` +
                    `dimension "${dimension}" (path ${path}).`,
            );
        const keyedLevel = level as { [key: string]: PotentialsLevel },
            entries = Object.keys(keyedLevel)
                .map((key) => [parseFloat(key), key] as [number, string])
                .sort(([a], [b]) => a - b),
            [lower, upper] = _findPosBetween(
                mark,
                entries.map(([value]) => value),
            );
        if (lower === upper)
            // exact hit or clamped edge: no interpolation
            return resolve(
                keyedLevel[entries.find(([value]) => value === lower)![1]]!,
                depth + 1,
                `${path}/${lower}`,
            );
        const lowerKey = entries.find(([value]) => value === lower)![1],
            upperKey = entries.find(([value]) => value === upper)![1],
            lowerLeaf = resolve(
                keyedLevel[lowerKey]!,
                depth + 1,
                `${path}/${lowerKey}`,
            ),
            upperLeaf = resolve(
                keyedLevel[upperKey]!,
                depth + 1,
                `${path}/${upperKey}`,
            ),
            t = (mark - lower) / (upper - lower);
        return _interpolateLeaf(t, upperLeaf, lowerLeaf);
    };
    const leaf = resolve(table.tree, 0, table.dimensions.join(">"));
    // step-0-identity invariant (dev check): an axis treatment's
    // interpolated dflt must equal the run's current value for that
    // axis — otherwise step 0 would not be the natural state.
    for (const [treatment, [, dflt]] of Object.entries(leaf)) {
        if (!_isAxisTreatment(treatment)) continue;
        const current = location.get(treatment);
        if (current !== undefined && Math.abs(dflt - current) > 1e-9)
            console.warn(
                `POTENTIALS WARNING interpolated dflt of ${treatment} ` +
                    `(${dflt}) != the location's value (${current}) — ` +
                    `step 0 would not be the natural state.`,
            );
    }
    return leaf;
}

// --- The tables (verbatim port, renamed) ------------------------------

export const JUSTIFICATION_POTENTIALS_AMSTELVAR: PotentialsTable = {
    dimensions: ["wght", "wdth", "opsz"],
    tree: {
        // weight
        // width
        // opsz
        900: {
            100: {
                144: {
                    XTRA: [540, 562, 569],
                    tracking: [-0.4, 0, 0.9],
                    wordspace: [
                        120 / 144 - 1,
                        1 - 1 /*144/144*/,
                        171 / 144 - 1,
                    ],
                },
                14: {
                    XTRA: [500, 562, 580],
                    tracking: [-0.3, 0, 0.15],
                    wordspace: [12 / 14 - 1, 1 - 1 /*14/14*/, 22 / 14 - 1],
                },
                8: {
                    XTRA: [540, 562, 570],
                    tracking: [-0.05, 0, 0.15],
                    wordspace: [6 / 8 - 1, 1 - 1 /*8/8*/, 12 / 8 - 1],
                },
            },
        },
        400: {
            125: {
                // FIXME: PDF is not clear regarding tracking: also [-1, 0, 1]
                //          also suggest -1 instead of -0.1!
                //          Google Sheets "Amstelvar Justification saved" sugests [-1, 0, 0.8]
                144: {
                    XTRA: [550, 562, 570],
                    tracking: [-0.1, 0, 0.8],
                    wordspace: [96 / 144 - 1, 1 - 1 /*144/144*/, 180 / 144 - 1],
                },
                // FIXME: PDF is not clear regarding tracking: also [-0.3, 0, 0.2]
                //          Google Sheets "Amstelvar Justification saved" sugests [-.3, 0, 0.3]
                // FIXME: PDF is not clear regarding XTRA: also [540, 562, 575]
                //          Google Sheets "Amstelvar Justification saved" sugests [540, ?, 580]
                14: {
                    XTRA: [540, 562, 580],
                    tracking: [-0.3, 0, 0.3],
                    wordspace: [12 / 14 - 1, 1 - 1 /*14/14*/, 18 / 14 - 1],
                },
                8: {
                    XTRA: [510, 562, 571],
                    tracking: [-0.1, 0, 0.2],
                    wordspace: [7 / 8 - 1, 1 - 1 /*8/8*/, 14 / 8 - 1],
                },
            },
            // default reading text spec:
            100: {
                144: {
                    XTRA: [545, 562, 570],
                    tracking: [-0.3, 0, 0.7],
                    wordspace: [
                        120 / 144 - 1,
                        1 - 1 /*144/144*/,
                        180 / 144 - 1,
                    ],
                },
                14: {
                    XTRA: [515, 562, 575],
                    tracking: [-0.4, 0, 0.2],
                    wordspace: [8 / 14 - 1, 1 - 1 /*14/14*/, 18 / 14 - 1],
                },
                // FIXME: PDF is not clear regarding tracking: also [-0.1, 0, 0.2]
                //          Google Sheets "Amstelvar Justification saved" sugests [-0.1, 0, 0.25]
                8: {
                    XTRA: [545, 562, 580],
                    tracking: [-0.1, 0, 0.25],
                    wordspace: [6 / 8 - 1, 1 - 1 /*8/8*/, 12 / 8 - 1],
                },
            },
            50: {
                144: {
                    XTRA: [550, 562, 568],
                    tracking: [-0.3, 0, 0.5],
                    wordspace: [
                        120 / 144 - 1,
                        1 - 1 /*144/144*/,
                        180 / 144 - 1,
                    ],
                },
                // FIXME: PDF is not clear regarding XTRA: also [562, 562, 575]
                //          Google Sheets "Amstelvar Justification saved" sugests: [540, ?, 575]
                14: {
                    XTRA: [540, 562, 575],
                    tracking: [0, 0, 0.2],
                    wordspace: [12 / 14 - 1, 1 - 1 /*14/14*/, 18 / 14 - 1],
                },
                8: {
                    XTRA: [540, 562, 568],
                    tracking: [-0.1, 0, 0.15],
                    wordspace: [6 / 8 - 1, 1 - 1 /*8/8*/, 12 / 8 - 1],
                },
            },
        },
        100: {
            100: {
                // FIXME: PDF is not clear regarding wordspace: also [126/144 - 1, 1 - 1/*144/144*/, 180/144 - 1]
                //          Google Sheets "Amstelvar Justification saved" sugests: [126/144 - 1, 1 - 1/*144/144*/, 192/144 - 1]
                144: {
                    XTRA: [552, 562, 568],
                    tracking: [-0.2, 0, 0.7],
                    wordspace: [
                        126 / 144 - 1,
                        1 - 1 /*144/144*/,
                        192 / 144 - 1,
                    ],
                },
                // FIXME: PDF is not clear regarding XTRA: also [515, 562, 575]
                //          Google Sheets "Amstelvar Justification saved" sugests [535, ?, 575]
                14: {
                    XTRA: [535, 562, 575],
                    tracking: [-0.2, 0, 0.2],
                    wordspace: [8 / 14 - 1, 1 - 1 /*14/14*/, 18 / 14 - 1],
                },
                8: {
                    XTRA: [545, 562, 570],
                    tracking: [-0.01, 0, 0.27],
                    wordspace: [8 / 8 - 1, 1 - 1 /*8/8*/, 12 / 8 - 1],
                },
            },
        },
    },
};

export const JUSTIFICATION_POTENTIALS_ROBOTO_FLEX: PotentialsTable = {
    dimensions: ["wght", "wdth", "opsz"],
    tree: {
        // weight
        // width
        // opsz
        1000: {
            100: {
                144: {
                    XTRA: [458, 468, 473],
                    tracking: [-0.8, 0, 0.5],
                    wordspace: [96 / 144 - 1, 1 - 1 /*144/144*/, 150 / 144 - 1],
                },
                14: {
                    XTRA: [458, 468, 472],
                    tracking: [-0.2, 0, 0.13],
                    wordspace: [10 / 14 - 1, 1 - 1 /*14/14*/, 18 / 14 - 1],
                },
                // FIXME: PDF is not clear regarding XTRA: also [462, 468, 475]
                8: {
                    XTRA: [444, 468, 475],
                    tracking: [-0.06, 0, 0.2],
                    wordspace: [6 / 8 - 1, 1 - 1 /*8/8*/, 14 / 8 - 1],
                },
            },
        },
        400: {
            151: {
                144: {
                    XTRA: [455, 468, 479],
                    tracking: [-0.3, 0, 0.5],
                    wordspace: [
                        118 / 144 - 1,
                        1 - 1 /*144/144*/,
                        180 / 144 - 1,
                    ],
                },
                // FIXME: PDF is not clear regarding XTRA: also [450, 468, 471]
                14: {
                    XTRA: [458, 468, 475],
                    tracking: [-0.1, 0, 0.13],
                    wordspace: [12 / 14 - 1, 1 - 1 /*14/14*/, 19 / 14 - 1],
                },
                8: {
                    XTRA: [462, 468, 475],
                    tracking: [-0.06, 0, 0.2],
                    wordspace: [7 / 8 - 1, 1 - 1 /*8/8*/, 14 / 8 - 1],
                },
            },
            // default reading text spec:
            100: {
                144: {
                    XTRA: [460, 468, 471],
                    tracking: [-0.5, 0, 0.5],
                    wordspace: [
                        114 / 144 - 1,
                        1 - 1 /*144/144*/,
                        192 / 144 - 1,
                    ],
                },
                14: {
                    XTRA: [460, 468, 471],
                    tracking: [-0.1, 0, 0.13],
                    wordspace: [12 / 14 - 1, 1 - 1 /*14/14*/, 19 / 14 - 1],
                },
                8: {
                    XTRA: [462, 468, 475],
                    tracking: [-0.06, 0, 0.2],
                    wordspace: [7 / 8 - 1, 1 - 1 /*8/8*/, 14 / 8 - 1],
                },
            },
            25: {
                // FIXME: PDF is not clear regarding wordspace: also: [120/144 - 1, 1 - 1/*144/144*/, 192/144 - 1]}
                // FIXME: PDF is not clear regarding XTRA: also: [466, 468, 473]
                144: {
                    XTRA: [468, 468, 473],
                    tracking: [-0.07, 0, 0.15],
                    wordspace: [
                        120 / 144 - 1,
                        1 - 1 /*144/144*/,
                        168 / 144 - 1,
                    ],
                },
                // FIXME: PDF is not clear regarding wordspace: also: [12/14 - 1, 1 - 1/*14/14*/, 19/14 - 1]}
                14: {
                    XTRA: [463, 468, 472],
                    tracking: [-0.1, 0, 0.13],
                    wordspace: [12 / 14 - 1, 1 - 1 /*14/14*/, 16 / 14 - 1],
                },
                // FIXME: PDF is not clear regarding tracking, also: [-0.06, 0, 0.2]
                8: {
                    XTRA: [464, 468, 475],
                    tracking: [0, 0, 0.2],
                    wordspace: [7 / 8 - 1, 1 - 1 /*8/8*/, 10 / 8 - 1],
                },
            },
        },
        100: {
            100: {
                144: {
                    XTRA: [460, 468, 473],
                    tracking: [-0.3, 0, 0.65],
                    wordspace: [
                        126 / 144 - 1,
                        1 - 1 /*144/144*/,
                        216 / 144 - 1,
                    ],
                },
                // FIXME: PDF is not clear regarding XTRA, also [458, 468, 471]
                14: {
                    XTRA: [458, 468, 472],
                    tracking: [-0.1, 0, 0.13],
                    wordspace: [12 / 14 - 1, 1 - 1 /*14/14*/, 20 / 14 - 1],
                },
                // FIXME: PDF is not clear regarding tracking, also: [-0.04, 0, 0.2]
                8: {
                    XTRA: [460, 468, 471],
                    tracking: [-0.03, 0, 0.16],
                    wordspace: [8 / 8 - 1, 1 - 1 /*8/8*/, 14 / 8 - 1],
                },
            },
        },
    },
};

// The tables are code — validate at module load.
validatePotentialsTable(JUSTIFICATION_POTENTIALS_AMSTELVAR);
validatePotentialsTable(JUSTIFICATION_POTENTIALS_ROBOTO_FLEX);

// --- Best-fit discovery -------------------------------------------------

interface PotentialsDescription {
    /** Family-name prefixes matched against font.name. */
    familyNames: string[];
    table: PotentialsTable;
}

const _POTENTIALS_REGISTRY: PotentialsDescription[] = [
    {
        // Roboto Flex and Roboto Delta are sufficiently compatible
        // (operator decision): the Delta resolves to the Flex table
        // when nothing more specific exists.
        familyNames: ["Roboto Flex", "Roboto Delta"],
        table: JUSTIFICATION_POTENTIALS_ROBOTO_FLEX,
    },
    {
        // "whatever flavor of amstelvar we find" (avar1/avar2)
        familyNames: ["Amstelvar"],
        table: JUSTIFICATION_POTENTIALS_AMSTELVAR,
    },
];

/** The axis values a table navigates/treats — all must exist in the
 *  font's axisRanges for the table to apply. */
const _requiredAxes = (table: PotentialsTable): Set<string> => {
    const required = new Set(table.dimensions),
        collectTreatments = (level: PotentialsLevel): void => {
            if (_isLeaf(level)) {
                for (const treatment of Object.keys(level))
                    if (_isAxisTreatment(treatment)) required.add(treatment);
                return;
            }
            for (const child of Object.values(level)) collectTreatments(child);
        };
    collectTreatments(table.tree);
    return required;
};

/** Best-fit discovery (most specific description wins): a table
 *  claims a font when a family-name prefix matches AND all axes it
 *  navigates/treats exist in the font's axisRanges. Specificity:
 *  longer name prefix first, then more required axes. Returns null
 *  when no table applies. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function discoverPotentials(font: any): PotentialsTable | null {
    const fontName: string = font?.name ?? "",
        axisRanges = font?.axisRanges ?? {},
        candidates: [number, number, PotentialsTable][] = [];
    for (const { familyNames, table } of _POTENTIALS_REGISTRY) {
        const prefix = familyNames
            .filter((name) => fontName.startsWith(name))
            .sort((a, b) => b.length - a.length)[0];
        if (prefix === undefined) continue;
        const required = _requiredAxes(table);
        if (![...required].every((axis) => axis in axisRanges)) continue;
        candidates.push([prefix.length, required.size, table]);
    }
    candidates.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    return candidates[0]?.[2] ?? null;
}
