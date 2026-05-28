/**
 * Model definitions for the videoproof contextual template system.
 *
 * The selector model uses the AxesMath-style pattern for self-referential
 * dynamic types:
 *   - CharsSelectorModel uses InternalizedDependency (not StaticDependency)
 *     to break the circular dependency (CombinatorCharsSelectorModel contains
 *     a list of CharsSelectorModel).
 *   - The host model provides availableCharsSelectorTypes as a StaticDependency.
 *
 * See also: axes-math.mjs for the reference pattern.
 */

import {
    _AbstractStructModel,
    _AbstractListModel,
    _AbstractEnumModel,
    _AbstractDynamicStructModel,
    ForeignKey,
    ValueLink,
    InternalizedDependency,
    StringModel,
    NumberModel,
    CoherenceFunction,
    createAvailableTypes,
    createDynamicType,
    StaticDependency,
    unwrapPotentialWriteProxy,
    deserializeSync,
    SERIALIZE_OPTIONS,
    SERIALIZE_FORMAT_OBJECT,
} from "../../../metamodel.mjs";

import {
    typographyKeyMomentModelMixin,
    typographyActorMixin,
} from "./../models.mjs";

import { AvailableTypesModel } from "../../dynamic-types-pattern.mjs";

import { _BaseActorModel, genericActorMixin } from "../actors-base.mjs";

import { ColorModel } from "../../color.mjs";

import { CharGroupModel } from "../videoproof-array.mjs";

// Coherence: ensure charGroups has 1-2 items
function ensureAtLeastOneCharGroup({ charGroups }) {
    if (charGroups.size < 1) {
        const CharGroup = charGroups.constructor.Model,
            draft = CharGroup.createPrimalDraft(charGroups.dependencies),
            defaultOption = CharGroup.fields.get("options").Model.defaultValue;
        draft.get("options").set(defaultOption);
        charGroups.push(draft);
    }
}

// This is just a List of CharGroupModel but it's purpose is
// to generate arguments for the Template and as such we are
// going to change the type. Now also to make specific UI-Lables
// for the items ('\1', '\2')
export const CharGroupArgumentsListModel = _AbstractListModel.createClass(
        "CharGroupArgumentsListModel",
        CharGroupModel,
    ),
    // --- CharsSelector Model (AxesMath-style self-referential dynamic type) ---
    // Number model for argIndex: 0 or 1
    CharsSelectorArgIndexModel = NumberModel.createClass(
        "CharsSelectorArgIndexModel",
        {
            defaultValue: 0,
            min: 0,
            max: 1,
            toFixedDigits: 0,
        },
    ),
    // Enum for combinator operations
    CharsSelectorCombineModeModel = _AbstractEnumModel.createClass(
        "CharsSelectorCombineModeModel",
        ["AND", "OR"],
        "AND",
    ),
    // The dynamic wrapper model — uses InternalizedDependency for self-reference.
    // The host model must provide 'availableCharsSelectorTypes' as a StaticDependency.
    CharsSelectorModel = _AbstractStructModel.createClass(
        "CharsSelectorModel",
        [
            "availableCharsSelectorTypes",
            new InternalizedDependency(
                "availableCharsSelectorTypes",
                AvailableTypesModel,
            ),
        ],

        [
            "selectorTypeKey",
            new ForeignKey(
                "availableCharsSelectorTypes",
                // I'm not sure why we should allow NULL, so far, the
                // semantic of a null selector is: it selects nothing.
                ForeignKey.ALLOW_NULL,
                ForeignKey.SET_NULL,
            ),
        ],
        ["selectorTypeModel", new ValueLink("selectorTypeKey")],
        [
            "instance",
            _AbstractDynamicStructModel.createClass(
                "DynamicCharsSelectorModel",
                "availableCharsSelectorTypes",
                "selectorTypeModel",
                ["availableCharsSelectorTypes"],
            ),
        ],
    ),
    // List of CharsSelectorModel — used by CombinatorCharsSelectorModel
    CharsSelectorItemsModel = _AbstractListModel.createClass(
        "CharsSelectorItemsModel",
        CharsSelectorModel,
    ),
    // The leaf selector: matches chars from the specified char groups
    SimpleCharsSelectorModel = _AbstractStructModel.createClass(
        "SimpleCharsSelectorModel",
        ["argIndex", CharsSelectorArgIndexModel],
        ["charGroup", CharGroupModel],
    ),
    // The combinators: AND/OR over a list of child selectors
    CombinatorAndCharsSelectorModel = _AbstractStructModel.createClass(
        "CombinatorAndCharsSelectorModel",
        ["children", CharsSelectorItemsModel],
    ),
    CombinatorOrCharsSelectorModel = _AbstractStructModel.createClass(
        "CombinatorOrCharsSelectorModel",
        ["children", CharsSelectorItemsModel],
    ),
    // Available selector types — created after all types are defined
    [availableCharsSelectorTypes, SELECTOR_TYPE_TO_SELECTOR_TYPE_KEY] =
        createAvailableTypes(AvailableTypesModel, [
            ["Simple", "Simple", SimpleCharsSelectorModel],
            ["CombinatorOr", "Some", CombinatorOrCharsSelectorModel],
            ["CombinatorAnd", "All", CombinatorAndCharsSelectorModel],
        ]);

