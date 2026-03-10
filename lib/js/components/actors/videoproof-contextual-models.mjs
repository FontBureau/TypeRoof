/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

/**
 * Model definitions for the videoproof contextual template system.
 *
 * The selector model uses the AxesMath-style pattern for self-referential
 * dynamic types:
 *   - SelectorModel uses InternalizedDependency (not StaticDependency)
 *     to break the circular dependency (CombinatorSelectorModel contains
 *     a list of SelectorModel).
 *   - The host model provides availableSelectorTypes as a StaticDependency.
 *
 * See also: axes-math.mjs for the reference pattern.
 */

import {
    _AbstractStructModel
  , _AbstractListModel
  , _AbstractEnumModel
  , _AbstractDynamicStructModel
  , _AbstractGenericModel
  , ForeignKey
  , ValueLink
  , InternalizedDependency
  , StringModel
  , BooleanModel
  , NumberModel
  , CoherenceFunction
  , createAvailableTypes
  , createDynamicType
} from '../../metamodel.mjs';

import {
    typographyKeyMomentModelMixin
  , typographyActorMixin
} from './models.mjs';

import {
    _BaseActorModel
  , genericActorMixin
} from './actors-base.mjs';

import {
    ColorModel
} from '../color.mjs';


// --- Selector Model (AxesMath-style self-referential dynamic type) ---

// Number model for argIndex: 0 or 1
const SelectorArgIndexModel = NumberModel.createClass('SelectorArgIndexModel', {defaultValue: 0})
    // Enum for combinator operations
  , SelectorCombineModeModel = _AbstractEnumModel.createClass('SelectorCombineModeModel', ['AND', 'OR'], 'AND')
    // Keys list: e.g. ['Latin.Lowercase', 'Latin.Uppercase']
  , SelectorKeyModel = StringModel.createClass('SelectorKeyModel')
  , SelectorKeysModel = _AbstractListModel.createClass('SelectorKeysModel', SelectorKeyModel)
    // Whether to include extended chars in the selector set
  , SelectorExtendedModel = BooleanModel.createClass('SelectorExtendedModel', {defaultValue: true})
  ;

/**
 * Abstract base class for selector types (leaf and combinator).
 */
export class _BaseSelectorModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}

// Generic type model for the selector type system
const SelectorTypeModel = _AbstractGenericModel.createClass('SelectorTypeModel')
  , AvailableSelectorTypeModel = _AbstractStructModel.createClass(
        'AvailableSelectorTypeModel'
      , ['label', StringModel]
      , ['typeClass', SelectorTypeModel]
    )
  , AvailableSelectorTypesModel = _AbstractListModel.createClass('AvailableSelectorTypesModel', AvailableSelectorTypeModel)
    // The dynamic wrapper model — uses InternalizedDependency for self-reference.
    // The host model must provide 'availableSelectorTypes' as a StaticDependency.
  , SelectorModel = _AbstractStructModel.createClass(
        'SelectorModel'
      , ['availableSelectorTypes', new InternalizedDependency('availableSelectorTypes', AvailableSelectorTypesModel)]
      , ['selectorTypeKey', new ForeignKey('availableSelectorTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['selectorTypeModel', new ValueLink('selectorTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicSelectorModel'
                            , _BaseSelectorModel
                            , 'selectorTypeModel'
                            , ['availableSelectorTypes'])]
    )
    // List of SelectorModel — used by CombinatorSelectorModel
  , SelectorItemsModel = _AbstractListModel.createClass('SelectorItemsModel', SelectorModel)
    // The leaf selector: matches chars from specified char group keys
  , LeafSelectorModel = _BaseSelectorModel.createClass(
        'LeafSelectorModel'
      , ['argIndex', SelectorArgIndexModel]
      , ['keys', SelectorKeysModel]
      , ['extended', SelectorExtendedModel]
    )
    // The combinator: AND/OR over a list of child selectors
  , CombinatorSelectorModel = _BaseSelectorModel.createClass(
        'CombinatorSelectorModel'
      , ['combineMode', SelectorCombineModeModel]
      , ['children', SelectorItemsModel]
    )
    // Available selector types — created after all types are defined
  , [availableSelectorTypes, SELECTOR_TYPE_TO_SELECTOR_TYPE_KEY] =
        createAvailableTypes(AvailableSelectorTypesModel, [
                ['Leaf', 'Match Chars', LeafSelectorModel]
              , ['Combinator', 'Combine', CombinatorSelectorModel]
        ])
  ;

export {
    SelectorModel
  , LeafSelectorModel
  , CombinatorSelectorModel
  , availableSelectorTypes
  , SELECTOR_TYPE_TO_SELECTOR_TYPE_KEY
};

/**
 * Create a SelectorModel instance with a given type.
 */
export function createSelector(typeKey, dependencies) {
    return createDynamicType(SelectorModel, 'selectorTypeKey', typeKey, dependencies);
}

// --- Template Rule Model ---

const TemplatePatternModel = StringModel.createClass('TemplatePatternModel');

/**
 * A single template rule: a selector + a pattern.
 *
 * When the selector matches, the pattern is used to format the character(s).
 * If no selector is present (null), this rule always matches (useful as
 * a catch-all, though normally the defaultPattern handles that).
 */
export const TemplateRuleModel = _AbstractStructModel.createClass(
    'TemplateRuleModel'
  , ['selector', SelectorModel]
  , ['pattern', TemplatePatternModel]
)
  , TemplateRulesModel = _AbstractListModel.createClass('TemplateRulesModel', TemplateRuleModel)
  ;

/**
 * The full template model: an ordered list of rules + a default pattern.
 *
 * Evaluation: for each character (or char pair), walk rules in order.
 * First rule whose selector matches → use that rule's pattern.
 * If none match → use defaultPattern.
 */
export const TemplateModel = _AbstractStructModel.createClass(
    'TemplateModel'
  , ['rules', TemplateRulesModel]
  , ['defaultPattern', TemplatePatternModel]
);

// --- CharGroups List Model (1-2 items) ---

// Import CharGroupModel from videoproof-array where it's defined
// We re-export it for convenience.
import {
    CharGroupModel
  , charGroupsData
} from './videoproof-array.mjs';

export { CharGroupModel, charGroupsData };

const CharGroupsListModel = _AbstractListModel.createClass('CharGroupsListModel', CharGroupModel);

// --- Actor Model ---

export const VideoproofContextualKeyMomentModel = _AbstractStructModel.createClass(
    'VideoproofContextualKeyMomentModel'
  , ...typographyKeyMomentModelMixin
  , ['charGroups', CharGroupsListModel]
  , ['template', TemplateModel]
  , ['stageBackgroundColor', ColorModel]
    // Coherence: ensure charGroups has 1-2 items
  , CoherenceFunction.create(
        ['charGroups']
      , function ensureCharGroupsCount({charGroups}) {
            if(charGroups.size === 0)
                charGroups.push();  // push default
            while(charGroups.size > 2)
                charGroups.delete(charGroups.size - 1);
        }
    )
)
  , VideoproofContextualKeyMomentsModel = _AbstractListModel.createClass(
        'VideoproofContextualKeyMomentsModel'
      , VideoproofContextualKeyMomentModel
    )
  , VideoproofContextualActorModel = _BaseActorModel.createClass(
        'VideoproofContextualActorModel'
      , ...genericActorMixin
      , ['keyMoments', VideoproofContextualKeyMomentsModel]
      , ...typographyActorMixin
    )
  ;

export { CharGroupsListModel };
