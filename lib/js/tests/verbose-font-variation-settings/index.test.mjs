// @vitest-environment jsdom
// The application wide `verboseFontVariationSettings` preference (see
// ApplicationModel) makes the samples list all axes of the font in
// `font-variation-settings`, including the axes that are at their
// default location — the equivalent of the legacy tools
// "applyDefaultsExplicitly" flag. This boots the real
// TypeStageController and flips the preference at the root of the state.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

import { StateComparison } from "../../metamodel.mjs";
import { buildWorld } from "../type-stage-toggles/harness.mjs";

// The path is relative to the current working directory, vitest is
// expected to run from the project root.
const HAVE_FIXTURE = existsSync("lib/js/tests/fixtures/typography-small.html");

// A subset of e.g. Roboto Flex: "wght" is set explicitly by the type
// specs, the others are only ever applied when verbose.
const FONT_AXIS_RANGES = {
    wght: { name: "Weight", min: 100, max: 1000, default: 400 },
    wdth: { name: "Width", min: 25, max: 151, default: 100 },
    GRAD: { name: "Grade", min: -200, max: 150, default: 0 },
};

const parseAxes = (fontVariationSettings) =>
    new Set(
        fontVariationSettings
            .split(",")
            .map((item) => item.trim().split(" ")[0].replaceAll('"', ""))
            .filter((tag) => tag !== ""),
    );

describe.skipIf(!HAVE_FIXTURE)("verboseFontVariationSettings", () => {
    it(
        "lists the fonts default axis locations explicitly when enabled",
        { timeout: 300_000 },
        async () => {
            const world = await buildWorld({
                fontAxisRanges: FONT_AXIS_RANGES,
            });
            let oldState = world.getState();
            const setVerbose = (value) => {
                const draft = oldState.getDraft();
                draft
                    .get("activeState")
                    .get("verboseFontVariationSettings").value = value;
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
                oldState = newState;
            };

            const getSampleAxes = () => {
                const samples = [
                    ...world.zones
                        .get("layout")
                        .querySelectorAll('[style*="font-variation-settings"]'),
                ];
                expect(samples.length).toBeGreaterThan(0);
                return samples.map((element) =>
                    parseAxes(element.style.fontVariationSettings),
                );
            };

            // Only the axes the type specs set explicitly.
            for (const axes of getSampleAxes()) {
                expect(axes.has("wdth")).toBe(false);
                expect(axes.has("GRAD")).toBe(false);
            }

            setVerbose(true);
            const verboseAxes = getSampleAxes();
            for (const axes of verboseAxes) {
                expect(axes.has("wght")).toBe(true);
                expect(axes.has("wdth")).toBe(true);
                expect(axes.has("GRAD")).toBe(true);
            }

            // Turning it off again restores the terse settings.
            setVerbose(false);
            for (const axes of getSampleAxes()) {
                expect(axes.has("wdth")).toBe(false);
                expect(axes.has("GRAD")).toBe(false);
            }
        },
    );

    it(
        "is reflected by the parameters display",
        { timeout: 300_000 },
        async () => {
            const world = await buildWorld({
                fontAxisRanges: FONT_AXIS_RANGES,
            });
            let oldState = world.getState();
            const applyChange = (fn) => {
                const draft = oldState.getDraft();
                fn(draft.get("activeState"));
                const newState = draft.metamorphose();
                world.setState(newState);
                world.root.update(new StateComparison(oldState, newState));
                oldState = newState;
            };

            // The parameters displays only exist in the editor, and only
            // when showParameters is on.
            applyChange((activeState) => {
                activeState.get("documentRendererMode").value = "editor";
                activeState.get("showParameters").value = true;
            });

            const getDisplayedAxes = () => {
                const displays = [
                    ...world.zones
                        .get("layout")
                        .querySelectorAll(".ui-parameters-display_values"),
                ];
                expect(displays.length).toBeGreaterThan(0);
                return displays.map((element) =>
                    parseAxes(element.textContent.replaceAll(":", "")),
                );
            };

            for (const axes of getDisplayedAxes()) {
                expect(axes.has("wdth")).toBe(false);
                expect(axes.has("GRAD")).toBe(false);
            }

            applyChange((activeState) => {
                activeState.get("verboseFontVariationSettings").value = true;
            });
            for (const axes of getDisplayedAxes()) {
                expect(axes.has("wght")).toBe(true);
                expect(axes.has("wdth")).toBe(true);
                expect(axes.has("GRAD")).toBe(true);
            }

            applyChange((activeState) => {
                activeState.get("verboseFontVariationSettings").value = false;
            });
            for (const axes of getDisplayedAxes()) {
                expect(axes.has("wdth")).toBe(false);
                expect(axes.has("GRAD")).toBe(false);
            }
        },
    );
});