/**
 * Create a CharsSelectorModel instance with a given type.
 */
export function createCharsSelector(typeKey, dependencies) {
    return createDynamicType(
        CharsSelectorModel,
        "selectorTypeKey",
        typeKey,
        dependencies,
    );
}

// --- Template Rule Model ---

/**
 * A single template rule: a selector + a pattern.
 *
 * When the selector matches, the pattern is used to format the character(s).
 * If no selector is present (null), this rule always matches (useful as
 * a catch-all, though normally the defaultPattern handles that).
 */
export const TemplateRuleModel = _AbstractStructModel.createClass(
        "TemplateRuleModel",
        ...StaticDependency.createWithInternalizedDependency(
            "availableCharsSelectorTypes",
            AvailableTypesModel,
            availableCharsSelectorTypes,
        ),
        ["selector", CharsSelectorModel],
        ["pattern", StringModel],
    ),
    TemplateRulesModel = _AbstractListModel.createClass(
        "TemplateRulesModel",
        TemplateRuleModel,
    ),
    /**
     * The full template model: an ordered list of rules + a default pattern.
     *
     * Evaluation: for each character (or char pair), walk rules in order.
     * First rule whose selector matches → use that rule's pattern.
     * If none match → use defaultPattern.
     */
    TemplateModel = _AbstractStructModel.createClass(
        "TemplateModel",
        ["rules", TemplateRulesModel],
        ["defaultPattern", StringModel],
    );

// --- Actor Model ---

