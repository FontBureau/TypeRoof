// @vitest-environment jsdom
// Regression test for the stale-width bug on full state replacement
// (File > Load State): when the TypeStage layout PERSISTS across the
// replacement of the whole activeState, the new document's per-node
// node-properties scopes must not resolve percent-layout-derived
// widths from the OLD document's scopes. Browser repro (shell.html,
// environment@layout 1585px): the loaded Wikipedia article's
// paragraphs kept the old default document's column width (277.99pt)
// instead of resolving fresh (1188.75pt); editor and viewer alike,
// no recovery on resize — only a layout switch (controller rebuild)
// resolved correctly.
//
// FIXTURE: the replacement state is FROZEN
// (lib/js/tests/fixtures/type-stage-wikipedia-replacement-state.json,
// generated 2026-10-11 from the then-current wikipedia initial state
// with a small document). The bundled wikipedia state evolves —
// 2ec5f248 added section/sub-section typeSpecs with a horizontal
// layout, breaking the previous hardcoded stage-width assumption
// (1188.75pt). The control world boots the same fixture; whatever
// width IT resolves is the expectation — no hardcoded values.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import {
    StateComparison,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    deserializeSync,
} from "../../metamodel.mjs";
import {
    buildWorld,
    TYPE_STAGE_DEFAULT_STATE,
} from "../type-stage-toggles/harness.mjs";
import REPLACEMENT_STATE from "../fixtures/type-stage-wikipedia-replacement-state.json";

const HAVE_FIXTURE = existsSync(
        "lib/js/tests/fixtures/type-stage-wikipedia-replacement-state.json",
    ),
    OPTS = Object.assign({}, SERIALIZE_OPTIONS, {
        format: SERIALIZE_FORMAT_OBJECT,
    });

// The fixture's small document: a <section> wrapping an h2 and two
// paragraphs. The <section> matters: the old default document also
// has a "section" at content/0, so the meta node is REUSED across
// the replacement (the leak's vehicle). Without it the node rebuilds
// and there is nothing to leak into.
const ENVIRONMENT = { width: 1585, height: 1080 },
    queryParagraph = (layoutZone) =>
        layoutZone.querySelector(
            'article.typeroof-document [data-node-type="paragraph"]',
        );

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
                    environment: ENVIRONMENT,
                }),
                layoutZone = world.zones.get("layout");

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

            // The control: the same replacement state, booted fresh —
            // its resolved paragraph width is the expectation (a fresh
            // boot is correct by definition).
            const control = await buildWorld({
                    defaultState: REPLACEMENT_STATE,
                    useDefaultDocument: true,
                    environment: ENVIRONMENT,
                }),
                expectedWidth = queryParagraph(control.zones.get("layout"))
                    .style.width;
            expect(expectedWidth).toBeTruthy();

            // Baseline: the old document's paragraph width (the value
            // that must NOT leak). Read via the editor pane (the
            // viewer is inactive); the first data-node-type element
            // would be the full-width container, so match paragraphs.
            const oldWidth = layoutZone.querySelector(
                '.ui_prosemirror_host [data-node-type="paragraph"]',
            ).style.width;
            expect(oldWidth).toBeTruthy();
            expect(oldWidth).not.toBe(expectedWidth);

            // Replace the WHOLE activeState, like File > Load State
            // does (updateState): same layout controller persists.
            const oldState = world.getState(),
                activeStateModel = oldState.get("activeState"),
                newActiveState = deserializeSync(
                    activeStateModel.constructor,
                    activeStateModel.dependencies,
                    REPLACEMENT_STATE,
                    OPTS,
                ),
                draft = oldState.getDraft();
            draft.set("activeState", newActiveState);
            draft.get("activeState").get("documentRendererMode").value =
                "viewer";
            const newState = draft.metamorphose();
            world.setState(newState);
            world.root.update(new StateComparison(oldState, newState));

            // The replacement document's paragraphs resolve exactly as
            // the fresh boot — not the old document's stale width.
            const newParagraph = queryParagraph(layoutZone);
            expect(newParagraph).not.toBeNull();
            expect(newParagraph.textContent).toContain(
                "First replacement paragraph",
            );
            expect(newParagraph.style.width).toBe(expectedWidth);
        },
    );
});
