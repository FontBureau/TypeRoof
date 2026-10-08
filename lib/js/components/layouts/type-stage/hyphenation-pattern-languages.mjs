/**
 * Hyphenation pattern language derivation (milestone 3).
 *
 * Extracted from ./index.typeroof.jsx and memoized (plan
 * 2026-10-08-1710-typespec-edit-perf-hyphenation-drive, Phase 1):
 * requireHyphenationPatternsCoherenceFn runs on every root metamorphose
 * where typeSpec/stylePatchesSource is a draft — including pure
 * axis-value edits — and re-derived the identical pattern-key set with
 * a full recursive tree walk each time (languages unchanged).
 *
 * Two-level memoization:
 *
 *  1. createTypeSpecLanguageWalker — the effective-language-parts of
 *     a subtree are a pure function of (languageTag content, children
 *     content, inherited context). Cacheability per metamodel
 *     semantics (pinned by tests): isDraft === false GUARANTEES
 *     unchanged, and unchanged fields keep their identity across
 *     metamorphoses (a CHANGED draft's identity lives on as the new
 *     immutable; an unchanged draft is discarded and its OLD_STATE
 *     carries). So a node is cacheable iff its languageTag struct and
 *     its children map are both immutable, and drafts never enter the
 *     memo (they are never seen twice). The coherence calls this
 *     mid-metamorphose with a DRAFT root whose child reads return
 *     potential write proxies — per-draft objects that never hit if
 *     used as identities; unwrapPotentialWriteProxy yields the carried
 *     immutables instead. Net effect: a non-language edit at the root
 *     (the axis drag) is a single O(1) hit for the WHOLE tree; deep
 *     language/structure edits miss exactly along the changed path.
 *
 *  2. createHyphenationPatternDeriver — the complete derivation (tag
 *     creation, style-patch walk, Set algebra, pattern-key mapping) is
 *     memoized on (parts identity, stylePatchesSource identity): when
 *     nothing language-relevant changed, the coherence's entire work
 *     collapses to the O(1) walk hit plus two identity compares.
 *
 * Both levels always return the FULL set, never a delta: the shell's
 * async resolution window primes installedHyphenationPatterns empty so
 * that the coherence re-yields the complete requirement set (see plan,
 * "Key Discoveries"). The installation state is deliberately NOT part
 * of the memo keys — the coherence diffs requiredKeys against
 * installedHyphenationPatterns on every pass.
 *
 * Resource requirements are yielded DIRECTLY from derived language
 * usage (by the coherence in index.typeroof.jsx). There is
 * deliberately no serializable reference map: the actual pattern
 * objects live only in the session dependency
 * installedHyphenationPatterns and are reproducible vendored assets.
 */
import { unwrapPotentialWriteProxy } from "../../../metamodel.mjs";
import { createLanguageTag } from "../../language-tags.typeroof.jsx";
import { languageToHyphenationPatternKey } from "./text-composition/hyphenator.ts";

export function languageTagParts(languageTag) {
    return Object.fromEntries(
        ["language", "script", "region"].map((key) => {
            const value = languageTag.get(key);
            return [key, value.isEmpty ? null : value.value];
        }),
    );
}

export function partsToLanguageTag({ language, script, region }) {
    return createLanguageTag(language, script, region);
}

const NULL_CONTEXT = Object.freeze({
    language: null,
    script: null,
    region: null,
});

