// @vitest-environment jsdom
// Regression test for the stale-DOM bug reported against the wikipedia
// app: load article "Topography" (figure with a topographic map), then
// load "Typography" — the figure's <a>/<img> kept the *old* href/src
// while the figcaption updated. Cause: on document replacement the
// viewer reuses same-typeKey widgets at the same list positions
// (UIDocumentNode rebuilds only on typeKey change), but UIDocumentElement
// built the attr-driven DOM (htmlAttrs bag, verbatim html of reproducing
// atoms) only in its constructor and never re-applied it on update.
// Fixed via UIDocumentElement._applyAttrDrivenDOMUpdates.
import { describe, it, expect } from "vitest";

import { StateComparison } from "../../metamodel.mjs";
import { ingestWikipediaDocument } from "../../wikipedia/ingest";
import { buildWorld } from "../type-stage-toggles/harness.mjs";

// Two minimal "articles" with the *same* node structure (same typeKeys
// at the same list positions), so the viewer reuses the widgets of
// article A when article B replaces the document — the bug scenario.
// They differ only in the figure's attrs (href/title/src) and texts.
const article = ({ href, title, src, caption, text }) => `<html>
<head><title>fixture</title></head>
<body>
<h2 id="Article">Article</h2>
<figure typeof="mw:File/Thumb"><a href="${href}" class="mw-file-description"${
    title ? ` title="${title}"` : ""
}><img src="${src}" width="10" height="10"></a><figcaption>${caption}</figcaption></figure>
<p>${text}</p>
</body>
</html>`;

const ARTICLE_A = article({
        href: "./File:A.png",
        title: "link A",
        src: "//upload/A.png",
        caption: "Caption A",
        text: "First article text.",
    }),
    ARTICLE_B = article({
        href: "./File:B.png",
        // no title in B: the stale attribute must be removed
        title: null,
        src: "//upload/B.png",
        caption: "Caption B",
        text: "Second article text.",
    });

function ingest(world, html) {
    const parsed = new DOMParser().parseFromString(html, "text/html"),
        { document: docModel } = ingestWikipediaDocument(
            parsed,
            world.getState().get("activeState").get("proseMirrorSchema"),
        );
    return docModel;
}

describe("type-stage document replace", () => {
    it(
        "re-applies attr-driven DOM when the document is replaced",
        { timeout: 300_000 },
        async () => {
            const world = await buildWorld();
            let oldState = world.getState();
            const replaceDocument = (docModel) => {
                const draft = oldState.getDraft();
                draft.get("activeState").set("document", docModel);
                const newState = draft.metamorphose();
                // The shell sets the current state before dispatching
                // the update; provisioning (activation tests) reads
                // current state during the update.
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
                oldState = newState;
            };

            const getFigureLink = () =>
                world.zones
                    .get("layout")
                    .querySelector(
                        '.typeroof-document figure [data-node-type="figcontent"]',
                    );

            replaceDocument(ingest(world, ARTICLE_A));
            const linkA = getFigureLink();
            expect(linkA).not.toBeNull();
            expect(linkA.getAttribute("href")).toBe("./File:A.png");
            expect(linkA.querySelector("img").getAttribute("src")).toBe(
                "//upload/A.png",
            );

            replaceDocument(ingest(world, ARTICLE_B));
            const linkB = getFigureLink();
            // The widget (and hence the element) is reused — this is
            // the reuse path that produced the stale image.
            expect(linkB).toBe(linkA);
            // ... but the attr-driven DOM must follow the new document:
            // the htmlAttrs bag ...
            expect(linkB.getAttribute("href")).toBe("./File:B.png");
            expect(linkB.hasAttribute("title")).toBe(false);
            // ... and the verbatim html of the reproducing atom.
            expect(linkB.querySelector("img").getAttribute("src")).toBe(
                "//upload/B.png",
            );
            // Sanity: regular content updates kept working.
            const figure = linkB.closest("figure");
            expect(
                figure.querySelector('[data-node-type="figcaption"]')
                    .textContent,
            ).toBe("Caption B");
        },
    );
});
