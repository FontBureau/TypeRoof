// @vitest-environment jsdom
// Editor/viewer parity regression for the per-node typeSpec styler
// provisioning of entry-less block types (figure): the editor's node
// channel must resolve the node's OWN spec on the FULL path of types
// like the viewer does (root-spec fallback through the registry walk),
// not on the nearest resolvable ANCESTOR. figure has no
// nodeSpecToTypeSpec entry; pre-dropping it inside a nested section
// resolved /sub-section — a noStyler spec — so the editor provisioned
// NO styler for figures in sub-sections while the viewer styled them
// (the "gap after" via the root spec's blockMargins.end). The mark
// channel keeps the containing (pre-dropped) anchor — parity with the
// viewer's UIDocumentTextRun provisioning.
import { describe, it, expect } from "vitest";

import { StateComparison } from "../../metamodel.mjs";
import { buildWorld } from "./harness.mjs";

// Parsoid-shaped: a lead figure (a document child), one inside a
// top-level <section> (→ section) and one inside a nested
// <section><section> (→ sub-section, the noStyler case).
const HTML = `<html><body>
<p>Lead paragraph.</p>
<figure typeof="mw:File/Thumb" id="figLead">
  <a href="./File:x.png"><img src="x.png"></a>
  <figcaption>Lead figure.</figcaption>
</figure>
<section><h2 id="Top">Top</h2>
  <p>Text.</p>
  <figure typeof="mw:File/Thumb" id="figTop">
    <a href="./File:y.png"><img src="y.png"></a>
    <figcaption>Top figure.</figcaption>
  </figure>
  <section><h3 id="Nested">Nested</h3>
    <p>Text.</p>
    <figure typeof="mw:File/Thumb" id="figNested">
      <a href="./File:z.png"><img src="z.png"></a>
      <figcaption>Nested figure.</figcaption>
    </figure>
  </section>
</section>
</body></html>`;

describe("type-stage figure styling parity (editor/viewer)", () => {
    it(
        "provisions stylers for figures in sub-sections in BOTH renderer modes",
        { timeout: 300_000 },
        async () => {
            const world = await buildWorld({ htmlOverride: HTML });
            let oldState = world.getState();
            const applyChange = (fn) => {
                const draft = oldState.getDraft();
                fn(draft.get("activeState"));
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
                oldState = newState;
            };
            const figuresOf = () =>
                Array.from(
                    world.zones
                        .get("layout")
                        .querySelectorAll('figure[data-node-type="figure"]'),
                );
            const assertAllFiguresStyled = (mode) => {
                const figures = figuresOf();
                expect(figures.length).toBe(3);
                expect(figures.map((f) => f.id)).toEqual([
                    "figLead",
                    "figTop",
                    "figNested",
                ]);
                for (const figure of figures) {
                    expect(
                        figure.hasAttribute("data-has-styler"),
                        `${mode}: ${figure.id} has no styler`,
                    ).toBe(true);
                    // the root-spec fallback carries the block end
                    // margin — the "gap after" the viewer always had
                    expect(
                        figure.style.getPropertyValue("--margin-block-end"),
                        `${mode}: ${figure.id} has no --margin-block-end`,
                    ).not.toBe("");
                }
            };
            // the wikipedia app starts in "viewer" mode
            assertAllFiguresStyled("viewer");
            // the user switches to the editor
            applyChange((activeState) => {
                activeState.get("documentRendererMode").value = "editor";
            });
            assertAllFiguresStyled("editor");
        },
    );
});