export function createTypeSpecLanguageWalker() {
    // The effective-language-parts of a subtree are a pure function
    // of (languageTag content, children content, inherited context).
    //
    // Cacheability per metamodel semantics (operator, 2026-10-08):
    // isDraft === false GUARANTEES unchanged, and unchanged fields
    // keep their identity across metamorphoses (both pinned by
    // tests). So a node is cacheable iff its languageTag struct and
    // its children map are both immutable — and drafts never enter
    // the memo (a draft is guaranteed to never be seen twice).
    //
    // The coherence calls this mid-metamorphose with a DRAFT root
    // whose child reads return potential write proxies — per-draft
    // objects, the reason identity-keying without unwrapping never
    // hits. unwrapPotentialWriteProxy yields the carried immutables:
    // an axis edit at the root leaves languageTag AND children
    // immutable => the whole tree is one top-level hit.
    //
    // memo: childrenMap (immutable) -> contextKey -> {languageTag, result}
    const memo = new WeakMap(),
        subtreeLanguageParts = (rawNode, inherited) => {
            const node = unwrapPotentialWriteProxy(rawNode),
                languageTag = unwrapPotentialWriteProxy(
                    node.get("languageTag"),
                ),
                children = unwrapPotentialWriteProxy(node.get("children")),
                contextKey = `${inherited.language}|${inherited.script}|${inherited.region}`,
                cacheable = !languageTag.isDraft && !children.isDraft;
            if (cacheable) {
                const byContext = memo.get(children),
                    entry = byContext?.get(contextKey);
                if (entry !== undefined && entry.languageTag === languageTag)
                    return entry.result;
            }
            const local = languageTagParts(languageTag),
                effective = {
                    language: local.language ?? inherited.language ?? null,
                    script: local.script ?? inherited.script ?? null,
                    region: local.region ?? inherited.region ?? null,
                },
                result = [];
            if (effective.language !== null) result.push(effective);
            for (const [, child] of children)
                result.push(...subtreeLanguageParts(child, effective));
            if (cacheable) {
                let byContext = memo.get(children);
                if (byContext === undefined) {
                    byContext = new Map();
                    memo.set(children, byContext);
                }
                byContext.set(contextKey, { languageTag, result });
            }
            return result;
        };
    return {
        // The full effective language parts of the whole typeSpec
        // tree (memoized). Do not mutate the returned array.
        effectiveTypeSpecLanguageParts: (typeSpec) =>
            subtreeLanguageParts(typeSpec, NULL_CONTEXT),
    };
}

// Simple style patches can override language on an inline run.
// Composite patches only reference source patches already in this map,
// so walking every simple source covers them too. A partial patch tag
// (e.g. region-only) is combined with every effective TypeSpec tag it
// could patch; a language override is context-independent.
//
// Flat iteration (few patches in practice), deliberately NOT memoized
// itself — the deriver below memoizes around it.
export function* walkStylePatchLanguages(
    stylePatchesSource,
    typeSpecLanguageParts,
) {
    for (const [, stylePatch] of stylePatchesSource) {
        if (stylePatch.get("stylePatchTypeKey").value !== "SimpleStylePatch")
            continue;
        const instance = stylePatch.get("instance");
        if (!instance.hasWrapped) continue;
        const local = languageTagParts(instance.wrapped.get("languageTag"));
        if (local.language !== null) {
            const tag = partsToLanguageTag(local);
            if (tag !== null) yield tag;
            continue;
        }
        if (local.script === null && local.region === null) continue;
        for (const base of typeSpecLanguageParts) {
            const tag = createLanguageTag(
                base.language,
                local.script ?? base.script,
                local.region ?? base.region,
            );
            if (tag !== null) yield tag;
        }
    }
}

export function createHyphenationPatternDeriver() {
    const walker = createTypeSpecLanguageWalker();
    // Single-slot derivation memo: the inputs collapse to the two
    // identities below; parts identity is stable iff the walker hit
    // all the way (nothing language-relevant changed anywhere).
    let cached = null;
    return {
        // The full set of required hyphenation pattern keys for the
        // given typeSpec tree + style patches. Do not mutate the
        // returned Set.
        deriveRequiredPatternKeys: (typeSpec, stylePatchesSource) => {
            const parts = walker.effectiveTypeSpecLanguageParts(typeSpec);
            if (
                cached !== null &&
                cached.parts === parts &&
                cached.stylePatchesSource === stylePatchesSource
            )
                return cached.requiredKeys;
            const typeSpecLanguages = parts
                    .map(partsToLanguageTag)
                    .filter((tag) => tag !== null),
                languages = new Set([
                    ...typeSpecLanguages,
                    ...walkStylePatchLanguages(stylePatchesSource, parts),
                ]),
                requiredKeys = new Set();
            for (const language of languages) {
                const key = languageToHyphenationPatternKey(language);
                if (key !== null) requiredKeys.add(key);
            }
            cached = { parts, stylePatchesSource, requiredKeys };
            return requiredKeys;
        },
    };
}
