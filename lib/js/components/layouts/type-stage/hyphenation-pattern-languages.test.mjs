/**
 * Equivalence tests for the memoized typeSpec language walk
 * (plan 2026-10-08-1710-typespec-edit-perf-hyphenation-drive, Phase 1).
 *
 * The memoized walker (createTypeSpecLanguageWalker) must return the
 * same full effective-language-parts set as the pre-change recursive
 * generator, which is copied here as the reference oracle. Mutations
 * are applied through real draft/metamorphose cycles so the cache is
 * exercised exactly the way the coherence exercises it (unchanged
 * subtrees keep identity, changed paths get fresh drafts).
 */
import { describe, it, expect } from "vitest";
import { InstalledFontsModel, InstalledFontModel } from "../../main-model.mjs";
import {
    StylePatchesMapModel,
    TypeSpecModel,
} from "../../type-spec/models.mjs";
import { createLanguageTag } from "../../language-tags.typeroof.jsx";
import {
    createHyphenationPatternDeriver,
    createTypeSpecLanguageWalker,
    languageTagParts,
    partsToLanguageTag,
    walkStylePatchLanguages,
} from "./hyphenation-pattern-languages.mjs";

// --- reference oracle: the pre-change recursive walk --------------
function* referenceWalkEffectiveTypeSpecLanguageParts(
    typeSpec,
    inherited = {},
) {
    const local = languageTagParts(typeSpec.get("languageTag")),
        effective = {
            language: local.language ?? inherited.language ?? null,
            script: local.script ?? inherited.script ?? null,
            region: local.region ?? inherited.region ?? null,
        };
    if (effective.language !== null) yield effective;
    for (const [, child] of typeSpec.get("children"))
        yield* referenceWalkEffectiveTypeSpecLanguageParts(child, effective);
}

// --- fixtures -------------------------------------------------------
function makeDeps() {
    const empty = (Model) => Model.createPrimalDraft({}).metamorphose(),
        font = empty(InstalledFontModel),
        installedFonts = empty(InstalledFontsModel),
        stylePatchesSource = StylePatchesMapModel.createPrimalDraft({
            font,
            installedFonts,
        }).metamorphose();
    return { font, installedFonts, stylePatchesSource };
}

function buildTree() {
    // root: en; section: (inherit); section/deep: region DE;
    // fr-branch: fr+Latn; fr-branch/belgium: region BE
    const deps = makeDeps(),
        draft = TypeSpecModel.createPrimalDraft(deps),
        newChild = () =>
            draft.get("children").constructor.Model.createPrimalDraft(deps),
        section = newChild(),
        deep = newChild(),
        frBranch = newChild(),
        belgium = newChild();
    draft.get("languageTag").get("language").value = "en";
    deep.get("languageTag").get("region").value = "DE";
    section.get("children").set("deep", deep);
    frBranch.get("languageTag").get("language").value = "fr";
    frBranch.get("languageTag").get("script").value = "Latn";
    belgium.get("languageTag").get("region").value = "BE";
    frBranch.get("children").set("belgium", belgium);
    draft.get("children").set("section", section);
    draft.get("children").set("fr-branch", frBranch);
    return draft.metamorphose();
}

function expectEquivalent(walker, state) {
    // Two runs: the second is served from (partial) cache.
    for (let run = 0; run < 2; run++) {
        const memoized = walker.effectiveTypeSpecLanguageParts(state),
            reference = [...referenceWalkEffectiveTypeSpecLanguageParts(state)];
        expect(memoized).toEqual(reference);
    }
}

