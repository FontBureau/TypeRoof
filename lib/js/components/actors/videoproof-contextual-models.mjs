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
} from "../../metamodel.mjs";

import {
    typographyKeyMomentModelMixin,
    typographyActorMixin,
} from "./models.mjs";

import { AvailableTypesModel } from "../dynamic-types-pattern.mjs";

import { _BaseActorModel, genericActorMixin } from "./actors-base.mjs";

import { ColorModel } from "../color.mjs";

import { CharGroupModel } from "./videoproof-array.mjs";

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
// for the items ($1, $2)
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
            ["Simple", "Simple Selector", SimpleCharsSelectorModel],
            [
                "CombinatorOr",
                "Match Some Selector",
                CombinatorOrCharsSelectorModel,
            ],
            [
                "CombinatorAnd",
                "Match All Selector",
                CombinatorAndCharsSelectorModel,
            ],
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

export const VideoproofContextualKeyMomentModel =
        _AbstractStructModel.createClass(
            "VideoproofContextualKeyMomentModel",
            ...typographyKeyMomentModelMixin,
            ["charGroups", CharGroupArgumentsListModel],
            ["template", TemplateModel],
            ["stageBackgroundColor", ColorModel],
            CoherenceFunction.create(["charGroups"], ensureAtLeastOneCharGroup),
            CoherenceFunction.create(
                ["charGroups"],
                function capCharGroupsAtTwo({ charGroups }) {
                    charGroups.splice(2, Infinity);
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
