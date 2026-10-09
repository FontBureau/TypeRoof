// @vitest-environment jsdom
// Repro for the stale-width bug on full state replacement (File > Load
// State): when the TypeStage layout PERSISTS across the replacement of
// the whole activeState, the new document's per-node node-properties
// scopes resolve percent-layout-derived widths from the OLD document's
// scopes. Browser repro (shell.html, environment@layout 1585px): the
// loaded Wikipedia article's paragraphs keep the old default document's
// column width (277.99pt) instead of the stage width (1188.75pt);
// editor and viewer alike, no recovery on resize — only a layout
// switch (controller rebuild) resolves correctly.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import {
    StateComparison,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    deserializeSync,
} from "../../metamodel.mjs";
import { ingestWikipediaDocument } from "../../wikipedia/ingest";
import {
    buildWorld,
    WIKIPEDIA_DEFAULT_STATE,
    TYPE_STAGE_DEFAULT_STATE,
} from "../type-stage-toggles/harness.mjs";

const HAVE_FIXTURE = existsSync("lib/js/tests/fixtures/typography-small.html"),
    OPTS = Object.assign({}, SERIALIZE_OPTIONS, {
        format: SERIALIZE_FORMAT_OBJECT,
    });

// environment@layout 1585x1080 => stage width 100 percent-layout
// resolves to 1585 css-px = 1188.75pt (96/72 css-px per pt).
const STAGE_WIDTH_PT = "1188.75pt";

// Small article for the REPLACEMENT state: the full document of
// WIKIPEDIA_DEFAULT_STATE provisions slowly (harness comment), the
// leak is structural, not content-dependent.
// The <section> wrapper matters: the old default document also has a
// "section" at content/0, so the meta node is REUSED across the
// replacement (the leak's vehicle). Without it the node rebuilds and
// there is nothing to leak into.
const SMALL_ARTICLE = `<html>
<head><title>replacement</title></head>
<body>
<section>
<h2 id="Replacement">Replacement</h2>
<p>First replacement paragraph with a <a rel="mw:WikiLink" href="./X">link</a>.</p>
<p>Second replacement paragraph.</p>
</section>
</body>
</html>`;

function ingest(schema, html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return ingestWikipediaDocument(parsed, schema).document;
}

describe.skipIf(!HAVE_FIXTURE)("stale width on full state replace", () => {
    it(
        "re-resolves per-node widths when the whole activeState is replaced",
        { timeout: 300_000 },
        async () => {
            const world = await buildWorld({
                    // The shell's default state: text blocks are
                    // constrained to a narrow column (browser: 277.99pt
                    // at 1585px layout width).
                    defaultState: TYPE_STAGE_DEFAULT_STATE,
                    useDefaultDocument: true,
                    environment: { width: 1585, height: 1080 },
                }),
                layoutZone = world.zones.get("layout"),
                queryParagraph = () =>
                    layoutZone.querySelector(
                        'article.typeroof-document [data-node-type="paragraph"]',
                    );

            // The shell boots in EDITOR mode (DocumentRendererMode
            // default there); the loaded file is in viewer mode. The
            // leak scenario includes this mode change.
            {
                const oldState = world.getState(),
                    draft = oldState.getDraft();
                draft.get("activeState").get("documentRendererMode").value =
                    "editor";
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
            }
            expect(
                layoutZone.querySelector("article.typeroof-document"),
            ).toBeNull();

            // Baseline: the old document's paragraphs are constrained
            // (NOT the stage width); this is the value that must not
            // leak into the replacement document. Read via the editor
            // pane's styled nodes (viewer is inactive).
            const oldStyled = layoutZone.querySelector(
                ".ui_prosemirror_host [data-node-type]",
            );
            expect(oldStyled).not.toBeNull();

            // Replace the WHOLE activeState, like File > Load State
            // does (updateState): new typeSpec (no width constraint),
            // new document, same layout controller.
            const oldState = world.getState(),
                activeStateModel = oldState.get("activeState"),
                newActiveStateDraft = deserializeSync(
                    activeStateModel.constructor,
                    activeStateModel.dependencies,
                    WIKIPEDIA_DEFAULT_STATE,
                    OPTS,
                ).getDraft();
            newActiveStateDraft.set(
                "document",
                ingest(
                    newActiveStateDraft.get("proseMirrorSchema"),
                    SMALL_ARTICLE,
                ),
            );
            const newActiveState = newActiveStateDraft.metamorphose(),
                draft = oldState.getDraft();
            // Viewer mode, like the loaded file.
            draft.set("activeState", newActiveState);
            draft.get("activeState").get("documentRendererMode").value =
                "viewer";
            const newState = draft.metamorphose();
            world.setState(newState);
            world.root.update(new StateComparison(oldState, newState));

            // The replacement document's paragraphs inherit the stage
            // width (the wikipedia typeSpec sets no width): 1188.75pt,
            // not the old document's stale column width.
            const newParagraph = queryParagraph();
            expect(newParagraph).not.toBeNull();
            expect(newParagraph.textContent).toContain(
                "First replacement paragraph",
            );
            expect(newParagraph.style.width).toBe(STAGE_WIDTH_PT);
        },
    );
});