describe("createTypeSpecLanguageWalker (memoized) vs reference walk", () => {
    it("matches on a nested tree with partial subtag inheritance", () => {
        const walker = createTypeSpecLanguageWalker(),
            state = buildTree();
        expectEquivalent(walker, state);
        // sanity: the expected effective parts explicitly (every node
        // with an effective language yields, incl. inheriting nodes)
        expect(walker.effectiveTypeSpecLanguageParts(state)).toEqual([
            { language: "en", script: null, region: null }, // root
            { language: "en", script: null, region: null }, // section
            { language: "en", script: null, region: "DE" }, // deep
            { language: "fr", script: "Latn", region: null }, // fr-branch
            { language: "fr", script: "Latn", region: "BE" }, // belgium
        ]);
    });

    it("stays equivalent across a mutation battery (draft/metamorphose cycles)", () => {
        const walker = createTypeSpecLanguageWalker();
        let state = buildTree();
        expectEquivalent(walker, state);

        const mutate = (fn) => {
            const draft = state.getDraft();
            fn(draft);
            state = draft.metamorphose();
            expectEquivalent(walker, state);
        };

        // non-language edit at the root (the "axis drag" case)
        mutate((draft) => {
            draft.get("baseFontSize").value = 20;
        });
        // deep partial-subtag change (same context)
        mutate((draft) => {
            draft
                .get("children")
                .get("section")
                .get("children")
                .get("deep")
                .get("languageTag")
                .get("region").value = "CH";
        });
        // mid-tree language change: re-anchors the context of "deep"
        mutate((draft) => {
            draft
                .get("children")
                .get("section")
                .get("languageTag")
                .get("language").value = "de";
        });
        // deep full-language override under the new context
        mutate((draft) => {
            draft
                .get("children")
                .get("section")
                .get("children")
                .get("deep")
                .get("languageTag")
                .get("language").value = "it";
        });
        // structural: add a child
        mutate((draft) => {
            const child = draft
                .get("children")
                .constructor.Model.createPrimalDraft(makeDeps());
            child.get("languageTag").get("language").value = "es";
            draft.get("children").set("es-branch", child);
        });
        // structural: remove a subtree
        mutate((draft) => {
            draft.get("children").delete("fr-branch");
        });
        // language cleared at the root (enum-or-empty: clear())
        mutate((draft) => {
            draft.get("languageTag").get("language").clear();
        });
    });

    it("relies on a real metamodel property: unchanged subtrees keep identity", () => {
        // The memo's hit rate (not its correctness) depends on this:
        // a non-language edit must not re-identify unchanged children.
        const before = buildTree(),
            draft = before.getDraft();
        draft.get("baseFontSize").value = 20;
        const after = draft.metamorphose();
        expect(after.get("children")).toBe(before.get("children"));
        expect(after.get("children").get("section")).toBe(
            before.get("children").get("section"),
        );
    });
});

describe("createHyphenationPatternDeriver", () => {
    it("shortcut: identity-stable result for language-irrelevant edits, fresh derivation on language edits", () => {
        const deriver = createHyphenationPatternDeriver(),
            stylePatchesSource = makeDeps().stylePatchesSource;
        let state = buildTree();

        const first = deriver.deriveRequiredPatternKeys(
            state,
            stylePatchesSource,
        );
        // content contract: equals a cold derivation
        expect(first).toEqual(
            createHyphenationPatternDeriver().deriveRequiredPatternKeys(
                state,
                stylePatchesSource,
            ),
        );

        // axis-like edit at the root: complete shortcut, same Set identity
        let draft = state.getDraft();
        draft.get("baseFontSize").value = 20;
        state = draft.metamorphose();
        const second = deriver.deriveRequiredPatternKeys(
            state,
            stylePatchesSource,
        );
        expect(second).toBe(first);

        // language edit: fresh derivation, and content tracks the change
        draft = state.getDraft();
        draft
            .get("children")
            .get("section")
            .get("languageTag")
            .get("language").value = "de";
        state = draft.metamorphose();
        const third = deriver.deriveRequiredPatternKeys(
            state,
            stylePatchesSource,
        );
        expect(third).not.toBe(first);
        expect(third).toEqual(
            createHyphenationPatternDeriver().deriveRequiredPatternKeys(
                state,
                stylePatchesSource,
            ),
        );
    });

    it("production conditions: draft roots with proxies shortcut across transactions", () => {
        // The coherence is called mid-metamorphose with a DRAFT root
        // whose child reads return potential write proxies. This is
        // the case the memoization is built for (and the case that
        // never hit before proxy-unwrapping).
        const deriver = createHyphenationPatternDeriver(),
            stylePatchesSource = makeDeps().stylePatchesSource;
        let state = buildTree();

        // tick 1: axis-like edit on a draft
        let draft = state.getDraft();
        draft.get("baseFontSize").value = 20;
        const first = deriver.deriveRequiredPatternKeys(
            draft,
            stylePatchesSource,
        );
        state = draft.metamorphose();

        // tick 2: another axis-like edit on a fresh draft
        draft = state.getDraft();
        draft.get("baseFontSize").value = 21;
        const second = deriver.deriveRequiredPatternKeys(
            draft,
            stylePatchesSource,
        );
        expect(second).toBe(first);

        // tick 3: language edit on a draft — fresh derivation
        draft = state.getDraft();
        draft.get("languageTag").get("language").value = "de";
        const third = deriver.deriveRequiredPatternKeys(
            draft,
            stylePatchesSource,
        );
        expect(third).not.toBe(first);
        state = draft.metamorphose();
        expect(third).toEqual(
            createHyphenationPatternDeriver().deriveRequiredPatternKeys(
                state,
                stylePatchesSource,
            ),
        );
    });
});

