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
    _AbstractSimpleOrEmptyModel
} from "../../../metamodel.mjs";

import {
    typographyKeyMomentModelMixin,
    typographyActorMixin,
    BooleanOrEmptyModel,
} from "./../models.mjs";

import { AvailableTypesModel } from "../../dynamic-types-pattern.mjs";

import { _BaseActorModel, genericActorMixin } from "../actors-base.mjs";

import { ColorModel } from "../../color.mjs";

import {
    CharGroupModel,
    CellAlignmentOrEmptyModel,
} from "../videoproof-array.mjs";

import { applyPresets, CUSTOM_PRESET_KEY } from "../../presets.mjs";

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
//   - kern-lower: default 'no\1\2\1ony', \1=Latin.Lowercase, \2=same
const PRESETS_OPTIONS = new Map([
        [
            "auto-short",
            {
                // Legacy behavior is leave as it is (using "selectedChars") ...
                // And it seems like that is working nicely, the
                // charGroups, as not set by the coherence function,
                // are not marked to be skipped by serialization and are
                // serialized, while the template is skipped and reconstructed
                // from the serialized data in the presets
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
    _presets_options_keys = Array.from(PRESETS_OPTIONS.keys());
export const ContextualPresetModel = _AbstractEnumModel.createClass(
        "ContextualPresetModel",
        _presets_options_keys,
        _presets_options_keys.at(0),
    ),
    ContextualPresetOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(ContextualPresetModel),
    VideoproofContextualKeyMomentModel = _AbstractStructModel.createClass(
        "VideoproofContextualKeyMomentModel",
        ...typographyKeyMomentModelMixin,
        // TODO: when we are going for dynamically loaded, user-defined
        // presets this may have to change. It could still be driven
        // by that enum, e.g. adding a "user" option, but the value
        // for the user defined option would be a string database key
        // or so.
        ["presets", ContextualPresetOrEmptyModel],
        ["charGroups", CharGroupArgumentsListModel],
        ["template", TemplateModel],
        ["showCellBoxes", BooleanOrEmptyModel],
        ["cellAlignment", CellAlignmentOrEmptyModel],
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
