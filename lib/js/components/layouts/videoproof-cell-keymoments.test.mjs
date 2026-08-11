import { describe, it, expect } from "vitest";
import {
    deserializeGen,
    SERIALIZE_OPTIONS,
    driveResolveGenAsync,
    ForeignKey,
    getEntry,
    serialize,
} from "../../metamodel.mjs";
import { Layouts } from "../main-ui.mjs";
import {
    InstalledFontsModel,
    InstalledFontModel,
} from "../main-model.mjs";

const VideoproofModel = Layouts.find(([key]) => key === "Videoproof")[2].Model;
const FONT_KEY = "from-url Roboto Flex Regular Version_3-200 gftools_0-9-32_";
const CELL_KEYMOMENTS_PATH =
    "activeActors/0/instance/activeActors/0/instance/activeActors/0/instance/keyMoments";

// A minimal stand-in for a VideoProofFont, the model layer only
// requires fullName and axisRanges.
const fontStub = (() => {
    const axisRanges = {};
    for (const [tag, min, max, defaultValue] of [
        ["opsz", 8, 144, 14],
        ["wdth", 25, 151, 100],
        ["wght", 100, 1000, 400],
        ["GRAD", -200, 150, 0],
        ["XOPQ", 27, 175, 88],
        ["XTRA", 323, 603, 468],
        ["YOPQ", 25, 135, 79],
        ["YTAS", 649, 854, 750],
        ["YTDE", -305, -98, -240],
        ["YTFI", 560, 788, 738],
        ["YTLC", 416, 570, 500],
        ["YTUC", 528, 760, 712],
        ["slnt", -10, 0, 0],
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

async function makeDependencies() {
    const installedFontsDraft = InstalledFontsModel.createPrimalDraft({});
    installedFontsDraft.set(FONT_KEY, makeFontState());
    const installedFonts = installedFontsDraft.metamorphose({});
    return { font: installedFonts.get(FONT_KEY), installedFonts };
}

async function createPrimalState() {
    return driveResolveGenAsync(
        asyncResolve,
        VideoproofModel.createPrimalStateGen(await makeDependencies()),
    );
}

async function loadFromSerialized(serialized) {
    return driveResolveGenAsync(
        asyncResolve,
        deserializeGen(
            VideoproofModel,
            await makeDependencies(),
            JSON.stringify(serialized),
            { ...SERIALIZE_OPTIONS, earlyExitOnError: true },
        ),
    );
}

describe("VideoproofModel cell actor keyMoments", () => {
    it("are re-created after a serialization round-trip", async () => {
        const primalState = await createPrimalState();
        // The cell actor UI relies on this invariant.
        expect(getEntry(primalState, CELL_KEYMOMENTS_PATH).size).toBe(1);

        const [serializeErrors, serialized] = serialize(
            primalState,
            SERIALIZE_OPTIONS,
        );
        expect(serializeErrors).toEqual([]);

        // The keyMoments of cell actors are marked GENERATED_DATA and
        // hence not serialized, they must be re-created on load.
        const loadedState = await loadFromSerialized(serialized);
        expect(getEntry(loadedState, CELL_KEYMOMENTS_PATH).size).toBe(1);
    }, 30000);

    it("are re-created on load when the parent keyMoments are serialized", async () => {
        // When the user edits a keyMoment of the VideoproofArrayV2 actor
        // (e.g. sets a charGroup) the keyMoments lose their GENERATED_DATA
        // marker and get serialized. When such a state is loaded,
        // updateRap does not re-create the generated keyMoments of the
        // cell actors (the parent keyMoments.size > 1), so the invariant
        // must be restored by the initCellKeyMoments coherence function.
        const primalState = await createPrimalState();
        const [, serialized] = serialize(primalState, SERIALIZE_OPTIONS);
        const payload = JSON.parse(serialized);
        const parentInstance =
            payload.activeActors[0].instance.activeActors[0].instance;
        expect(parentInstance.keyMoments).toBeUndefined();
        const keyMoment = {
                label: "opsz: min, wdth: default, wght: default",
                duration: "1",
                easing: "linear",
                axesLocations: [
                    ["opsz", "8"],
                    ["wdth", "100"],
                    ["wght", "400"],
                ],
            },
            // Like a user edit, e.g. setting charGroup on keyMoments[0],
            // causes the keyMoments to be serialized.
            editedKeyMoment = {
                ...keyMoment,
                charGroup: { options: "Latin.ASCII" },
            };
        parentInstance.keyMoments = [editedKeyMoment, keyMoment];

        const loadedState = await loadFromSerialized(payload);
        expect(
            getEntry(
                loadedState,
                "activeActors/0/instance/activeActors/0/instance/keyMoments",
            ).size,
        ).toBe(2);
        expect(getEntry(loadedState, CELL_KEYMOMENTS_PATH).size).toBe(1);
    }, 30000);
});