//   - auto-short: Latin lowercase → 'nn\1nn', figures → '00\100', default 'HH\1HH', \1 = current, \2 = none
//   - auto-long:  Latin lowercase → 'nn\1nono\1oo', figures → '00\10101\111', default 'HH\1HOHO\1OO', \1 = current, \2 = none
//   - kern-upper: default 'HO\1\2\1OLA', \1=Latin.Uppercase, \2=same
//   - kern-mixed: default '\1\2nnoy', \1=Latin.Uppercase \2=Latin.Lowercase,
//   - kern-lower: default 'no\1\2\1ony', \1r=Latin.Lowercase, \2=same
const CUSTOM_PRESET_KEY = "custom",
    PRESETS_OPTIONS = new Map([
        [
            "auto-short",
            {
                // Legacy behavior is leave as it is (using "selectedChars") ...
                // And it seems like that is working niceley, the
                // charGroups, as not set by the coherence function,
                // are not marked to be skipped by serialization and are
                // serialized, while the template is skipped and reconstructed
                // from the serialzied data in the presets
                // charGroups: [{ options: "all-gid" }],
                template: {
                    rules: [
                        {
                            selector: {
                                instance: {
                                    argIndex: "0",
                                    charGroup: {
                                        options: "World.Figures",
                                        extended: "1",
                                    },
                                },
                                selectorTypeKey: "Simple",
                            },
                            pattern: "00\\100",
                        },
                        {
                            selector: {
                                instance: {
                                    argIndex: "0",
                                    charGroup: {
                                        options: "Latin.Lowercase",
                                        extended: "1",
                                    },
                                },
                                selectorTypeKey: "Simple",
                            },
                            pattern: "nn\\1nn",
                        },
                    ],
                    defaultPattern: "HH\\1HH",
                },
            },
        ],
        [
            "auto-long",
            {
                template: {
                    rules: [
                        {
                            selector: {
                                instance: {
                                    argIndex: "0",
                                    charGroup: {
                                        options: "World.Figures",
                                        extended: "1",
                                    },
                                },
                                selectorTypeKey: "Simple",
                            },
                            pattern: "00\\10101\\111",
                        },
                        {
                            selector: {
                                instance: {
                                    argIndex: "0",
                                    charGroup: {
                                        options: "Latin.Lowercase",
                                        extended: "1",
                                    },
                                },
                                selectorTypeKey: "Simple",
                            },
                            pattern: "nn\\1nono\\1oo",
                        },
                    ],
                    defaultPattern: "HH\\1HOHO\\1OO",
                },
            },
        ],
        [
            "kern-upper",
            {
                charGroups: [{ options: "Latin.Uppercase" }],
                template: { defaultPattern: "HO\\1\\2\\1OLA" },
            },
        ],
        [
            "kern-mixed",
            {
                charGroups: [
                    { options: "Latin.Uppercase" },
                    { options: "Latin.Lowercase" },
                ],
                template: { defaultPattern: "\\1\\2nnoy" },
            },
        ],
        [
            "kern-lower",
            {
                charGroups: [{ options: "Latin.Lowercase" }],
                template: { defaultPattern: "no\\1\\2\\1ony" },
            },
        ],
        [CUSTOM_PRESET_KEY, null],
    ]),
    _presets_options_keys = Array.from(PRESETS_OPTIONS.keys()),
    ContextualPresetModel = _AbstractEnumModel.createClass(
        "ContextualPresetModel",
        _presets_options_keys,
        _presets_options_keys.at(0),
    ),
    GENERATED_DATA = Symbol.for("GENERATED_DATA");

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
function applyPresets(
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

export const VideoproofContextualKeyMomentModel =
        _AbstractStructModel.createClass(
            "VideoproofContextualKeyMomentModel",
            ...typographyKeyMomentModelMixin,
            // TODO: when we are going for dynamically loaded, user-defined
            // presets this may have to change. It could still be driven
            // by that enum, e.g. adding a "user" option, but the value
            // for the user defined option would be a string database key
            // or so.
            ["presets", ContextualPresetModel],
            ["charGroups", CharGroupArgumentsListModel],
            ["template", TemplateModel],
            ["stageBackgroundColor", ColorModel],
            CoherenceFunction.create(
                ["presets", "charGroups", "template"],
                applyPresets.bind(
                    null,
                    "presets",
                    PRESETS_OPTIONS,
                    CUSTOM_PRESET_KEY,
                ),
            ),
            // These run after the presets to ensure **coherence**.
            CoherenceFunction.create(["charGroups"], ensureAtLeastOneCharGroup),
            CoherenceFunction.create(
                ["charGroups"],
                function capCharGroupsAtTwo({ charGroups }) {
                    if (charGroups.size > 2) charGroups.splice(2, Infinity);
                },
            ),
        ),
    VideoproofContextualKeyMomentsModel = _AbstractListModel.createClass(
        "VideoproofContextualKeyMomentsModel",
        VideoproofContextualKeyMomentModel,
    ),
    VideoproofContextualActorModel = _BaseActorModel.createClass(
        "VideoproofContextualActorModel",
        ...genericActorMixin,
        ["keyMoments", VideoproofContextualKeyMomentsModel],
        ...typographyActorMixin,
    );
