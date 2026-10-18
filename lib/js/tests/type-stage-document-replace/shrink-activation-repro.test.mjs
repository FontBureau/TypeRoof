// @vitest-environment jsdom
// Regression: loading a viewer-mode state while the old state has a
// larger document and the viewer is inactive must not attach the new
// viewer to the STALE meta tree before the meta update prunes old
// children. Reproduces downloads/typeroof-20261004-220217.TypeStage.json
// load: stale /content/0/content/1 vs new collection size 1.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import { StateComparison } from "../../metamodel.mjs";
import { ingestWikipediaDocument } from "../../wikipedia/ingest";
import { buildWorld } from "../type-stage-toggles/harness.mjs";

const HAVE_FIXTURE = existsSync("lib/js/tests/fixtures/typography-small.html"),
    SHRINK_ARTICLE = `<html>
<head><title>shrink</title></head>
<body><p>Only one paragraph left standing.</p></body>
</html>`;

function ingest(world, html) {
    const parsed = new DOMParser().parseFromString(html, "text/html"),
        { document: docModel } = ingestWikipediaDocument(
            parsed,
            world.getState().get("activeState").get("proseMirrorSchema"),
        );
    return docModel;
}

describe.skipIf(!HAVE_FIXTURE)(
    "shape-shrinking replace + viewer activation",
    () => {
        it(
            "updates the meta tree before the newly active viewer attaches",
            { timeout: 300_000 },
            async () => {
                const world = await buildWorld();
                // Put the old, larger document in editor-only mode: the
                // viewer is inactive but the always-active meta tree
                // mirrors all old children.
                let oldState = world.getState(),
                    draft = oldState.getDraft();
                draft.get("activeState").get("documentRendererMode").value =
                    "editor";
                let newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
                expect(
                    world.zones
                        .get("layout")
                        .querySelector("article.typeroof-document"),
                ).toBeNull();

                // Same cycle: shrink old section's 9 children to 1 AND
                // activate the viewer. Before the fix, the viewer
                // constructor immediately attached to the stale meta
                // children during parent _provisionWidgets, before the
                // meta's update: key "1" against new collection size 1.
                oldState = newState;
                draft = oldState.getDraft();
                draft
                    .get("activeState")
                    .set("document", ingest(world, SHRINK_ARTICLE));
                draft.get("activeState").get("documentRendererMode").value =
                    "viewer";
                newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));

                const article = world.zones
                    .get("layout")
                    .querySelector("article.typeroof-document");
                expect(article).not.toBeNull();
                expect(article.textContent).toContain(
                    "Only one paragraph left standing.",
                );
                expect(
                    article.querySelectorAll('[data-node-type="paragraph"]'),
                ).toHaveLength(1);
            },
        );
    },
);
