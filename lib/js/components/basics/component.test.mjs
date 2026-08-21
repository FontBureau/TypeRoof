// Equivalence test for _keepDeepestPaths (the update-relevance
// changedRoots filter) against the naive pairwise reference it
// replaces — including the false-prefix trap ("a/b" must not count as
// an ancestor of "ab/c") and a property-based run on generated
// document-shaped path lists.
import { describe, it, expect } from "vitest";

import { _keepDeepestPaths } from "./component.mjs";

// The naive (quadratic) formulation of the intended semantics — "keep
// the paths that have no proper descendant in the set" — kept here as
// the reference. NOTE: this is not character-for-character the code
// that was replaced: the original tested `q.startsWith(`${p}/`)`,
// which (quirk) never dropped the root "/" ("" is no path's start)
// even when it had descendants. Dropping the root then is correct and
// covered: root-level deps match via context.changedPrefixes (the
// ancestors of the kept deep roots), deep deps via the kept deep
// roots — see _modelDepIntersectsChangedRoots in component.mjs.
function keepDeepestPathsReference(paths) {
    return new Set(
        paths.filter(
            (p) =>
                !paths.some(
                    (q) =>
                        q !== p &&
                        q.length > p.length &&
                        q.startsWith(`${p === "/" ? "" : p}/`),
                ),
        ),
    );
}

const CASES = [
    [],
    ["/"],
    ["/a"],
    // classic ancestor chains
    ["/", "/a", "/a/b", "/a/b/c", "/b"],
    // the separator-removal trap: "a/b" must not count as an ancestor
    // of "ab/c" (removed separators made "ab" a prefix of "abc")
    ["/a/b", "/ab/c"],
    // sibling-prefix trap with numbers: "1" must not shadow "10"
    ["/1/a", "/10/b"],
    ["/1", "/10", "/2", "/20"],
    // combined adversarial set (numeric siblings, string siblings,
    // root): => ["/10", "/1/x", "a/b/c", "ab"] with "/1", "/a/b", "/"
    // dropped as ancestors
    ["/", "/1", "/10", "/1/x", "a", "a/b", "ab", "a/b/c"],
    // duplicates collapse like the reference (Set + last occurrence)
    ["/a/b", "/a/b", "/a"],
    ["/x", "/x", "/y"],
    // document-shaped: ancestors of every change are present
    // (rawCompare yields CHANGED down to the root)
    [
        "/",
        "/activeState",
        "/activeState/document",
        "/activeState/document/content",
        "/activeState/document/content/0",
        "/activeState/document/content/0/attrs",
        "/activeState/document/content/1",
        "/activeState/document/content/1/content",
        "/activeState/document/content/1/content/0",
        "/activeState/document/content/1/content/0/text",
    ],
];

describe("_keepDeepestPaths", () => {
    for(const [index, paths] of CASES.entries())
        it(`matches the reference on case #${index}`, () => {
            expect(_keepDeepestPaths(paths)).toEqual(
                keepDeepestPathsReference(paths),
            );
        });

    it("keeps exactly the expected leaves of the adversarial set", () => {
        expect(
            _keepDeepestPaths([
                "/",
                "/1",
                "/10",
                "/1/x",
                "a",
                "a/b",
                "ab",
                "a/b/c",
            ]),
        ).toEqual(new Set(["/10", "/1/x", "ab", "a/b/c"]));
    });

    it("matches the reference on generated path lists (property)", () => {
        // Deterministic PRNG (LCG), so failures reproduce.
        let seed = 42;
        const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
        for(let run = 0; run < 50; run++) {
            const segment = () => `${random() % 15}`,
                count = random() % 200,
                paths = [];
            for(let i = 0; i < count; i++) {
                const depth = 1 + (random() % 5),
                    parts = [];
                for(let d = 0; d < depth; d++) parts.push(segment());
                paths.push(`/${parts.join("/")}`);
            }
            // Add some prefixes of already generated paths, like
            // rawCompare's ancestor entries would.
            for(let i = 0; i < count / 4 && paths.length; i++) {
                const victim = paths[random() % paths.length],
                    cut = victim.indexOf("/", 1);
                if(cut > 0) paths.push(victim.slice(0, cut));
            }
            expect(_keepDeepestPaths(paths)).toEqual(
                keepDeepestPathsReference(paths),
            );
        }
    });
});
