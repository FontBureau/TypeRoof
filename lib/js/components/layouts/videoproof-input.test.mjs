import { describe, it, expect } from "vitest";
import {
    deserializeGen,
    SERIALIZE_OPTIONS,
    driveResolveGenAsync,
    ForeignKey,
    getEntry,
    getDraftEntry,
    serialize,
} from "../../metamodel.mjs";
import { Layouts } from "../main-ui.mjs";
import { InstalledFontsModel, InstalledFontModel } from "../main-model.mjs";
import { DEFAULT_TEXT } from "../actors/videoproof-input.typeroof.jsx";

const VideoproofModel = Layouts.find(([key]) => key === "Videoproof")[2].Model;
const FONT_KEY = "from-url Roboto Flex Regular Version_3-200 gftools_0-9-32_";
const ACTOR_PATH = "activeActors/0/instance/activeActors/0";
const TEXT_RUN_PATH = `${ACTOR_PATH}/instance/keyMoments/0/textRun`;

// A minimal stand-in for a VideoProofFont, the model layer only
// requires fullName and axisRanges.
const fontStub = (() => {
    const axisRanges = {};
    for (const [tag, min, max, defaultValue] of [
        ["opsz", 8, 144, 14],
        ["wdth", 25, 151, 100],
        ["wght", 100, 1000, 400],
    ])
        axisRanges[tag] = Object.freeze({
            name: tag,
            min,
            max,
            default: defaultValue,
        });
    return { fullName: FONT_KEY, axisRanges };
})();

function makeFontState() {
    const fontState = InstalledFontModel.createPrimalDraft({});
    fontState.value = fontStub;
    return fontState;
}

async function asyncResolve(resourceRequirement) {
    const [indicator, targetContainer, requiredKey] =
        resourceRequirement.description;
    if (indicator instanceof ForeignKey) {
        const key =
            requiredKey !== undefined && requiredKey !== ForeignKey.NULL
                ? requiredKey
                : FONT_KEY;
        if (!targetContainer.has(key))
            targetContainer.set(key, makeFontState());
        return key;
    }
    throw new Error(`unexpected resource requirement ${resourceRequirement}`);
}

function makeDependencies() {
    const installedFontsDraft = InstalledFontsModel.createPrimalDraft({});
    installedFontsDraft.set(FONT_KEY, makeFontState());
    const installedFonts = installedFontsDraft.metamorphose({});
    return { font: installedFonts.get(FONT_KEY), installedFonts };
}

async function change(state, dependencies, fn) {
    const draft = state.getDraft();
    fn(draft);
    return driveResolveGenAsync(
        asyncResolve,
        draft.metamorphoseGen(dependencies),
    );
}

async function createInputState(dependencies) {
    const primalState = await driveResolveGenAsync(
        asyncResolve,
        VideoproofModel.createPrimalStateGen(dependencies),
    );
    // Just what the actor select does.
    return change(primalState, dependencies, (draft) => {
        getDraftEntry(draft, `${ACTOR_PATH}/actorTypeKey`).value =
            "VideoproofInputActorModel";
    });
}

describe("VideoproofModel with the VideoproofInputActorModel", () => {
    it("is an available videoproof actor", async () => {
        const state = await createInputState(makeDependencies());
        expect(getEntry(state, `${ACTOR_PATH}/actorTypeKey`).value).toBe(
            "VideoproofInputActorModel",
        );
        expect(
            getEntry(state, `${ACTOR_PATH}/instance`).wrapped.constructor.name,
        ).toBe("VideoproofInputActorModel");
    }, 30000);

    it("sets the initial text and generates the animation", async () => {
        const state = await createInputState(makeDependencies());
        expect(getEntry(state, TEXT_RUN_PATH).value).toBe(DEFAULT_TEXT);
        // keyMoments[0] plus the generated axesMath keyMoments
        expect(
            getEntry(state, `${ACTOR_PATH}/instance/keyMoments`).size,
        ).toBeGreaterThan(1);
    }, 30000);

    it("keeps an emptied text empty", async () => {
        const dependencies = makeDependencies(),
            state = await change(
                await createInputState(dependencies),
                dependencies,
                (draft) => {
                    getDraftEntry(draft, TEXT_RUN_PATH).value = "";
                },
            );
        expect(getEntry(state, TEXT_RUN_PATH).value).toBe("");
    }, 30000);

    it("serializes only keyMoments[0] and restores the text on load", async () => {
        const dependencies = makeDependencies(),
            state = await change(
                await createInputState(dependencies),
                dependencies,
                (draft) => {
                    getDraftEntry(draft, TEXT_RUN_PATH).value =
                        "Hamburgefonstiv";
                },
            ),
            [errors, serialized] = serialize(state, SERIALIZE_OPTIONS);
        expect(errors).toEqual([]);
        const keyMoments =
            JSON.parse(serialized).activeActors[0].instance.activeActors[0]
                .instance.keyMoments;
        expect(keyMoments.length).toBe(1);
        expect(keyMoments[0].textRun).toBe("Hamburgefonstiv");

        const loadedState = await driveResolveGenAsync(
            asyncResolve,
            deserializeGen(VideoproofModel, dependencies, serialized, {
                ...SERIALIZE_OPTIONS,
                earlyExitOnError: true,
            }),
        );
        expect(getEntry(loadedState, `${ACTOR_PATH}/actorTypeKey`).value).toBe(
            "VideoproofInputActorModel",
        );
        expect(getEntry(loadedState, TEXT_RUN_PATH).value).toBe(
            "Hamburgefonstiv",
        );
        expect(
            getEntry(loadedState, `${ACTOR_PATH}/instance/keyMoments`).size,
        ).toBe(getEntry(state, `${ACTOR_PATH}/instance/keyMoments`).size);
    }, 30000);
});
