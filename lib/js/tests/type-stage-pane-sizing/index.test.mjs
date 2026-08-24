// @vitest-environment jsdom
// Behavior test for TypeStagePaneStyler: boots the real
// TypeStageController (as wired in the wikipedia app), publishes
// environment@layout values, and asserts the pane elements
// (editor's .ui_prosemirror_host, viewer's article.typeroof-document)
// receive the resolved css-px sizes from the LengthModel width/height
// fields; changing the spec or the environment re-resolves.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import { StateComparison } from "../../metamodel.mjs";

import { buildWorld } from "../type-stage-toggles/harness.mjs";

const HAVE_FIXTURE = existsSync("lib/js/tests/fixtures/typography-small.html");

describe.skipIf(!HAVE_FIXTURE)("type-stage pane sizing", () => {
    it(
        "editor + viewer panes resolve width/height against environment@layout",
        { timeout: 300_000 },
        async () => {
            const world = await buildWorld();
            const handler = world.environmentHandler,
                publishLayout = (width, height) => {
                    if (handler.hasRegistered("layout"))
                        handler._unregister("layout");
                    handler.register("layout", { width, height });
                    handler.setUpdated("layout");
                };
            publishLayout(800, 600);

            let oldState = world.getState();
            const applyChange = (fn) => {
                const draft = oldState.getDraft();
                fn(draft.get("activeState"));
                const newState = draft.metamorphose();
                world.setState(newState);
                handler.resetUpdatedLog();
                handler.setUpdated("layout");
                world.root.update(new StateComparison(oldState, newState));
                oldState = newState;
            };

            // Default: width=100% layout, height unset -> editor pane
            // gets width 800px, no explicit height.
            applyChange((activeState) => {
                activeState.get("documentRendererMode").value = "editor";
            });
            const layoutZone = world.zones.get("layout"),
                host = layoutZone.querySelector(".ui_prosemirror_host");
            expect(host).not.toBeNull();
            expect(host.style.width).toBe("800px");
            expect(host.style.height).toBe("");

            // Environment change: host width follows.
            publishLayout(400, 300);
            applyChange(() => {});
            expect(host.style.width).toBe("400px");

            // Viewer pane: article gets the same resolution.
            applyChange((activeState) => {
                activeState.get("documentRendererMode").value = "viewer";
            });
            const article = layoutZone.querySelector(
                "article.typeroof-document",
            );
            expect(article).not.toBeNull();
            expect(article.style.width).toBe("400px");

            // Set an explicit height -> visible-height box.
            applyChange((activeState) => {
                activeState.get("height").get("unit").value = "percent-layout";
                activeState.get("height").get("value").value = 50;
            });
            expect(article.style.height).toBe("150px");

            // Document-level styling: the wikipedia initial state sets
            // a white (OKLCH L=100) backgroundColor on the root
            // typeSpec; the viewer pane gets it applied like the
            // editor pane (previously editor-only via
            // ProseMirrorGeneralDocumentStyler).
            expect(article.style.getPropertyValue("background-color")).not.toBe(
                "",
            );
            // language tag likewise.
            expect(article.getAttribute("lang")).toBeTruthy();
        },
    );
});
