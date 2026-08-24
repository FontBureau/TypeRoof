// @vitest-environment jsdom
// Regression probe for the showParameters / showNodeTypeSpecLabels
// toggles after the update-propagation optimizations: boots the real
// TypeStageController (viewer default, as in the wikipedia app), switches
// to the editor, then flips the toggles and asserts the
// labels/parameters become visible (per manual report: they do not).
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import { StateComparison } from "../../metamodel.mjs";
import { buildWorld } from "./harness.mjs";

// The path is relative to the current working directory, vitest is
// expected to run from the project root.
const HAVE_FIXTURE = existsSync("lib/js/tests/fixtures/typography-small.html");

describe.skipIf(!HAVE_FIXTURE)("type-stage toggles", () => {
    it(
        "toggling showNodeTypeSpecLabels/showParameters updates the editor",
        { timeout: 300_000 },
        async () => {
            const world = await buildWorld();
            let oldState = world.getState();
            const applyChange = (fn) => {
                const draft = oldState.getDraft();
                fn(draft.get("activeState"));
                const newState = draft.metamorphose();
                // The shell sets the current state before dispatching
                // the update; provisioning (activation tests) reads
                // current state during the update.
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
                oldState = newState;
            };
            // The wikipedia app starts in "viewer" mode; the user
            // switches to the editor.
            applyChange((activeState) => {
                activeState.get("documentRendererMode").value = "editor";
            });
            const editorElement = world.zones
                .get("layout")
                .querySelector(".ProseMirror");
            expect(editorElement).not.toBeNull();
            const host = editorElement.closest(".ui_prosemirror_host");
            expect(host).not.toBeNull();

            applyChange((activeState) => {
                activeState.get("showNodeTypeSpecLabels").value = true;
            });
            expect(host.classList.contains("has-node-labels")).toBe(true);
            // The CSS class only controls visibility; the label
            // elements themselves are provisioned on demand
            // (activationTest on showNodeTypeSpecLabels).
            expect(
                host.querySelectorAll(".ui_type_spec_label").length,
            ).toBeGreaterThan(0);

            applyChange((activeState) => {
                activeState.get("showParameters").value = true;
            });
            expect(host.querySelector(".ui_type_spec_ramp")).not.toBeNull();

            // The reported workaround: switching to viewer and back to
            // editor (deactivate/reactivate the context widget) makes
            // the labels/parameters appear. NOTE: the old host element
            // is destroyed by the switch, must re-query.
            applyChange((activeState) => {
                activeState.get("documentRendererMode").value = "viewer";
            });
            applyChange((activeState) => {
                activeState.get("documentRendererMode").value = "editor";
            });
            const host2 = world.zones
                .get("layout")
                .querySelector(".ProseMirror")
                .closest(".ui_prosemirror_host");
            expect(
                host2.querySelectorAll(".ui_type_spec_label").length,
            ).toBeGreaterThan(0);
            expect(host2.querySelector(".ui_type_spec_ramp")).not.toBeNull();
        },
    );
});
