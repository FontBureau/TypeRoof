import {
    _AbstractListModel,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
    unwrapPotentialWriteProxy,
} from "../metamodel.mjs";

const GENERATED_DATA = Symbol.for("GENERATED_DATA");

export const CUSTOM_PRESET_KEY = "custom";

function copyToDraft(item) {
    const draftItem = item.constructor.createPrimalDraft(item.dependencies);
    for (const [key, entry] of item) {
        if (item instanceof _AbstractListModel) draftItem.push(entry);
        else draftItem.set(key, entry);
    }
    return draftItem;
}

/**
 * By injecting PRESETS_OPTIONS and CUSTOM_PRESET_KEY I hope this can
 * be used as a pattern for other preset implementations as well!
 */
export function applyPresets(
    presetsFieldName,
    PRESETS_OPTIONS,
    CUSTOM_PRESET_KEY,
    valuesMap,
    { isNew /*, wasSerialized*/, setFn },
) {
    const {
        [presetsFieldName]: presets,
        ...settables // {charGroups, template}}
    } = valuesMap;

    // - If any item of settables is customized the presets.value
    //   should become CUSTOM_PRESET_KEY ("custom") as well.
    // - When the type has changed to a not "custom" key, the
    //  settables must be changed as well.
    //
    // The idea is that the GENERATED_DATA symbol will
    // disappear when edited outside of this function
    // and hence we would set the type to "custom"

    const presetsChanged = !!unwrapPotentialWriteProxy(presets, "draft");

    if (presets.isEmpty) return;

    let apply = "";
    if (presets.value !== CUSTOM_PRESET_KEY && (isNew || presetsChanged)) {
        // isNew: wouldn't have the data applied
        // presetsChanged: whatever the data is now, it will be replaced
        apply = "preset";
    } else if (presets.value === CUSTOM_PRESET_KEY && presetsChanged) {
        apply = CUSTOM_PRESET_KEY;
    } else {
        const presetData = PRESETS_OPTIONS.get(presets.value);
        for (const [key, entry] of Object.entries(settables)) {
            // depending on the presence in the presets we skip the entry here!
            // i.e. if charGroups is settable, but the current preset doesn't
            // set it, it can't trigger apply(CUSTOM_PRESET_KEY).
            if (presetData && !(key in presetData)) continue;
            const unwrapped = unwrapPotentialWriteProxy(entry);
            if (!Object.hasOwn(unwrapped, GENERATED_DATA)) {
                // entry has been customized/not generated/created in here.
                apply = CUSTOM_PRESET_KEY;
                presets.value = CUSTOM_PRESET_KEY;
                break;
            }
        }
    }
    // apply a state if required...
    if (apply === "preset") {
        const serializeOptions = Object.assign({}, SERIALIZE_OPTIONS, {
                format: SERIALIZE_FORMAT_OBJECT,
            }),
            presetData = PRESETS_OPTIONS.get(presets.value);
        for (const [key, entry] of Object.entries(settables)) {
            if (!(key in presetData)) continue;
            const Ctor = unwrapPotentialWriteProxy(entry).constructor,
                serializedData = presetData[key],
                newEntry = deserializeSync(
                    Ctor,
                    entry.dependencies,
                    serializedData,
                    serializeOptions,
                );
            // the new Entry is immutable and we need it to
            // be a draft with actual changes so the GENERATED_DATA
            // flag sticks to it...
            const entryDraft = copyToDraft(newEntry);
            // Actually the mere presence of this GENERATED_DATA
            // symbol is enough, the value may be helping when debugging.
            entryDraft[GENERATED_DATA] = presets.value;
            setFn(key, entryDraft);
        }
    } else if (apply === CUSTOM_PRESET_KEY) {
        // The data will have to be serialized.
        // Make sure the drafts are going to be new items
        // and not reverted back, so that the GENERATED_DATA
        // symbol cannot stick! Create a copy:
        for (const [key, entry] of Object.entries(settables)) {
            const newEntry = copyToDraft(entry); // => new item
            // this should have deleted any trace of GENERATED_DATA
            setFn(key, newEntry);
        }
    }
}
