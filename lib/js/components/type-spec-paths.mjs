import { Path } from "../metamodel.mjs";

/**
 * Logical Levels ↔Model Tree conversion for typeSpec links and their resolution.
 *
 * Two forms of a typeSpec path exist side by side:
 *
 * - The *logical* form is how links are written and resolved:
 *   typeSpec key names in nesting order ("de_DE/quote/paragraph"),
 *   where ".." travels one nesting level.
 * - The *model tree* form is the path in the typeSpec tree model: key
 *   names interleaved with the "children" map field of every level
 *   ("children/de_DE/children/quote/children/paragraph").
 *
 * Trap: one logical level is TWO model tree segments ("children" + key),
 * so naive append/slice operations on model tree paths (Path.sanitize
 * consumes one ".." per segment) corrupt relative links. All
 * "children"-pair handling lives here, exactly once.
 *
 * These helpers are pure conversions on segments/paths; the resolver
 * (prosemirror/integration.typeroof.jsx), link labels, and future
 * path normalization are the consumers.
 */

export const CHILDREN_SEGMENT = "children";

/**
 * Logical typeSpec levels → mode tree path segments.
 * e.g. ["de_DE", "quote"] → ["children", "de_DE", "children", "quote"].
 * Any key name passes through (a typeSpec could genuinely be named
 * "children"; the round-trip stays consistent).
 */
export function logicalLevelSegmentsToModelTreeSegments(logicalLevels) {
    const modelTreeParts = [];
    for (const level of logicalLevels)
        modelTreeParts.push(CHILDREN_SEGMENT, level);
    return modelTreeParts;
}

/**
 * Model tree path segments → logical typeSpec levels, or null when the
 * segments are malformed (anything but a "children"/{key} alternation).
 * The empty segment list (the origin itself) yields empty levels.
 */
export function modelTreeSegmentsToLogicalLevelSegments(modelTreeParts) {
    const logicalLevels = [];
    for (let i = 0; i < modelTreeParts.length; i += 2) {
        if (
            modelTreeParts[i] !== CHILDREN_SEGMENT ||
            modelTreeParts[i + 1] === undefined
        )
            // Rejects malformed shape once, here and nowhere else.
            return null;
        logicalLevels.push(modelTreeParts[i + 1]);
    }
    return logicalLevels;
}

/**
 * Resolve a relative logical link against a base of logical levels,
 * e.g. base ["de_DE", "quote"], link ["..", "hr"] → ["de_DE", "hr"].
 * ".." consumes exactly one level. Returns null when ".." exceeds the
 * base (out of bounds is reported, never clamped) — the caller treats
 * that as a broken link.
 */
export function resolveLogicalLevels(baseLevels, linkParts) {
    const resolved = [...baseLevels];
    for (const part of linkParts) {
        if (part === Path.PARENT) {
            if (resolved.length === 0) return null;
            resolved.pop();
        } else resolved.push(part);
    }
    return resolved;
}

/**
 * Compose a relative (parent-anchored) typeSpec link into an absolute
 * model tree candidate for the resolver's fallback walk. anchorPath is
 * the resolved spec of the parent node, originPath the typeSpec root.
 * Returns the absolute Path, or null when the anchor is outside the
 * origin, has malformed model tree shape, or the link is out of bounds
 * (".." beyond the origin). ".." consumption happens on logical
 * levels, strictly BEFORE any Path.append of the link segments.
 */
export function resolveTypeSpecLinkFromAnchor(
    originPath,
    anchorPath,
    linkParts,
) {
    if (!originPath.isRootOf(anchorPath)) return null;
    const belowOrigin = anchorPath.parts.slice(originPath.parts.length),
        baseLevels = modelTreeSegmentsToLogicalLevelSegments(belowOrigin);
    if (baseLevels === null) return null;
    const resolvedLevels = resolveLogicalLevels(baseLevels, linkParts);
    if (resolvedLevels === null) return null;
    return originPath.append(
        ...logicalLevelSegmentsToModelTreeSegments(resolvedLevels),
    );
}