// --- walkStylePatchLanguages (moved unchanged; semantics pinned) ---

function stubLanguageTag({ language = null, script = null, region = null }) {
    const fields = { language, script, region };
    return {
        get: (key) => ({
            isEmpty: fields[key] === null,
            value: fields[key],
        }),
    };
}

function stubPatch(typeKey, languageTag) {
    return {
        get: (key) => {
            if (key === "stylePatchTypeKey") return { value: typeKey };
            if (key === "instance")
                return languageTag === undefined
                    ? { hasWrapped: false }
                    : {
                          hasWrapped: true,
                          wrapped: {
                              get: (field) =>
                                  field === "languageTag" ? languageTag : null,
                          },
                      };
            throw new Error(`unexpected get(${key})`);
        },
    };
}

function stubPatchSource(patches) {
    return patches.map((patch, index) => [`patch-${index}`, patch]);
}

describe("walkStylePatchLanguages", () => {
    const typeSpecLanguageParts = [
        { language: "en", script: null, region: null },
        { language: "de", script: null, region: "DE" },
    ];

    it("a full patch tag is context-independent", () => {
        const source = stubPatchSource([
                stubPatch(
                    "SimpleStylePatch",
                    stubLanguageTag({ language: "fr", script: "Latn" }),
                ),
            ]),
            tags = [...walkStylePatchLanguages(source, typeSpecLanguageParts)];
        expect(tags).toEqual([
            partsToLanguageTag({
                language: "fr",
                script: "Latn",
                region: null,
            }),
        ]);
    });

    it("a partial patch tag combines with every effective typeSpec tag", () => {
        const source = stubPatchSource([
                stubPatch(
                    "SimpleStylePatch",
                    stubLanguageTag({ region: "CH" }),
                ),
            ]),
            tags = [...walkStylePatchLanguages(source, typeSpecLanguageParts)];
        expect(tags).toEqual([
            createLanguageTag("en", null, "CH"),
            createLanguageTag("de", null, "CH"),
        ]);
    });

    it("skips non-simple patches, empty instances and empty tags", () => {
        const source = stubPatchSource([
                stubPatch(
                    "CompositeStylePatch",
                    stubLanguageTag({ language: "fr" }),
                ),
                stubPatch("SimpleStylePatch", undefined),
                stubPatch("SimpleStylePatch", stubLanguageTag({})),
            ]),
            tags = [...walkStylePatchLanguages(source, typeSpecLanguageParts)];
        expect(tags).toEqual([]);
    });
});
