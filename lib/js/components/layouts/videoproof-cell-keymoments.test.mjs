import { describe, it, expect, vi } from "vitest";
import {
    deserializeGen,
    SERIALIZE_OPTIONS,
    driveResolveGenAsync,
    ForeignKey,
    getEntry,
    getDraftEntry,
    serialize,
    GENERATED_DATA,
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

async function createPrimalState(dependencies = null) {
    return driveResolveGenAsync(
        asyncResolve,
        VideoproofModel.createPrimalStateGen(
            dependencies || (await makeDependencies()),
        ),
    );
}

async function loadFromSerialized(serialized, dependencies = null) {
    return driveResolveGenAsync(
        asyncResolve,
        deserializeGen(
            VideoproofModel,
            dependencies || (await makeDependencies()),
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
        // only the property-setting keyMoments[0] is serialized
        expect(parentInstance.keyMoments.length).toBe(1);
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
        // the legacy serialized animation keyMoments are regenerated
        // from axesMath on load (migration), keyMoments[0] keeps its
        // user edit
        expect(
            getEntry(
                loadedState,
                "activeActors/0/instance/activeActors/0/instance/keyMoments",
            ).size,
        ).toBe(27);
        expect(
            getEntry(
                loadedState,
                "activeActors/0/instance/activeActors/0/instance/keyMoments/0/charGroup/options",
            ).value,
        ).toBe("Latin.ASCII");
        expect(getEntry(loadedState, CELL_KEYMOMENTS_PATH).size).toBe(1);
    }, 30000);
});

describe("VideoproofModel keyMoments ownership (per-entry)", () => {
    // Entry 0 of a keyMoments list is the property-setting keyMoment
    // (user data, serialized), entries 1+ are animation-driving
    // keyMoments (generated from axesMath, not serialized).
    const PARENT_KEYMOMENTS_PATH =
        "activeActors/0/instance/activeActors/0/instance/keyMoments";

    async function createStateWithCharGroup(dependencies) {
        const primalState = await createPrimalState(dependencies),
            draft = primalState.getDraft();
        getDraftEntry(
            draft,
            PARENT_KEYMOMENTS_PATH + "/0/charGroup/options",
        ).set("Latin.ASCII");
        return draft.metamorphose(dependencies);
    }

    it("serializes only keyMoments[0] and regenerates the animation keyMoments on load", async () => {
        const dependencies = await makeDependencies(),
            editedState = await createStateWithCharGroup(dependencies),
            [errors, serialized] = serialize(editedState, SERIALIZE_OPTIONS);
        expect(errors).toEqual([]);
        const keyMoments = JSON.parse(serialized).activeActors[0].instance
            .activeActors[0].instance.keyMoments;
        // only the property-setting keyMoment, carrying the user edit
        expect(keyMoments.length).toBe(1);
        expect(keyMoments[0].charGroup.options).toBe("Latin.ASCII");

        const loadedState = await loadFromSerialized(
                JSON.parse(serialized),
                dependencies,
            ),
            loadedKeyMoments = getEntry(loadedState, PARENT_KEYMOMENTS_PATH);
        // animation keyMoments re-created from axesMath
        expect(loadedKeyMoments.size).toBe(27);
        // user edit preserved
        expect(
            getEntry(
                loadedState,
                PARENT_KEYMOMENTS_PATH + "/0/charGroup/options",
            ).value,
        ).toBe("Latin.ASCII");
        // entry 0 is user data, entries 1+ are generated
        expect(Object.hasOwn(loadedKeyMoments.get("0"), GENERATED_DATA)).toBe(
            false,
        );
        expect(Object.hasOwn(loadedKeyMoments.get("1"), GENERATED_DATA)).toBe(
            true,
        );
    }, 30000);

    it("preserves the user edit when the animation keyMoments are regenerated", async () => {
        const dependencies = await makeDependencies(),
            editedState = await createStateWithCharGroup(dependencies),
            // editing a cell makes the V2 actor's activeActors a draft,
            // which re-runs applyAxesMathLocations (regeneration)
            draft = editedState.getDraft();
        getDraftEntry(
            draft,
            "activeActors/0/instance/activeActors/0/instance/activeActors/0/instance/label",
        ).value = "trigger regeneration";
        const regeneratedState = draft.metamorphose(dependencies);
        // sanity: regeneration ran, entries 1+ are marked generated
        expect(
            Object.hasOwn(
                getEntry(regeneratedState, PARENT_KEYMOMENTS_PATH + "/1"),
                GENERATED_DATA,
            ),
        ).toBe(true);

        const [, serialized] = serialize(regeneratedState, SERIALIZE_OPTIONS),
            keyMoments = JSON.parse(serialized).activeActors[0].instance
                .activeActors[0].instance.keyMoments;
        // regeneration does not leak into the serialization ...
        expect(keyMoments.length).toBe(1);
        // ... and does not lose the user edit
        expect(keyMoments[0].charGroup.options).toBe("Latin.ASCII");

        const loadedState = await loadFromSerialized(
            JSON.parse(serialized),
            dependencies,
        );
        expect(
            getEntry(
                loadedState,
                PARENT_KEYMOMENTS_PATH + "/0/charGroup/options",
            ).value,
        ).toBe("Latin.ASCII");
    }, 30000);

    it("serializes unmarked keyMoments completely, preserving positions (motion-stage behavior)", async () => {
        const state = await createPrimalState(),
            keyMoments = getEntry(state, PARENT_KEYMOMENTS_PATH),
            ListModel = keyMoments.constructor,
            draft = ListModel.createPrimalDraft(keyMoments.dependencies),
            EntryModel = ListModel.Model,
            entry0 = EntryModel.createPrimalDraft(draft.dependencies),
            entry1 = EntryModel.createPrimalDraft(draft.dependencies);
        entry1.getDraftFor("label").value = "user edited";
        draft.push(entry0, entry1);
        const list = draft.metamorphose({}),
            [errors, serialized] = serialize(list, SERIALIZE_OPTIONS);
        expect(errors).toEqual([]);
        const parsed = JSON.parse(serialized);
        // no entry is marked: everything serializes, positions preserved
        expect(parsed.length).toBe(2);
        expect(parsed[0]).toEqual({
            label: "",
            duration: "1",
            easing: "linear",
        });
        expect(parsed[1].label).toBe("user edited");
    }, 30000);

    it("cell keyMoments are user data: edits serialize and round-trip", async () => {
        // NOTE: label and axesLocations are generated even on the
        // property-setting keyMoments[0], so a user-owned field is
        // edited here (generation never touches showCellBoxes).
        const dependencies = await makeDependencies(),
            primalState = await createPrimalState(dependencies),
            draft = primalState.getDraft();
        getDraftEntry(
            draft,
            CELL_KEYMOMENTS_PATH + "/0/showCellBoxes",
        ).value = true;
        const editedState = draft.metamorphose(dependencies),
            [errors, serialized] = serialize(editedState, SERIALIZE_OPTIONS);
        expect(errors).toEqual([]);
        const cellKeyMoments = JSON.parse(serialized).activeActors[0].instance
            .activeActors[0].instance.activeActors[0].instance.keyMoments;
        // cell keyMoments serialize as user data
        expect(cellKeyMoments.length).toBe(1);
        expect(cellKeyMoments[0].showCellBoxes).toBe("1");

        const loadedState = await loadFromSerialized(
            JSON.parse(serialized),
            dependencies,
        );
        expect(
            getEntry(loadedState, CELL_KEYMOMENTS_PATH + "/0/showCellBoxes")
                .value,
        ).toBe(true);
    }, 30000);

    it("migrates legacy states: serialized animation keyMoments are regenerated, keyMoments[0] user settings preserved", async () => {
        const dependencies = await makeDependencies(),
            primalState = await createPrimalState(dependencies),
            [, serialized] = serialize(primalState, SERIALIZE_OPTIONS),
            payload = JSON.parse(serialized),
            parentInstance =
                payload.activeActors[0].instance.activeActors[0].instance,
            // shape a legacy payload: the animation keyMoments serialized
            // unmarked, as if they were user data
            keyMoment = {
                label: "opsz: min, wdth: default, wght: default",
                duration: "1",
                easing: "linear",
                axesLocations: [
                    ["opsz", "8"],
                    ["wdth", "100"],
                    ["wght", "400"],
                ],
            };
        parentInstance.keyMoments = [
            { ...keyMoment, charGroup: { options: "Latin.ASCII" } },
            keyMoment,
            keyMoment,
        ];
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        let loadedState = null,
            warnCallCount = 0;
        try {
            loadedState = await loadFromSerialized(payload, dependencies);
        } finally {
            // mockRestore wipes the recorded calls, so capture the count
            warnCallCount = warn.mock.calls.length;
            warn.mockRestore();
        }
        // the migration warns once
        expect(warnCallCount).toBe(1);
        const keyMoments = getEntry(loadedState, PARENT_KEYMOMENTS_PATH);
        // animation keyMoments regenerated from axesMath
        expect(keyMoments.size).toBe(27);
        // user settings on the property-setting keyMoment preserved
        expect(
            getEntry(
                loadedState,
                PARENT_KEYMOMENTS_PATH + "/0/charGroup/options",
            ).value,
        ).toBe("Latin.ASCII");
        // regenerated entries are marked generated
        expect(Object.hasOwn(keyMoments.get("1"), GENERATED_DATA)).toBe(true);
    }, 30000);
});

