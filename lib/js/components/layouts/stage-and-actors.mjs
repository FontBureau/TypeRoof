/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    Path
  , getEntry
  , ForeignKey
  // , unwrapPotentialWriteProxy
  , StateComparison
  , CoherenceFunction
  , BooleanModel
  , StringModel
  , NumberModel
  , ValueLink
  , FallBackValue
  , InternalizedDependency
  , _AbstractStructModel
  , _AbstractOrderedMapModel
  , _AbstractDynamicStructModel
  , _AbstractListModel
  , _AbstractGenericModel
  , _AbstractNumberModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractEnumModel
  , FreezableMap
  , StaticDependency
} from '../../metamodel.mjs';

import {
    zip
  , enumerate
  , interpolateNumber
  , deepFreeze
} from '../../util.mjs';

import {
    _BaseContainerComponent
  , _BaseDynamicCollectionContainerComponent
  , _BaseComponent
  , _CommonContainerComponent
  , UPDATE_STRATEGY
  , UPDATE_STRATEGY_COMPARE // jshint ignore:line
  , UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
  , HANDLE_CHANGED_AS_NEW
  , _DialogBase
} from '../basics.mjs';


import {
    StaticNode
  , DynamicTag
  , UINumberInput
  , PlainNumberAndRangeInput
  , PlainToggleButton
  , PlainNumberAndRangeOrEmptyInput
  , UINumberAndRangeOrEmptyInput
  , UILineOfTextInput
  , UILineOfTextOrEmptyInput
  , GenericSelect
  , UISelectInput
  , UISelectOrEmptyInput
  , PlainSelectInput
} from '../generic.mjs';

import {
    _BaseLayoutModel
  , InstalledFontsModel
  , InstalledFontModel
} from '../main-model.mjs';

import {
    FontSelect
} from '../font-loading.mjs';

import {
    timeControlModelMixin
  , AnimationTGenerator
  , UITimeControlCircle
  , UIActorTimeControlKeyMomentSelectCircle
  , getBasicPlayerControlWidgets
  , LocalScopeAnimanion
  , AnimationLiveProperties
  , AnimationInfo
  , keyMomentBaseModelMixin
  , binarySearch
  , AnimationPropertiesProtocolHandler
}  from '../animation-fundamentals.mjs';

import {
    createLabelForKeyMoment
} from './example-key-moments.mjs';

import {
    manualAxesLocationsModelMixin
  , UIManualAxesLocations
  , AxesLocationsModel
} from '../ui-manual-axis-locations.mjs';

import {
    formatCss as culoriFormatCss
  , getMode as culoriGetMode
  , parse as culoriParse
  , converter as culoriConverter
  , interpolate as culoriInterpolate
  , fixupHueShorter
  , fixupHueLonger
  , fixupHueDecreasing
  , fixupHueIncreasing
} from '../../vendor/culori/bundled/culori.mjs';

export class _BaseColorModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}

// Colors and Actors start of here very similar, this was initially based
// on the Actor model system below.
const ColorTypeModel = _AbstractGenericModel.createClass('ColorTypeModel')// => .value will be a concrete _BaseColorModel
    // make this selectable...
  , AvailableColorTypeModel = _AbstractStructModel.createClass(
        'AvailableColorTypeModel'
      , ['label', StringModel]
      , ['typeClass', ColorTypeModel]
    )
  , AvailableColorTypesModel = _AbstractOrderedMapModel.createClass('AvailableColorTypesModel', AvailableColorTypeModel)
  , ColorModel = _AbstractStructModel.createClass(
        'ColorModel'
      , ['availableColorTypes', new InternalizedDependency('availableColorTypes', AvailableColorTypesModel)]
        // TODO: having ALLOW_NULL here is interesting, and I'm not convinced
        // all the consequences are known by me now. It's about not creating
        // whatever Color this falls back to. But eventually null means
        // _AbstractDynamicStructModel: instance will have a null value.
        // and maybe we should handle this like an _AbstractSimpleOrEmptyModel
        // which raises if trying to read from an empty model and hence forces
        // awareness and always to use
      , ['colorTypeKey', new ForeignKey('availableColorTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['colorTypeModel', new ValueLink('colorTypeKey')]
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicColorModel'
                            , _BaseColorModel
                            ,'colorTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableColorTypes'])]
    )
      // new thing! can also have a toFixed-digits as fourth parameter
      // with min and max: this can be a range of discrete numbers.
    , PercentNumberModel = _AbstractNumberModel.createClass('PercentNumberModel', {min:0, max:100, defaultValue: 0, toFixedDigits: 5})
    , PercentNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PercentNumberModel)
      // This has a default of 100 instead of 0
    , AlphaPercentNumberModel = _AbstractNumberModel.createClass('AlphaPercentNumberModel', {min:0, max:100, defaultValue: 100, toFixedDigits: 5})
    , AlphaPercentNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(AlphaPercentNumberModel)
    , PercentWithNegativeNumberModel = _AbstractNumberModel.createClass('PercentWithNegativeNumberModel', {min:-100, max:100, defaultValue: 0, toFixedDigits: 5})
    , PercentWithNegativeNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(PercentWithNegativeNumberModel)
      // This will be used to define an angle in number of "turn"s
      // min-max is interesting for better defined ui, but might be
      // problematic for other use cases.
    , HueNumberModel = _AbstractNumberModel.createClass('HueNumberModel', {min: 0, max:1, defaultValue: 0, toFixedDigits: 7})
    , HueNumberOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(HueNumberModel)
    // FIXME: internal representations should not necessarily mirror
    // UI/UX considerations, as such maybe the raw representations
    // of these fields should rather be used as storage format and
    // some in between layer at UI level should translate. However,
    // there's no such layer yet, hence the user wins.
    , alphaColorMixin = [
        // *A*lpha
        // MDN for css okchl() on the A component:
        //      An <alpha-value> or the keyword none, where the number 1
        //      corresponds to 100% (full opacity).
        // MDN for <alpha-value>:
        //      The <alpha-value> CSS data type represents a value that
        //      can be either a <number> or a <percentage>, specifying the
        //      alpha channel or transparency of a color.
        // Using percentages for this, as users understand that well.
        ['alpha', AlphaPercentNumberOrEmptyModel]
    ]
  , OKLCHColorModel = _BaseColorModel.createClass(
        'OKLCHColorModel'
        // *L*ightness
        // MDN for css okchl() on the L component:
        //      A <number> between 0 and 1, a <percentage> between 0% and
        //      100%, for the keyword none, where the number 0 corresponds
        //      to 0% (black) and the number 1 corresponds to 100% (white).
        //      L specifies the perceived lightness.
        // Using percentages for this, as users understand that well.
      , ['L', PercentNumberOrEmptyModel]
        // *C*hroma
        // MDN for css okchl() on the C component:
        //      A <number>, a <percentage>, or the keyword none, where 0%
        //      is 0 and 100% is the number 0.4. It is a measure of the
        //      chroma (roughly representing the "amount of color"). Its
        //      minimum useful value is 0, while the maximum is theoretically
        //      unbounded (but in practice does not exceed 0.5).
        // Using percentages for this, as users understand that well.
      , ['C', PercentNumberOrEmptyModel]
        // *H*ue
        // MDN for css okchl() on the H component:
        //      A <number>, an <angle>, or the keyword none, which represents
        //      the hue angle. More details on this type can be found on
        //      the <hue> reference.
        // Using turns here, as it's easy to work with and easily transformed
        // into other angle formats.
      , ['H', HueNumberOrEmptyModel]
      , ... alphaColorMixin
    )
  , OKLABColorModel = _BaseColorModel.createClass(
        'OKLABColorModel'
        // *L*ightness
        // MDN for css okchl() on the L component:
        //      A <number> between 0 and 1, a <percentage> between 0% and
        //      100%, for the keyword none, where the number 0 corresponds
        //      to 0% (black) and the number 1 corresponds to 100% (white).
        //      L specifies the perceived lightness.
        // Using percentages for this, as users understand that well.
      , ['L', PercentNumberOrEmptyModel]
        // *a* axis green - red
        // MDN for css oklab() on the a component:
        //      A <number> between -0.4 and 0.4, a <percentage> between
        //      -100% and 100%, or the keyword none. It specifies the
        //      distance along the a axis in the Oklab colorspace, that
        //      is, how green or red the color is.
        // Using percentages for this, as users understand that well,
        // also the CSS lab model operates on -125 to +125 on a and b axis
        // but understands these percentages as well.
      , ['a', PercentWithNegativeNumberOrEmptyModel]
        // *b* axis blue - yellow
        // MDN for css oklab() on the b component:
        //       A <number> between -0.4 and 0.4, a <percentage> between
        //      -100% and 100%, or the keyword none. It specifies the
        //      distance along the b axis in the Oklab colorspace, that is,
        //      how blue or yellow the color is.
        // Using percentages for this, as users understand that well,
        // also the CSS lab model operates on -125 to +125 on a and b axis
        // but understands these percentages as well.
      , ['b', PercentWithNegativeNumberOrEmptyModel]
      , ... alphaColorMixin
    )
  , RGBColorModel = _BaseColorModel.createClass(
        'RGBColorModel'
        // MDN for css rgb() on the R, G, B components:
        //      Each as a <number> between 0 and 255, a <percentage>
        //      between 0% and 100%, or the keyword none, which represent
        //      the red, green, and blue channels, respectively.
      , ['R', PercentNumberOrEmptyModel]
      , ['G', PercentNumberOrEmptyModel]
      , ['B', PercentNumberOrEmptyModel]
      , ... alphaColorMixin
    )
  , [availableColorTypes, COLOR_TYPE_TO_COLOR_TYPE_KEY] = (()=>{
        const colorTypes = [
                ['OKLCH', 'OKLCH', OKLCHColorModel]
              , ['OKLAB', 'OKLAB', OKLABColorModel]
              , ['RGB', 'RGB', RGBColorModel]
            ]
          , availableColorTypesDraft = AvailableColorTypesModel.createPrimalDraft({})
          , COLOR_TYPE_TO_COLOR_TYPE_KEY = new Map()
          ;
        for(const [key, label, Model] of colorTypes) {
            const availableColorType = AvailableColorTypeModel.createPrimalDraft({});
            availableColorType.get('typeClass').value = Model;
            availableColorType.get('label').value = label;
            availableColorTypesDraft.push([key, availableColorType]);
            COLOR_TYPE_TO_COLOR_TYPE_KEY.set(Model, key);
        }
        const availableColorTypes = availableColorTypesDraft.metamorphose();
        return [availableColorTypes, COLOR_TYPE_TO_COLOR_TYPE_KEY];
    })()
  ;

const COLOR_TYPE_TO_CULORI_MODE = new Map([
        [OKLCHColorModel, 'oklch']
      , [OKLABColorModel, 'oklab']
      , [RGBColorModel, 'rgb']
    ])
  , CULORI_MODE_TO_COLOR_TYPE_KEY = new Map(Array.from(COLOR_TYPE_TO_CULORI_MODE)
        .map(([type, value])=>[value, COLOR_TYPE_TO_COLOR_TYPE_KEY.get(type)]))
  ;

const NumericPropertiesModel = _AbstractOrderedMapModel.createClass('NumericPropertiesModel', NumberModel)
  //, PropertiesModel = _AbstractStructModel.createClass(
  //      'PropertiesModel'
  , propertiesModelMixin = Object.freeze([
        CoherenceFunction.create(['numericProperties'],
        function sanitizeNumericProperties({numericProperties}) {
            // const axisRanges = font.value.axisRanges;
            // axisRanges[axis.tag] {
            //      name /*  'name' in axis ? axis.name.en : axis.tag */
            //    , min, max, default }
            for(const [/*key*/, entry] of numericProperties) {
                // TODO: we need some defaults, min, max etc. descriptions
                // of the available properties (we don't know either what
                // is available
                const {min, max} = {min: -Infinity, max: Infinity}; //axisRanges[key];

                if(typeof entry.value !== 'number')
                    // NumberModel is still generic!
                    throw new Error(`ASSERTION ERROR expecting a number value but got: ${typeof entry.value} in numericProperties`);
                // And make sure existing axes are within the
                // min/max limits.
                entry.value = Math.max(min, Math.min(max, entry.value));

                // The UI must decide to store explicitly data in
                // here or not. If it is not in here, the default
                // value is implicit!.
                // In that case this case should be removed!
                // if(entry.value === defaultVal)
                //     axisRanges.delete(key);
            }
        })// => [name, instance]
      , ['numericProperties', NumericPropertiesModel]
        // TODO: Put manualAxesLocationsModel in here
        // CAUTION: It could be nicer to mix in its definition directly.
        // TODO: Create a getter for ...ManualAxesLocationsModel.mixin
        //       see also: propertiesModelMixin
        // OR: even simpler: just export the mixin as an array, just like this.
        //     THEN use that definition in ManualAxesLocationsModel as well
        // , ['manualAxesLocationsModel', ManualAxesLocationsModel]
        //       , CoherenceFunction.create(['font', 'fontSize', 'autoOPSZ', 'axesLocations'],
        //          function sanitizeAxes(...)[...]
        //       , ['autoOPSZ', BooleanModel, /* default true */]
        //       , ['axesLocations', AxesLocationsModel]
        // Maybe, we create an ManualAxesLocationsOrEmptyModel and
        // only if there's a font, the model is instantiated...
        // some Actors may not require these properties...
        // The Stage, Layers -- both containers -- and everything that
        // actually renders type should have font related properties.
    ])
    //)
  , keyMomentUIModelMixin = [
        ['isActive', BooleanModel] // todo: rename "selected"?
    ]
  , keyMomentModelMixin = [
            ...keyMomentBaseModelMixin
          , ...keyMomentUIModelMixin
          // , ['fontSize', FontSizeModel]
          // , ['manualAxesLocations', ManualAxesLocationsModel]
          , ...propertiesModelMixin
    ]
  , KeyMomentModel = _AbstractStructModel.createClass(
        'KeyMomentModel'
      , ...keyMomentModelMixin
        // KeyMomentModel goes only circle and rect so far, and these
        // are SVG centric colors. Maybe it should be a more specific
        // name then, like SVGBasicKeyMomentModel
      , ['strokeColor', ColorModel] // not inherited
      , ['fillColor', ColorModel] // not inherited
    )
  , FontSizeModel = _AbstractSimpleOrEmptyModel.createClass(NumberModel)
  , typographyKeyMomentPureModelMixin = [
        ['fontSize', FontSizeModel]
      , ['textColor', ColorModel] // inherited from upper layers
      , ['backgroundColor', ColorModel] // not inherited
  ]
  , typographyKeyMomentModelMixin = [
        ...keyMomentModelMixin
      , ...manualAxesLocationsModelMixin // requires font, fontSize
      , ...typographyKeyMomentPureModelMixin
    ]
  , TypographyKeyMomentModel = _AbstractStructModel.createClass(
        'TypographyKeyMomentModel'
      , ...typographyKeyMomentModelMixin
    )
  , StringOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(StringModel)
  , TextAlignmentModel = _AbstractEnumModel.createClass('TextAlignmentModel', ['left', 'center', 'right', 'start', 'end'], 'left')
  , TextAlignmentOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(TextAlignmentModel)
  , CSSPositioningVerticalModel = _AbstractEnumModel.createClass('CSSPositioningVerticalModel', ['top', 'bottom'], 'top')
  , CSSPositioningVerticalOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(CSSPositioningVerticalModel)
    // FROM https://developer.mozilla.org/en-US/docs/Web/CSS/position
    //   > If both left and right are specified, left wins when direction is ltr
    //     (English, horizontal Japanese, etc.) and right wins when direction
    //     is rtl (Persian, Arabic, Hebrew, etc.).
    // So, as an experiment I will add "both" and it will set the same
    // value to left and right, let's see how that works in  LTR/RTL
    // situations.
  , CSSPositioningHorizontalModel = _AbstractEnumModel.createClass('CSSPositioningHorizontalModel', ['left', 'right', 'both'], 'left')
  , CSSPositioningHorizontalOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(CSSPositioningHorizontalModel)
  , CSSDirectionModel = _AbstractEnumModel.createClass('CSSDirectionModel', ['ltr', 'rtl', 'inherit'], 'inherit')
  , CSSDirectionOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(CSSDirectionModel)
  , HeightTreatmentModel = _AbstractEnumModel.createClass('HeightTreatmentModel', ['default', 'baselineToBottomFix'], 'default')
  , HeightTreatmentOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(HeightTreatmentModel)
  , TypeSettingKeyMomentModel = _AbstractStructModel.createClass(
        'TypeSettingKeyMomentModel'
      , ...typographyKeyMomentModelMixin
        // FIXME: having this here is nice for e.g. the lineOfText actor
        // Other non-transitioning fileds are e.g, the upcomming
        // "alignment" (Enum of 'left', 'right', 'center')
        // this is very specific for the actor type, maybe we can make
        // it more broadly useful by being it more than just a string.
        // could be more composed, a whole paragraph or something. However,
        // a full document should likeley rather be created using the
        // actor hierarchy, e.g. a paragraph actor could contain plain text,
        // emphasized text, anchors/links, and so on. Eventually we'd have
        // full control in time over a text and could create a semantically
        // reasonable document from that.
      , ['textRun', StringOrEmptyModel]
        // ['textAlign', TextAlignEnum]
        //        => does this require a width property?
        //        => not necessarily, if it's just the lineOfText without
        //           line breaks, but in that case the positioning marks
        //           where the source is and the align marks how it grows
        //           out from there, not sure this can be done reasonably
        //           with CSS and without an explicit width, but it should
        //           in that case, work that way.
      , ['textAlign', TextAlignmentOrEmptyModel]
      , ['positioningHorizontal', CSSPositioningHorizontalOrEmptyModel]
      , ['positioningVertical', CSSPositioningVerticalOrEmptyModel]
      , ['direction', CSSDirectionOrEmptyModel]
      , ['heightTreatment', HeightTreatmentOrEmptyModel]
    )
    // Order is really most important here, however, _AbstractOrderedMapModel
    // could still be an option, then move "label" as unique identifier in
    // here. However, this works good enough.
  , KeyMomentsModel = _AbstractListModel.createClass('KeyMomentsModel', KeyMomentModel)
  , TypographyKeyMomentsModel = _AbstractListModel.createClass('TypographyKeyMomentsModel', TypographyKeyMomentModel)
  , TypeSettingKeyMomentsModel = _AbstractListModel.createClass('TypeSettingKeyMomentsModel', TypeSettingKeyMomentModel)
  ;

export class _BaseActorModel extends _AbstractStructModel {
    static createClass(className, ...definitions) {
        return super.createClass(
            className
          , ...definitions
        );
    }
}
const ActorTypeModel = _AbstractGenericModel.createClass('ActorTypeModel')// => .value will be a concrete _BaseActorModel
    // make this selectable...
  , AvailableActorTypeModel = _AbstractStructModel.createClass(
        'AvailableActorTypeModel'
      , ['label', StringModel]
      , ['typeClass', ActorTypeModel]
    )
  , AvailableActorTypesModel = _AbstractOrderedMapModel.createClass('AvailableActorTypesModel', AvailableActorTypeModel)
    // This is a very opaque way of creating instances for different
    // types.
  , ActorModel = _AbstractStructModel.createClass(
        'ActorModel'
      , ['availableActorTypes', new InternalizedDependency('availableActorTypes', AvailableActorTypesModel)]
        // TODO: having ALLOW_NULL here is interesting, and I'm not convinced
        // all the consequences are known by me now. It's about not creating
        // whatever Actor this falls back to. But eventually null means
        // _AbstractDynamicStructModel: instance will have a null value.
        // and maybe we should handle this like an _AbstractSimpleOrEmptyModel
        // which raises if trying to read from an empty model and hence forces
        // awareness and always to use
      , ['actorTypeKey', new ForeignKey('availableActorTypes', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['actorTypeModel', new ValueLink('actorTypeKey')]
      // It would be nice if (something like) this could be the ActorModel
      // directly however, we'd loose the ability to allow based on the list.
      // Not sure if that is really important though, the list of
      , ['instance', _AbstractDynamicStructModel.createClass('DynamicActorModel'
                            , _BaseActorModel
                            ,'actorTypeModel' // this becomes a special dependency name
                            // This is a bit of a pain point, however, we
                            // can't collect these dependencies dynamically yet:
                            , ['availableActorTypes', 'font', 'installedFonts', 'availableColorTypes'])]//, 'referenceableActors' ??? ])]
    )
      // This is the home for instances of actors.
      // Require named keys for actors to make them uniquely identifyable
      // but also human identifiable. This is different to KeyMomentsModel
      // where order is absolutly crucial information and labels can be not
      // unique. One result of this is however, that references to these
      // actors, when the key is renamed, should carefully be tracked and
      // renamed as well!
      // Another result is that UX must help users to understand the uniqueness
      /// requirements.
    , ActorsModel = _AbstractListModel.createClass('ActorsModel', ActorModel) // _AbstractOrderedMapModel
      // This is very similar ActiveKeyMomentModel which was invented first
      // referencing an ActorModel item in ActorsModel with a 'state'
      // that is a _BaseActorModel
      // It is a _BaseActorModel so it can actually be referenced by it's
      // own type as well.
      // TODO: try and explain the behavior of recursive/self-references!
      // It's interesting though, as the metamodel likely has no issue with
      // this, but e.g. the UI and displaying/interpreting side could develop
      // issues.
   //, ReferenceActorModel = _BaseActorModel.createClass(
   //    'ReferenceActorModel'
   //    // requires "actors" as a dependency from parent to be able to
   //    // point the ForeignKey into it we must define it as an InternalizedDependency
   //  , ['referencableActors', new InternalizedDependency('referencableActors', ActorsModel)]
   //    // This whole struct shouldn't exist if there's no actor
   //    // hence ForeignKey.NOT_NULL
   //  , ['key', new ForeignKey('referencableActors', ForeignKey.NOT_NULL, ForeignKey.NO_ACTION)]
   //    // We are editing via this one I guess, editing also means to resolve
   //    // the link to get a proper draft from the parent that owns the actual
   //    // actor!
   //  , ['actor', new ValueLink('key')]
   //    // Depending on the use case we may want to store more data alongside.
   //    // e.g. x/y displacement or transformation matrix of an actor.
   //    //
   //    // When does the actor enter the stage? (default: t=0)
   //    // When does the actor leave the stage? (default t=1)
   //    // The above could be more sophisticated, the actor could be entereing
   //    // and leaving multiple times, but, that could also be done by
   //    // using multiple references.
   //    // It could also be realized using opacity, where a shortcut when
   //    // opacity is 0 would make sure the actor is not animated at all.
   //    // That way, stage presence can be implemented with key moments.
   //    // Otherwise, it could be a discrete number[0, 1] or a rounding
   //    // could be used.
   //    //
   //    // Mapping "global"-time-t to actor-t. E.g. the actor could
   //    // be playing in just a fraction of the stage time.
   //    // Also, t to actor-t: actor-t could be no-linear, could go backwards
   //    // etc. basically, we could have keyMoments to animate actorT.
   //    //
   //    // x and y: can be interpolated without any issues, rotation
   //    // would be more complex!
   //    // z: implementation dependent.
   //    //
   //    // scale: use one value as a uniform x/y scaling???
   //)
  //, ActorReferencesModel = _AbstractListModel.createClass('ActorReferencesModel', ActorReferenceModel)
    // A layer is a container or groupig for more actors.
    // could be called a "Group" in fact. Using "Layer" as it is a familiar
    // term for design tools. A "Group" is familiar as well, and I'm not
    // sure what the difference actually shold be, despite that the UIs
    // usually have less support for groups than for layers. It's
    // maybe a UI treatment difference.
  , genericActorMixin = [
        CoherenceFunction.create(
            ['isLoop']
          , function prepareIsLoop({isLoop}) {
            if(isLoop.value === undefined)
                isLoop.value = false;
        })
      , ['isLoop', BooleanModel] // connect end with beginning and transition
    ]
  , typographyActorMixin = [
        ['installedFonts', new InternalizedDependency('installedFonts', InstalledFontsModel)]
      , ['parentFont', new InternalizedDependency('font', InstalledFontModel)]
      , ['localActiveFontKey', new ForeignKey('installedFonts', ForeignKey.ALLOW_NULL, ForeignKey.SET_NULL)]
      , ['localFont', new ValueLink('localActiveFontKey')]
      , ['font', new FallBackValue('localFont', 'parentFont', InstalledFontModel)]
    ]
  , LayerActorModel = _BaseActorModel.createClass(
        'LayerActorModel'
      , ...genericActorMixin
      , ['keyMoments', TypeSettingKeyMomentsModel]
      , ...typographyActorMixin
      , ['activeActors', ActorsModel]
      // removed, because ActorReferencesModel via ActorReferenceModel
      // already depends on ActorsModel:availableActors
      //  , ['availableActors', new InternalizedDependency('availableActors', ActorsModel)]
        // this should also inherit or override all the properties.
        // especially size, x, y, z, t
    )
    // This is no meant as an eventual Actor, just to simply set up
    // without great complexity.
    // Just enough information to create:
    // <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    //            <circle cx="50" cy="50" r="50" />
    // </svg>
    // where viewBox width/height = 2 * radius
  , CircleActorModel = _BaseActorModel.createClass(
        'CircleActorModel'
      , ...genericActorMixin
      , ['keyMoments', KeyMomentsModel]
    //  , CoherenceFunction.create(
    //        ['x', 'y', 'radius']
    //      , function setDefaults({x, y, radius}) {
    //        if(x.value === undefined)
    //            x.value = 0;
    //        if(y.value === undefined)
    //            y.value = 0;
    //        if(radius.value === undefined)
    //            radius.value = 50;
    //    })
    //  , ['radius', NumberModel]
    //  , ['x', NumberModel]
    //  , ['y', NumberModel]
    )
  , RectangleActorModel = _BaseActorModel.createClass(
        'RectangleActorModel'
      , ...genericActorMixin
      , ['keyMoments', KeyMomentsModel]
    )
  , LineOfTextActorModel = _BaseActorModel.createClass(
        'LineOfTextActorModel'
      , ...genericActorMixin
      , ['keyMoments', TypeSettingKeyMomentsModel]
      , ...typographyActorMixin
      // textRun is now is KeyMoments and used instead
      // , CoherenceFunction.create(
      //       ['text']
      //     , function setDefaults({text}) {
      //       if(text.value === undefined)
      //           text.value = 'Sample Text';
      //   })
      // , ['text', StringModel]
    )
  , [/*referencableActorTypes*/, activatableActorTypes] = (()=>{
        const referenceTypeKey = 'ReferenceActorModel'
          , actorTypes = [
                ['LayerActorModel', 'Layer', LayerActorModel]
                // there could be an alias (so users would find "Groups" as well
                // even though it is the same:
                // ['LayerActorModel', 'Group', LayerActorModel]
            // , [referenceTypeKey, 'Reference', ReferenceActorModel]
              , ['CircleActorModel', 'Circle', CircleActorModel]
              , ['RectangleActorModel', 'Rectangle', RectangleActorModel]
              , ['LineOfTextActorModel', 'Line of Text', LineOfTextActorModel]
            ]
          , availableActorTypesDraft = AvailableActorTypesModel.createPrimalDraft({})
          ;
        for(const [key, label, Model] of actorTypes) {
            const availableActorType = AvailableActorTypeModel.createPrimalDraft({});
            availableActorType.get('typeClass').value = Model;
            availableActorType.get('label').value = label;
            availableActorTypesDraft.push([key, availableActorType]);
        }
        const availableActorTypes = availableActorTypesDraft.metamorphose()
          , referencableActorTypesDraft = availableActorTypes.getDraft()
          ;
        referencableActorTypesDraft.delete(referenceTypeKey);
        const referencableActorTypes = referencableActorTypesDraft.metamorphose();
        return [referencableActorTypes, availableActorTypes];
    })()

  //, ReferencableActorsModel = _AbstractStructModel.createClass(
  //      'ReferencableActorsModel'
  //    , ['activeActors', ActorsModel]
  //      // this, so hope, is the magic piece to allow here just a subset
  //      // of all available actors.
  //    , ['referencableActors', new InternalizedDependency('referencableActorTypes', AvailableActorTypesModel)]
  //  )
    // TODO: _AbstractTypedModel('PathModel', Path) => would be simple!
  , PathModel = _AbstractGenericModel.createClass('PathModel')
  , StageAndActorsModel = _BaseLayoutModel.createClass(
        'StageAndActorsModel'
      , ...timeControlModelMixin
         // same as in_BaseActorModel, but this is not an actor,
         // these properties are the root of the inheritance.
      , ['keyMoments', TypographyKeyMomentsModel]
      , CoherenceFunction.create(
            ['width', 'height'/*, 'availableActorTypes', 'activeActors', 'font', 'installedFonts'*/]
          , function setDefaults({width, height /*, availableActorTypes, activeActors, font, installedFonts*/}) {
            // Value is undefined in primal state creation.
            // Also, NumberModel, an _AbstractGenericModel, has no defaults or validation.
            //
            // widht and heigth defaults could also be determined differently
            // this is simply to get started somewhere.
            if(width.value === undefined)
                width.value = 720; // 1080;
            if(height.value === undefined)
                height.value = 720; // 1080;
        })
        // very similar to Layer, we could even think about
        // using something like ['baseLayer', LayerActorModel]
        // I'm currently thinking, this could also be a ActorsModel
        // and allow to define actors in place. Then it's only necessary
        // to put actors into availableActors when they will be used by
        // reference.
      , ['activeActors', ActorsModel]
        // ok, we need to select from somewhere an available type
        // maybe, this can be a permanent, local (injected here?) dependency
        // not one that is injected via the shell. Unless, we start to
        // add actors in a plugin-way, like it is planned for layouts ...
        // TODO:
        // FIXME: removed the type for this StaticDependency definition,
        // which would be "AvailableActorTypesModel", as it gets a direct
        // value and that is whatever type it is. It should be immutable
        // for sure.
        // FIXME: Other dependencies, however, should also be defined with
        // a type, so we can always be sure to receive the expected type.
        // Maybe also some (rust) trait-like description of required
        // fields and their types could be helpful for this, so stuff
        // can be similar but is not bound to the actual same type.
        // static dependeny could as implementation always be applied to
        // the dependencies dict after collecting external dependencies,
        // then, treat it as InternalizedDependency...
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableActorTypes'
                      , AvailableActorTypesModel
                      , activatableActorTypes
                      )
        // , ... StaticDependency.createWithInternalizedDependency(
        //                   'referencableActorTypes'
        //                 , AvailableActorTypesModel
        //                 , referencableActorTypes
        //                 )
        // , ['referencableActors', ReferencableActorsModel]
      , ... StaticDependency.createWithInternalizedDependency(
                        'availableColorTypes'
                      , AvailableColorTypesModel
                      , availableColorTypes
                      )
      , ['width', NumberModel]
      , ['height', NumberModel]
      , ['editingActor', _AbstractSimpleOrEmptyModel.createClass(PathModel)]
    )
  ;

// So, we want to get a t value from parent, as a dependency, but give
// another t value to the child, could be done in a coherence method
// where parentT => InternalizedDependency('t', NumberModel)
//       t=>NumberModel
// and the coherence function can do something to go from parentT to t
// BUT at this point there's a discrepance between actually stored values
// and calculated values required e.g. for rendereing, and it is time to
// implement something concrete!



/**
 * Similar to the concept Surfaces in Cairo
 * https://www.cairographics.org/manual/cairo-surfaces.html
 * this will be the rendering target. Likely each surface will have
 * it's own capabilties. It's interesting that HTML in general and also
 * SVG can host different technologies (HTML/CSS, SVG, Canvas2d/3d)
 * so maybe we can mix these surfaces eventually as well.
 */
// class SurfaceHTML extends _BaseComponent {
//     //jshint ignore:start
//     static TEMPLATE = `<div class="surface_html">
// </div>`;
//     //jshint ignore:end
//     constructor(parentAPI) {
//         super(parentAPI);
//         [this.element] = this.initTemplate();
//     }
//
//     initTemplate() {
//         const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
//           , element = frag.firstElementChild
//           ;
//         return [element];
//     }
//
//     // activeActors
//     // width
//     // height
//     update(changedMap) {
//         changedMap.has('hello');
//     }
// }

function _actorApplyCSSColors(element, propertyValuesMap, getDefault, colorPropertiesMap) {
    for(const [propertyName, cssPropertyName] of colorPropertiesMap) {
        const [color_, ] = _getColorFromPropertyValuesMap(propertyName, propertyValuesMap, [null])
          , color = color_ !== null
                    ? color_
                    : getDefault(propertyName)
          ;
        if(color) {
            const cssColor = culoriFormatCss(color);
            element.style.setProperty(cssPropertyName, cssColor);
        }
        else
            element.style.removeProperty(cssPropertyName);
    }
}

const DYNAMIC_MARKER = Symbol('DYNAMIC_MARKER');
function _getPropertyValue(propertyValuesMap, getDefault, fullKey) {
    return propertyValuesMap.has(fullKey)
            ? [true, propertyValuesMap.get(fullKey)]
            : getDefault(fullKey)
            ;
}

function* _massagePropertyData(propertyValuesMap, getDefault, propertyDescription) {
    const [fullKey, dynamicFullKey, propertyExpanderOrUnit, ...rest] = propertyDescription
      , [, cssProperty] = _getPropertyValue(propertyValuesMap, getDefault, dynamicFullKey)
      ;
    if(typeof propertyExpanderOrUnit !== 'function') {
        // propertyExpander is the "unit"
        yield [fullKey, cssProperty, propertyExpanderOrUnit, ...rest];
    }
    else {
        for(const cssProperty_ of propertyExpanderOrUnit(cssProperty))
            yield [fullKey, cssProperty_, ...rest];
    }
}

function _actorApplyCssProperty (element, propertyValuesMap, getDefault, propertyData) {
    const [fullKey, cssProperty, unit, cleanFn] = propertyData
      , [useUnit, value] = _getPropertyValue(propertyValuesMap, getDefault, fullKey)
      ;
    if(typeof cssProperty === 'function')
        // setter function
        cssProperty(element, value, propertyValuesMap, getDefault, useUnit);
    else
        element.style.setProperty(cssProperty, `${cleanFn ? cleanFn(value) : value}${useUnit ? unit : ''}`);
}

function _actorApplyCssProperties(element, propertyValuesMap, getDefault, propertyDescriptions) {
    var stack = [...propertyDescriptions];
    while(stack.length) {
        const propertyDescription = stack.pop();
        if(propertyDescription[0] !== DYNAMIC_MARKER)
            _actorApplyCssProperty(element, propertyValuesMap, getDefault, propertyDescription);
        else
            stack.push(..._massagePropertyData(propertyValuesMap, getDefault
                                             , propertyDescription.slice(1)));
    }
}

/** propertyExpander **/
function _CSSPositioningHorizontalPropertyExpander(cssProperty) {
    return cssProperty === 'both' ? ['left', 'right'] : [cssProperty];
}

/**
 * This is to set/manage the properties of a layer node.
 */
class LayerDOMNode extends StaticNode {
    constructor(parentAPI, node, cssClasses) {
        super(parentAPI, node);
        for(const className of ['stage_and_actors-layer', ...cssClasses])
            this.node.classList.add(className);
    }
    update(changedMap) {
        const propertiesData = [
              [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', _CSSPositioningHorizontalPropertyExpander, 'px']
            , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
            , ['numericProperties/z-index', 'z-index', '',  Math.round]
            , ['numericProperties/width', 'width', 'px']
            , ['numericProperties/height', 'height', 'px']
        ];
        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => {
                    if('numericProperties/width' ===  property
                        || 'numericProperties/height' ===  property
                    )
                        return [false, 'inherit'];
                    return [true, _getRegisteredPropertySetup(property).default];
                }
              , colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;
            _actorApplyCSSColors(this.node, propertyValuesMap, getDefault, colorPropertiesMap);

            // set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this block, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            _actorApplyCssProperties(this.node, propertyValuesMap, getDefault, propertiesData);
        }
    }
}
class StageDOMNode extends StaticNode {
    constructor(parentAPI, node, layerNode, cssClasses) {
        super(parentAPI, node);
        for(const className of [ ...cssClasses])
            this.node.classList.add(className);
        this._layerNode = layerNode;
    }
    update(changedMap) {
        // Stage width and heigth are so far not animated in time,
        // as they are supposed to change with the environment/portal properties
        for(const property of ['width', 'height']) {
            if(changedMap.has(property))
                // FIXME: CAUTION: the px unit should likely be configurable
                this.node.style.setProperty(property, `${changedMap.get(property).value}px`);
        }

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => _getRegisteredPropertySetup(property).default
              , colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;
            _actorApplyCSSColors(this._layerNode, propertyValuesMap, getDefault, colorPropertiesMap);
        }
    }
}

class CircleActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<svg
    viewBox="0 0 0 0"
>
    <circle cx="0" cy="0" r="0" />
</svg>`;
    // jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        [this.element, this.circle] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , circle = element.querySelector('circle')
          ;
        element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element, circle];
    }
    update(changedMap) {
        // console.log('CircleActorRenderer.update changedMap:', ...changedMap);
        const setRadius = radius=>{
                for(const [element, attr, value] of [
                        [this.element, 'viewBox', `-${radius} -${radius} ${2*radius} ${2*radius}`]
                      , [this.circle, 'r', `${radius}`]
                ]) {
                     element.setAttribute(attr, value);
                }
                this.element.style.setProperty('width', `${2*radius}px`);
                this.element.style.setProperty('height', `${2*radius}px`);
            }
          , propertiesData = [
                [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', _CSSPositioningHorizontalPropertyExpander, 'px']
              , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', 'px']
              , ['numericProperties/z-index', 'z-index', '',  Math.round]
              , ['numericProperties/r', (elem, value)=>setRadius(value)]
          ];

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
              , colorPropertiesMap = [
                      ['colors/strokeColor', 'stroke']
                    , ['colors/fillColor', 'fill']
                ]
              ;
            _actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            // set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example

            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            _actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
        }
    }
}

class RectangleActorRenderer extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<svg
    viewBox="0 0 0 0"
>
    <rect width="0" height="0" />
</svg>`;
    // jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        [this.element, this.shape] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , shape = element.querySelector('rect')
          ;
        element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element, shape];
    }
    update(changedMap) {
        // console.log('CircleActorRenderer.update changedMap:', ...changedMap);
        const setExtend = (prop, value)=>{
                // 0 0 width height
                // A bit messy: element attribute will keep the other dimension
                const viewBox =  this.element.getAttribute('viewBox').split(' ');
                if(prop === 'width')
                    viewBox[2] = value;
                if(prop === 'height')
                    viewBox[3] = value;
                for(const [element, attr, v] of [
                            [this.element, 'viewBox', viewBox.join(' ')]
                          , [this.shape, prop, value]
                    ])
                     element.setAttribute(attr, v);
                this.element.style.setProperty(prop, `${value}px`);
            }
          , propertiesData = [
                [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', 'px']
              , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', _CSSPositioningHorizontalPropertyExpander, 'px']
              , ['numericProperties/z-index', 'z-index', '',  Math.round]
              , ['numericProperties/width', (elem, value)=>setExtend('width', value)]
              , ['numericProperties/height', (elem, value)=>setExtend('height', value)]
          ];

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
              , colorPropertiesMap = [
                      ['colors/strokeColor', 'stroke']
                    , ['colors/fillColor', 'fill']
                ]
              ;
            _actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            _actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
        }
    }
}

function _setTypographicPropertiesToSample(sample, propertyValuesMap) {
    const axisPrefix = 'axesLocations/';

    if((propertyValuesMap.has('fontSize')))
        sample.style.setProperty('font-size', `${propertyValuesMap.get('fontSize')}pt`);
    else
        sample.style.removeProperty('font-size');

    const variations = [];
    for(const [key, value] of propertyValuesMap) {
        if(!key.startsWith(axisPrefix))
            continue;
        const axisTag = key.slice(axisPrefix.length);
        variations.push(`"${axisTag}" ${value}`);
    }
    // FIXME: maybe set only existing axes and only to valid ranges?
    // inherited axesLocations would set anything here. However,
    // the font rendering inherently also doesn't fail.
    sample.style.setProperty('font-variation-settings', variations.join(','));
}

class LineOfTextActorRenderer  extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<span class="actor_renderer-line_of_text">(content not initialized)</span>`;
    // jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        [this.element] = this.initTemplate();
    }
    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        element.style.setProperty('position', 'absolute');
        this._insertElement(element);
        return [element];
    }

    update(changedMap) {
        // console.log('CircleActorRenderer.update changedMap:', ...changedMap);
        const propertiesData = [
                [DYNAMIC_MARKER, 'numericProperties/x', 'generic/positioningHorizontal', 'px']
              , [DYNAMIC_MARKER, 'numericProperties/y', 'generic/positioningVertical', _CSSPositioningHorizontalPropertyExpander, 'px']
              , ['numericProperties/width', 'width', 'px']
              , ['numericProperties/height', (element, value, propertiesValueMap, getDefault, useUnit)=>{
                    let value_;
                    if(value == '') {
                        const [, heightTreatment] =_getPropertyValue(
                                              propertiesValueMap, getDefault
                                            , 'generic/heightTreatment');
                        // FIXME: in this case, if positioningVertical is not
                        // set explicitly, it should default to bottom.
                        value_ =  heightTreatment === 'baselineToBottomFix'
                            ? 'calc(1em * var(--ascender) / var(--units-per-em))'
                            : ''
                            ;
                    }
                    else
                        value_ = value;
                    element.style.setProperty('height', `${value_}${useUnit ? 'px' : ''}`);
                }]
              , ['numericProperties/height', 'height', 'px']
                // Doubling height as line-heigth, only makes (partially)
                // sense because this is indeed just a single line of text.
              // , ['numericProperties/height', 'line-height', 'px']
              , ['numericProperties/z-index', 'z-index', '',  Math.round]
              , ['generic/textAlign', 'text-align', '']
              , ['generic/direction', 'direction', '']
        ];

        if(changedMap.has('font')) {
            // This also triggers when font changes in a parent trickle
            // down, so these properties should always be set correctly.
            const font = changedMap.get('font').value;
            this.element.style.setProperty('font-family', `"${font.fullName}"`);
            this.element.style.setProperty('--units-per-em', `${font.fontObject.unitsPerEm}`);
            this.element.style.setProperty('--ascender', `${font.fontObject.ascender}`);
            this.element.style.setProperty('--descender', `${font.fontObject.descender}`);
        }

        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              // , getDefault = property => [true, _getRegisteredPropertySetup(property).default]
              , getDefault = property => {
                    if('numericProperties/width' ===  property
                        || 'numericProperties/height' ===  property
                    )
                        return [false, ''];
                    return [true, _getRegisteredPropertySetup(property).default];
                }
              , colorPropertiesMap = [
                      ['colors/backgroundColor', 'background-color']
                    , ['colors/textColor', 'color']
                ]
              ;

            if((propertyValuesMap.has('generic/textRun')))
                this.element.textContent = propertyValuesMap.get('generic/textRun');
            else
                this.element.textContent = '';

            _actorApplyCSSColors(this.element, propertyValuesMap, getDefault, colorPropertiesMap);
            //  set properties to sample...
            // console.log(`${this.constructor.name}.update propertyValuesMap:`, ...propertyValuesMap);
            // Everything below can basically go only into this blog, as there
            // won't be the bottom kind of properties, at least not for
            // the example
            // console.log(`${this}.update(${[...changedMap.keys()].join(', ')}), propertyValuesMap:`, ...propertyValuesMap);
            // FIXME: also properties that are not explicitly set in here
            // should have a value!
            _actorApplyCssProperties(this.element, propertyValuesMap, getDefault, propertiesData);
            _setTypographicPropertiesToSample(this.element, propertyValuesMap);
        }
    }
}


/**
 * yield [propertyName, propertyValue]
 * derrived from axisLocationsGen
 */
function* numericPropertiesGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const numericProperties = keyMoment.get('numericProperties');
    for(const [key, property] of numericProperties)
        yield [`numericProperties/${key}`, property.value];
}


/**
 * yield [propertyName, propertyValue]
 * for each animatable property that is explicitly set
 */
function* fontSizeGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    const fontSize = keyMoment.get('fontSize');
    if(!fontSize.isEmpty)
        yield ['fontSize', fontSize.value];
}

/**
 * yield [propertyName, propertyValue]
 * derrived from keyMomentPropertyGenerator
 */
function* axisLocationsGen(outerAnimanionAPI, keyMoment, momentT) {
      // fontSize = keyMoment.get('fontSize')
      // => this is interesting, if keyMoment defines fontSize, we
      //    definitely use that, otherwise, going only via
      // outerAnimanionAPI.getPropertyAtMomentT('fontSize', momentT) will
      // yield the out-value (last value) of that momentT
      const autoOPSZ = keyMoment.get('autoOPSZ').value
      ;
    if(autoOPSZ) {
        const fontSize = keyMoment.get('fontSize')
          , fontSizeValue = fontSize.isEmpty
                  // this requires full calculation of the fontSize property animation!
                ? outerAnimanionAPI.getPropertyAtMomentT('fontSize', momentT, null)
                : fontSize.value
          ;
        if(fontSizeValue !== null)
            yield [`axesLocations/opsz`, fontSizeValue];
    }

    // FIXME/TODO: not sure how to handle this yet!
    // manualAxesLocations.get('autoOPSZ');
    // maybe if fontSize is set and if opsz is an existing axis
    // we could always yield [`axis:opsz`, axisValue.value];

    const axesLocations = keyMoment.get('axesLocations');
    for(const [axisTag, axisValue] of axesLocations) {
        if(autoOPSZ && axisTag === 'opsz')
            // It was already yielded above and also should not
            // be present in here.
            continue;
        // Other than fontSize axesLocations are just not present when
        // at their default value.
        // I'm using the 'axesLocations/' prefix so it's easier to
        // distinguish. But also, it can be used dirextly as a path
        // in getEntry.
        yield [`axesLocations/${axisTag}`, axisValue.value];
    }
}

// FIXME: copy pasta duplication from animation-animanion.mjs
function _culoriFixZeros(color, targetMode) {
    if(color.mode === targetMode)
        return color;
    // When components are missing, conversion to other modes
    // produces NaNs in culori, that's not a problem when the
    // components are compatible between spaces, i.e. don't require
    // or undergo an conversion.
    // Missing colors are set to 0 as suggested in
    // https://drafts.csswg.org/css-color/#interpolation-missing
    // I don't think we neeed a back-conversion in the interpolation
    // result. This resolves NaNs produces by culori in
    // conversion/interpolation.
    // Also: track: https://github.com/Evercoder/culori/issues/203
    // if that resolves the filter can return and the zeroing can
    // be removed again.
    const missing = []
      , {channels} = culoriGetMode(color.mode)
      ;
    let emptyCount = channels.length;
    for(const component of channels) {
        if(Object.hasOwn(color, component))
            // Not missing.
            continue;
        if(component === 'alpha') {
            emptyCount -= 1;
            // Missing alpha is not an issue as alpha is compatible everywhere.
            continue;
        }
        if(component === 'l' && color.mode.startsWith('ok')
                            && targetMode.startsWith('ok')) {
            // missing 'l' between oklab and oklch is compatible
            emptyCount -= 1;
            continue;
        }
        missing.push([component, 0]);
    }

    const result = missing.length
                // excluding alpha, if the color is empty we can keep
                // the emptyness
                && missing.length !== emptyCount
         // Add the missing components to a copy of a.
        ? {...color, ...Object.fromEntries(missing)}
        : color
        ;
    return result;
}

function _convertCuloriColorMode(originalCuloriColor, colorMode) {
    const zeroFixedColor =  _culoriFixZeros(originalCuloriColor, colorMode)
      , zeroFixedColorKeys = Object.keys(zeroFixedColor)
      , targetCuloriColor = zeroFixedColorKeys.length === 1 // only 'mode'
                // 'mode' and 'alpha'
                || (zeroFixedColorKeys.length === 2 && Object.hasOwn(zeroFixedColor, 'alpha'))
              // We can convert empty colors on the spot by just setting
              // a new color mode. 'alpha' needs no conversion either,
              // it's universally the same.
            ? {...zeroFixedColor, mode:colorMode}
            : culoriConverter(colorMode)(zeroFixedColor)
     ;
     // Bummer, culoriConverter turns e.g.
     //     Object { h: 108, mode: "oklch" } as oklab
     // into:
     //     Object { mode: "oklab", l: undefined, a: 0, b: 0 }
     for(const  k of Object.keys(targetCuloriColor)) {
        if(targetCuloriColor[k] === undefined)
            delete targetCuloriColor[k];
    }
     return targetCuloriColor;
}

function* colorsGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    for(const fieldName of getColorModelFields(keyMoment.constructor)) {
        const color = keyMoment.get(fieldName).get('instance');
        if(!color.hasWrapped)
            continue;

        // TODO:
        //      We are going to interpolate each component individually
        //      currently, we do full colors. But there's a problem getting
        //      reasonable defaults for missing components. E.g. we can't set
        //      hue in one keyMoment and use it in another key moment. that
        //      is mainly because we don't interpolate when we are exactly
        //      on a key moment. So, in order to be able to do that consistently
        //      we need to put all of the keyMoments interpolations into the
        //      same color model, e.g. backgroundColor => oklch
        //      textColor => rgb ...
        //      That is configuration that lives on the actor, next to the
        //      keyMoments, we could also default to oklch ok oklab etc.
        //      but changing the interpolation model has a lot of potential
        //      creating different transformations. Also, this should
        //      enable to e.g. choose the hue direction, specifically if
        //      a compatible interpolation color space is selected.
        //      These will always have a value, there's no way that there's
        //      no value.
        //      Thus, colorsGen should receive the necessary info to
        //      convert the color to the interpolation space and then
        //      yield the components of the target space only.
        //      we could also yield the target mode, as a convinience always
        //      however, within one keyMoments layer, it must be the same
        //      always. => could be an assertion error at relevant positon
        //      e.g.
        //              yield [`colors/${fieldName}/mode`, 'oklab']
        //              yield [`colors/${fieldName}/l`, 1]
        //              yield [`colors/${fieldName}/a`, 2]
        //              yield [`colors/${fieldName}/b`,  3]
        //              yield [`colors/${fieldName}/alpha`, 4]
        //              Where undefined components are not yielded.
        //
        // Starting with an in place implementation, with fixed color mode,
        // to be made configurable later ...
        // test the rest as well: 'rgb', 'oklch', 'oklab'
        //      for oklcg, it doesn't really make much sense without
        //      specifying how h/hue should be handled, as it's a polar
        // In general it seems to be dialed in so that using the interpolation
        // color mode with the colors in the same mode gives the colors the
        // super power of not having to define all components while
        // interpolating the individual components.
        const colorMode = 'oklab'
          , originalCuloriColor = colorToCulori(color)
          , targetCuloriColor = _convertCuloriColorMode(originalCuloriColor, colorMode)
          ;
        // This is not for interpolation! but it could sent instructions
        // along, like hue direction, could be an object.

        for( const [componentName, value] of Object.entries(targetCuloriColor)) {
            // Will also yield [`colors/${fieldName}/mode`, colorMode] as
            // that's an entry in targetCuloriColor.
            yield [`colors/${fieldName}/${componentName}`, value];
        }
        // FIXME: It doesn't make too much sense, to decompose
        //        the color here. Sure, it's straight forward for
        //        interpolation, but, unfortunately, it's losing
        //        the color-model AND we cannot interpolate between
        //        color-models
        //             * That is between models from one moment to the other.
        //               But above has good reasons as well.
        //             * Also, we now just yield the model along, let's
        //               see how that works out.
        //for(const [componentName, item] of instance.wrapped){
        //    if(item.isEmpty)
        //        continue;
        //    yield [`colors/${fieldName}/${componentName}`, item.value];
        //}
        // yield [`colors/${fieldName}`, colorToCulori(color)];
    }
}

/**
 * These will be handled largly automated in regard to their type and,
 * if it emerges, on the setup stored here.
 * They are yielded into animanion scope with the `generic/${fieldName}`
 * prefix by genericPropertiesBroomWagonGen and they will have ui-elements
 * established in KeyMomentController accordingly.
 */
const REGISTERED_GENERIC_KEYMOMENT_FIELDS = deepFreeze([
    'textRun', 'textAlign', 'positioningHorizontal', 'positioningVertical'
  , 'direction', 'heightTreatment'
]);
/**
 * This is to be able to simply yield properties of a keyMoment, that have
 * not been handled by the other, specialized, generators before. There's
 * so far no intrinsic way of knowing if a propert has been handled before,
 * and as the property names within the keyMoment are translated to the
 * animation namespace from the other generators output before ( using
 * outerAnimanionAPI) it would be still hard to tell. Thus, this will be
 * rather very explicit, until it becomes more apparent how to select
 * properties to yield.
 *
 * A broom wagon is a vehicle that follows a cycling road race "sweeping"
 * up stragglers who are unable to make it to the finish within the time
 * permitted. If a cyclist chooses to continue behind the broom wagon,
 * they cease to be part of the convoy, and must then follow the usual
 * traffic rules and laws. (Wikipedia)
 */
function* genericPropertiesBroomWagonGen(outerAnimanionAPI, keyMoment/*, momentT*/) {
    for(const fieldName of REGISTERED_GENERIC_KEYMOMENT_FIELDS) {
        if(!keyMoment.has(fieldName))
            continue;
        const item = keyMoment.get(fieldName);
        if(item instanceof _AbstractSimpleOrEmptyModel && item.isEmpty)
            continue;
        yield [`generic/${fieldName}`, item.value];
    }
}



/**
 * FIXME: there should be a standard way to tell if a mixin, e.g.
 * typographyKeyMomentPureModelMixin is part of a struct, moving
 * these mixins closer to the concept of a trait.
 * e.g. like struct.implements(typographyKeyMomentModelMixin)
 * so, a marker should be put into struct that makes it quick and easy
 * to check.
 */
function _keyMomentsImplementsTypography(keyMoments) {
    const Model = keyMoments.constructor.Model; // Maybe: if keyMoments.constructor.prototype instanceof _AbstractListModel
    return (
           Model.fields.has('fontSize')
        && Model.fields.get('fontSize') === FontSizeModel
        && Model.fields.has('axesLocations')
        && Model.fields.get('axesLocations') === AxesLocationsModel
    );
}

function initAnimanion(keyMoments, isLoop) {
    const propertyGenerators = [numericPropertiesGen, colorsGen];
    if(_keyMomentsImplementsTypography(keyMoments))
        // add typography
        propertyGenerators.push(fontSizeGen, axisLocationsGen);
    propertyGenerators.push(genericPropertiesBroomWagonGen);
    return new LocalScopeAnimanion(propertyGenerators, keyMoments, isLoop);
}

const _NOTDEF = Symbol('_NOTDEF'); // not exported on purpose
function _getRegisteredPropertySetup(propertyName, defaultVal=_NOTDEF){
    for(const [prefix, PROPERTIES_KEY] of [
                    ['numericProperties/', 'NUMERIC']
                  , ['colors/', 'COLOR']
                  , ['generic/', 'GENERIC']
            ]){
        if(propertyName.startsWith(prefix)) {
            const name = propertyName.slice(prefix.length);
            if(REGISTERED_PROPERTIES[PROPERTIES_KEY].has(name))
                return REGISTERED_PROPERTIES[PROPERTIES_KEY].get(name);
        }
    }
    if(defaultVal !== _NOTDEF)
        return defaultVal;
    throw new Error(`KEY ERROR don't know how to get registered property setup "${propertyName}".`);
}

function isInheritingPropertyFn(property) {
    if(property.startsWith('colors/'))
        property = property.split('/', 2).join('/');
    const setup = _getRegisteredPropertySetup(property, {inherit: true});
    return setup.inherit === false ? false : true;
}

class ActorRendererContainer extends _BaseContainerComponent {
    constructor(parentAPI, zones, ActorRenderer, actorDependencyMappings=[]) {
        const widgets = [
            [
                { zone: 'layer' }
              , [
                    [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                  , ...actorDependencyMappings
                ]
              ,  ActorRenderer
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}

/**
 * dynamically provision widgets for actors in rootPath + "activeActors"
 *
 * StageAndActorsModel has ActorReferencesModel activeActors
 * LayerActorModel has ActorReferencesModel activeActors
 */
class ActiveActorsRenderingController extends _BaseDynamicCollectionContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
    // FIXME: a lot of this is copied from KeyMomentsController
    // so both should be taken to form a unified _BaseDynamicCollectionContainerComponent ...
    // This, however, is only READING for rendering, not writing so far
    // hence no need for a _redirectedGetEntry so far.
    constructor(parentAPI, zones, itemEntryPath, layerBaseClass){
        super(parentAPI, zones, itemEntryPath);
        this._layerBaseClass = layerBaseClass;
    }

    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getActorWidgetSetup(rootPath) {
        const actor = this.getEntry(rootPath)
          , typeKey = actor.get('actorTypeKey').value
          , actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
          , typeClass = actorTypeModel.get('typeClass').value
          , widgetRootPath = rootPath.append('instance')
          ;
        if(typeClass === CircleActorModel) {
            return [
                {
                    rootPath: widgetRootPath
                }
              , []
              , ActorRendererContainer
              , this._zones
              , CircleActorRenderer
              , []
            ];
        }
        if(typeClass === RectangleActorModel) {
            return [
                {
                    rootPath: widgetRootPath
                }
              , []
              , ActorRendererContainer
              , this._zones
              , RectangleActorRenderer
              , []
            ];
        }
        if(typeClass === LineOfTextActorModel) {
            return [
                {
                    rootPath: widgetRootPath
                }
              , []
              , ActorRendererContainer
              , this._zones
              , LineOfTextActorRenderer
              , [
                    ['font', 'font']
                ]
            ];
        }
        if(typeClass === LayerActorModel) {
             return [
                {
                    rootPath: widgetRootPath
                }
              , []
              , LayerActorRenderer
              , this._zones
              , this._layerBaseClass
            ];
        }
        throw new Error(`NOT IMPLEMENTED _getActorWidgetSetup for typeClass: ${typeClass.name} label: "${typeLabel}" key: ${typeKey}`);
    }
    _createWrapper(rootPath) {
        const
            // how does this work?
            //,  childParentAPI = Object.assign(Object.create(this._childrenParentAPI), {
            //     // Ideally, the link, when trying to write to it,
            //     // e.g. in draft mode when reading from it and returning
            //     // the PotentialWriteProxy could use the linking information
            //     // to return a proxy for the correct entry in the source
            //     // but this may be complicated or really hard to accomplish
            //     // should be looked into though! In here, it's easier to
            //     // resolve the link, because the source is known and the
            //     // parent is known. Keeping track of a dependency's source
            //     // is thus maybe the main issue.
            //     //
            //     // FIXME: works so far, but requires the getEntry workaround.
            //     getEntry: this._redirectedGetEntry.bind(this)
            // })
            childParentAPI = this._childrenParentAPI
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getActorWidgetSetup(rootPath)
          ;
        return this._initWrapper(childParentAPI, settings, dependencyMappings, Constructor, ...args);
    }
}

class LayerActorRenderer extends _BaseContainerComponent {
    constructor(parentAPI, _zones, layerBaseClass) {
        // for the main stage container:
        //      position: relative
        //      overflow: hidden
        const layerElement = parentAPI.domTool.createElement('div')
            // override any "layer" if present
            // but this means we can't put our layer into the present layer
            // ...
          , zones = new Map([..._zones, ['layer', layerElement], ['parent-layer', _zones.get('layer')]])
          ;
        const widgets = [
            [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , [
                    [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                ]
              , LayerDOMNode
              , layerElement
              , [layerBaseClass, `${layerBaseClass}-sub`]
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActiveActorsRenderingController
              , zones
              , []
              , layerBaseClass
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}

class ActorsMeta extends _BaseDynamicCollectionContainerComponent {
    [HANDLE_CHANGED_AS_NEW] = true; // jshint ignore:line
    /**
     * return => [settings, dependencyMappings, Constructor, ...args];
     */
    _getActorWidgetSetup(rootPath) {
        const actor = this.getEntry(rootPath)
          , typeKey = actor.get('actorTypeKey').value
          , actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
          , typeClass = actorTypeModel.get('typeClass').value
          , widgetRootPath = rootPath.append('instance')
            // FIXME: very useful disambiguation, should be commonly available!
          , leafNodeTypes = new Set([CircleActorModel, RectangleActorModel, LineOfTextActorModel])
          , containerNodeTypes = new Set([LayerActorModel])
          , isLeafNode = typeClass=>leafNodeTypes.has(typeClass)
          , isContainerNode = typeClass=>containerNodeTypes.has(typeClass)
          ;
        if(isLeafNode(typeClass)) {
            return [
                {
                    rootPath: widgetRootPath
                  , 'animationProperties@': widgetRootPath.toString()
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                  , [`animationProperties@${widgetRootPath.append('..' ,'..', '..')}`, '@parentProperties']
                ]
              , AnimationLiveProperties
              , initAnimanion
              , isInheritingPropertyFn
            ];
        }
        else if(isContainerNode(typeClass)) {
            return [
                {
                    rootPath: widgetRootPath
                }
              , [
                    'keyMoments'
                  , 'isLoop'
                  , ['/activeState/t', 'globalT']
                    // parent is always three levels above from here
                    // as this is {index}/instance
                  , [`animationProperties@${widgetRootPath.append('..', '..', '..')}`, '@parentProperties']
                ]
              , ContainerMeta
              , this._zones
            ];
        }
        throw new Error(`NOT IMPLEMENTED _getActorWidgetSetup for typeClass: ${typeClass.name} label: "${typeLabel}" key: ${typeKey}`);
    }
    _createWrapper(rootPath) {
        const childParentAPI = this._childrenParentAPI
            // , args = [this._zones]
          , [settings, dependencyMappings, Constructor, ...args] = this._getActorWidgetSetup(rootPath)
          ;
        return this._initWrapper(childParentAPI, settings, dependencyMappings, Constructor, ...args);
    }
}

/**
 * It's smarter to build the AnimationLiveProperties (and possibly other "meta data")
 * structure independent from StageHTML, as we may have different rendereing
 * targets, but the property propagation can and should be shared across.
 * Also, having the animationProperties@ registry relative to the top controller
 * of this module -- i.e. global -- makes this simple.
 */
class ContainerMeta extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        const widgets = [
            [
                {
                    'animationProperties@': parentAPI.rootPath.toString()
                }
              , [  ...parentAPI.wrapper.getDependencyMapping(parentAPI.wrapper.constructor.DEPENDECIES_ALL) ]
              , AnimationLiveProperties
              , initAnimanion // This usage instance won't receive parentProperties.
              , isInheritingPropertyFn
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActorsMeta
              , zones
              , []
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}

/**
 * Orchestrate the own layer properties and the containg actor widgets.
 */
class StageHTML extends _BaseContainerComponent {
    constructor(parentAPI, _zones, baseCLass='Stage_HTML') {
        // for the main stage container:
        //      position: relative
        //      overflow: hidden

        const containerElement = parentAPI.domTool.createElement('div')
          , topLayerElement = parentAPI.domTool.createElement('div')
          , layerBaseClass = `${baseCLass}-layer`
            // override any "layer" if present
            // but this means we can't put our layer into the present layer
            // ...
          , zones = new Map([..._zones, ['layer', topLayerElement], ['parent-layer', parentAPI.wrapper.host]])
          ;
        // calling super early without widgets is only required when
        // the widgets definition requires the `this` keyword.
        topLayerElement.classList.add(layerBaseClass);
        topLayerElement.classList.add(`${layerBaseClass}-top`);
        containerElement.append(topLayerElement);
        const widgets = [
            [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'parent-layer'}
              , [
                    'width', 'height'
                  , ['t', 'globalT']
                  , [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                ]
              , StageDOMNode
              , containerElement, topLayerElement
              , [baseCLass, `${baseCLass}-wrapper`]
            ]
            // These will probably have to be be selection dependant!
          , [
                {zone: 'after-layout'}
              , [
                    ['t', 't']
                  , ['duration', 'duration'] // in seconds
                  , ['isLoop', 'isLoop'] // never stop playback
                  , ['perpetual', 'perpetual']
                  , ['playing', 'playing']
                  , ['keyMoments', 'keyMoments']
                  , [`animationProperties@${parentAPI.rootPath.toString()}`, '@animationProperties']
                ]
              , AnimationInfo
            ]
          , [
                {}
              , [
                    ['activeActors', 'collection']
                ]
              , ActiveActorsRenderingController
              , zones
              , []
              , layerBaseClass
            ]
        ];
        super(parentAPI, zones, widgets);
    }
}

export const DATA_TRANSFER_TYPES = Object.freeze({
    ACTOR_PATH: 'application/x.typeroof-actor-path'
  , ACTOR_CREATE: 'application/x.typeroof-actor-create'
});

class SelectAndDrag extends _BaseComponent {
        // jshint ignore:start
    static TEMPLATE = `<div class="select_and_drag">
    <label><strong class="select_and_drag-effect_label"></strong>
    <select><select><span class="select_and_drag-drag_handle drag_handle">✥</span>
    <span class="select_and_drag-description_label"></span>
    </label>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, effectLabel, descriptionLabel, setDragDataFN) {
        super(parentAPI);
        this._setDragDataFN = setDragDataFN;
        [this.element, this._selectElement] = this.initTemplate(effectLabel, descriptionLabel);
    }
    initTemplate(effectLabel, descriptionLabel) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , selectElement = frag.querySelector('select')
          , effectLabelContainer = frag.querySelector('.select_and_drag-effect_label')
          , descriptionLabelContainer = frag.querySelector('.select_and_drag-description_label')
          , dragHandleElement = frag.querySelector('.select_and_drag-drag_handle')
          ;
        effectLabelContainer.textContent = effectLabel;
        descriptionLabelContainer.textContent = descriptionLabel;
        this._insertElement(element);

        dragHandleElement.setAttribute('draggable', 'true');
        dragHandleElement.addEventListener('dragstart', this._dragstartHandler.bind(this));
        dragHandleElement.addEventListener('dragend', this._dragendHandler.bind(this));

        return [element, selectElement];
    }

    _dragstartHandler(event) {
        const actorType = this._selectElement.value;
        // E.g. like this:
        // function setDragDataFN(dataTransfer, selectedValue) {
        //     dataTransfer.setData('text/plain', `[TypeRoof actor create: ${selectedValue}]`);
        //     dataTransfer.setData('application/x.typeroof-actor-create', `${selectedValue}`);
        // }
        this._setDragDataFN(event.dataTransfer,  actorType);

        event.currentTarget.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!

        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setDragImage(this._selectElement , 0 , 0);
    }

    _dragendHandler(event) {
        event.currentTarget.classList.remove('dragging');
    }

    update(changedMap) {
        if(changedMap.has('sourceTypes')) {
            const selected = this._selectElement.value
              , options = changedMap.get('sourceTypes')
              , optionElements  = []
              ;
            this._domTool.clear(this._selectElement);
            for(const [key, entry] of options) {
                optionElements.push(
                    this._domTool.createElement('option', {value: key}, entry.get('label').value));
            }
            this._selectElement.append(...optionElements);
            if(options.has(selected))
                this._selectElement.value = selected;
        }
    }
}

function _createDynamicType(DynamicModel, typeKeyName, typeKeyValue, dependencies) {
    const availableTypesKey = DynamicModel.foreignKeys.get(typeKeyName).targetName // e.g. 'availableActorTypes'
      , availableTypes = dependencies[availableTypesKey]
      , getTypeFor=key=>availableTypes.get(key).value.get('typeClass').value
      , getDraftFor=(name, deps)=>getTypeFor(name).createPrimalDraft(deps)
      , draft = getDraftFor(typeKeyValue, dependencies)
      , resultDraft = DynamicModel.createPrimalDraft(dependencies)
      ;
    resultDraft.get(typeKeyName).value = typeKeyValue;
    resultDraft.get('instance').wrapped = draft;
    return resultDraft;
}

function createColor(typeKey, dependencies) {
    return _createDynamicType(ColorModel, 'colorTypeKey', typeKey, dependencies);
}

function createActor(typeKey, dependencies) {
    return _createDynamicType(ActorModel, 'actorTypeKey', typeKey, dependencies);
}

class StageManager extends _BaseComponent {
    // jshint ignore:start
    static TEMPLATE = `<div class="stage-manager">
    <h3>Stage Manager</h3>
    <div class="stage-manager_actors">(initial)</div>
</div>`;
    // jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        this._itemElements = new Map(/* Path: element*/);
        this._activePaths = new Set();
        this._removeDragIndicatorTimeoutId = null;
        [this.element, this._actorsElement] = this.initTemplate();
    }

    _onClickHandler(path) {
        this._changeState(()=>{
            // this is a toggle
            const editingActor = this.getEntry('editingActor');
            if(!editingActor.isEmpty && editingActor.value.equals(path))
                editingActor.clear();
            else
                editingActor.value = path;
        });
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , actors = frag.querySelector('.stage-manager_actors')
          ;
        this._insertElement(element);
        actors.addEventListener('dragleave', this._dragleaveHandler.bind(this));
        return [element, actors];
    }

    _dragstartHandler({path}, event) {
        event.dataTransfer.setData('text/plain', `[TypeRoof actor path: ${path}]`);
        event.dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_PATH, `${path}`);

        event.currentTarget.classList.add('dragging');
        // MDN: During the drag operation, drag effects may be modified to
        // indicate that certain effects are allowed at certain locations.
        // 'copy', 'move', 'link'
        // changing the dropEffect is interesting depending on the drag target
        // and maybe also when a modifier get's pressed/released!
        //
        // Allow to copy, link or to move the element.
        // The UI could be changed to clearly indicate the kind of action
        // it creates, but often it also depends on the target.
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setDragImage(event.currentTarget.parentElement, 0 , 0);
    }

    _dragendHandler({path}, event) {
        event.currentTarget.classList.remove('dragging');
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        const applicableTypes = [DATA_TRANSFER_TYPES.ACTOR_PATH, DATA_TRANSFER_TYPES.ACTOR_CREATE];
        for(const type of applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    _dragoverHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        // Don't use event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // in Chrome it's not available in dragover.
        // MDN: The HTML Drag and Drop Specification dictates a drag data
        //      store mode. This may result in unexpected behavior, being
        //      DataTransfer.getData() not returning an expected value,
        //      because not all browsers enforce this restriction.
        //
        //      During the dragstart and drop events, it is safe to access
        //      the data. For all other events, the data should be considered
        //      unavailable. Despite this, the items and their formats can
        //      still be enumerated.
        // const data = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH);
        // This also means, we can't look at the data here to decide if
        // we would accept the drag based on payload!



        // If the effect is not allowed by the drag source, e.g.
        // the UI implies this will make a copy, but this will in
        // fact move the item, the drop event wont get called.
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _dragenterHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;
        event.dataTransfer.dropEffect = type === DATA_TRANSFER_TYPES.ACTOR_PATH
                ? 'move'
                : 'copy' // DATA_TRANSFER_TYPES.ACTOR_CREATE
                ;
        // could create insertion marker or otherwise signal insertion readiness
        // also possible in _dragoverHandler in general
        const insertPosition = this._getDropTargetInsertPosition(item, event);
        this._setDropTargetIndicator(event.currentTarget, insertPosition);
    }

    _getDropTargetInsertPosition(item, event) {
        if(item.isEmptyLayerContainer)
            // only empty layers get the activeActors
            return 'insert';
        const {height, top} = event.currentTarget.getBoundingClientRect()
          , {clientY} = event
          , elementY = clientY - top
          , relativeY = elementY/height
          , testPosition = item.isEmptyLayerItem
                // Move this line below the empty layer container <ol> active
                // zone, such that we don't get undecided flickering between
                // the empty container zone and the item above: the <li> that
                // contains the empty children <ol>.
                ? 0.8
                : 0.5
          ;
        return relativeY < testPosition ? 'before' : 'after';
    }

    _setDropTargetIndicator(element, insertPosition=null) {
        if(this._removeDragIndicatorTimeoutId !== null){
            const {clearTimeout} = this._domTool.window;
            clearTimeout(this._removeDragIndicatorTimeoutId);
            this._removeDragIndicatorTimeoutId = null;
        }
        const classPrefix = 'drop_target_indicator-'
          ,  markedClass = `${classPrefix}marked`
          ;
        for(const elem of this._actorsElement.querySelectorAll(`.${markedClass}`)) {
            // element.classList is live and the iterator gets confused due
            // to the remove(name), hence this acts on an array copy.
            for(const name of [...elem.classList]) {
                if(name.startsWith(classPrefix)) {
                    elem.classList.remove(name);
                }
            }
        }
        if(insertPosition === null)
            return;

        if(!['before', 'after', 'insert'].includes(insertPosition))
            throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);
            // return;

        const [elem, posClassSuffix] = insertPosition === 'before' && element.previousSibling
                ? [element.previousSibling, 'after']
                : [element, insertPosition]
                ;
        elem.classList.add(`${classPrefix}${posClassSuffix}`);
        elem.classList.add(markedClass);
    }

    /**
     * Only when leaving the this._actorsElement: remove the target indicator.
     * This uses setTimeout because otherwise the display can start to show
     * flickering indicators, as dragleave and dragenter are not executed
     * directly consecutivly in all (Chrome showed this issue).
     */
    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        const {setTimeout} = this._domTool.window;
        this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(item, event) {
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        this._setDropTargetIndicator(event.currentTarget);

        const {path} = item
          , rootPath = Path.fromString(this.parentAPI.getExternalName('activeActors'))
          , targetPath = rootPath.append(...path)
          , insertPosition = this._getDropTargetInsertPosition(item, event)
          ;

        if(type === DATA_TRANSFER_TYPES.ACTOR_PATH) {
            const relativeSourcePath = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_PATH)
              , sourcePath = rootPath.appendString(relativeSourcePath)
              ;
            return this._move(sourcePath, targetPath, insertPosition);
        }
        else if(type === DATA_TRANSFER_TYPES.ACTOR_CREATE) {
            const typeKey = event.dataTransfer.getData(DATA_TRANSFER_TYPES.ACTOR_CREATE);
            return this._create(typeKey, targetPath, insertPosition);
        }
    }

    _create(typeKey, targetPath, insertPosition) {
        // console.log(`${this}._create typeKey: ${typeKey} targetPath ${targetPath} insertPosition: ${insertPosition}`);
        return this._changeState(()=>{
            const activeActors = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // is an 'ActorsModel' ('activeActors')
                // Ensure we take the dependencies for the create from the
                // correct element, even though, at the moment, the dependencies
                // are all identical, it may change at some point.
              , newActor = createActor(typeKey, activeActors.dependencies)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // targetParent === sourceParent and the targetKey could
                // change is circumvented.
                activeActors.push(newActor);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              ;
            if(insertPosition === 'after')
                activeActors.splice(targetIndex + 1, 0, newActor);
            else if(insertPosition === 'before')
                activeActors.splice(targetIndex, 0, newActor);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _move(sourcePath, targetPath, insertPosition) {
        // console.log(`${this}._move sourcePath: ${sourcePath} targetPath ${targetPath}`);
        const canMove = !sourcePath.isRootOf(targetPath);
        if(!canMove) {
            console.warn(`${this}._move can't move source into target as source path "${sourcePath}" is root of target path "${targetPath}".`);
            return;
        }

        return this._changeState(()=>{
            // FIXME: this can be done more elegantly. I'm also not
            // sure if it is without errors like this, so a review
            // and rewrite is in order!
            const activeActors = insertPosition === 'insert'
                    ? this.getEntry(targetPath)
                    : this.getEntry(targetPath.parent) // is an 'ActorsModel' ('activeActors')
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              , source = sourceParent.get(sourceKey)
              ;
            if(insertPosition === 'insert') {
                // "insert" case is intended to insert into empty layers only.
                // by inserting first, before deleting, the case where
                // activeActors === sourceParent and the targetKey could
                // change is circumvented.
                activeActors.push(source);
                sourceParent.delete(sourceKey);
                return;
            }
            const targetKey = targetPath.parts.at(-1)
              , targetIndex = parseInt(targetKey, 10)
              , sourceIndex = parseInt(sourceKey, 10)
              ;

            if(activeActors === sourceParent) {
                if(sourceIndex === targetIndex)
                    return;// nothing to do

                let insertIndex;
                if(insertPosition === 'after')
                    insertIndex = targetIndex + 1;
                else if(insertPosition === 'before')
                    insertIndex = targetIndex;
                else
                    throw new Error(`NOT IMPLEMENTED ${this} insert position "${insertPosition}".`);

                if(sourceIndex < targetIndex)
                    // by the time we insert, sourceIndex is already removed from before
                    insertIndex = insertIndex - 1;

                sourceParent.delete(sourceKey);
                activeActors.splice(insertIndex, 0, source);
                return;
            }
            sourceParent.delete(sourceKey);
            if(insertPosition === 'after')
                activeActors.splice(targetIndex + 1, 0, source);
            else if(insertPosition === 'before')
                activeActors.splice(targetIndex, 0, source);
            else
                throw new Error(`NOT IMPLEMENTED insert position "${insertPosition}".`);
        });
    }

    _renderLayer(path, activeActors, state=null) {
        const container = this._domTool.createElement('ol');
        if(activeActors.size === 0) {
            // empty container
            const item = {path, isEmptyLayerContainer: true, isEmptyLayerItem: false};
            container.addEventListener('dragenter', this._dragenterHandler.bind(this, item));
            container.addEventListener('dragover', this._dragoverHandler.bind(this, item));
            container.addEventListener('drop', this._dropHandler.bind(this, item));
        } // else: see for ...
        for(const [key, actor] of activeActors) {
            const itemElement = this._domTool.createElement('li')
              , itemPath = path.append(key)
              , dragHandleElement = this._domTool.createElement('span', {'class': 'drag_handle'}, '✥')
              , isLayerItem = getEntry(actor , Path.fromParts('actorTypeModel', 'typeClass')).value === LayerActorModel
              , isEmptyLayerItem = isLayerItem
                    ? getEntry(actor, Path.fromParts('instance', 'activeActors')).size === 0
                    : false
              , item = {path: itemPath, isEmptyLayerContainer: false, isEmptyLayerItem}
              ;

            if(state) {
                itemElement.classList.add((state.counter % 2) ? 'even-row' : 'odd-row');
                itemElement.style.setProperty('--structural-depth', `${state.depth}`);
                state.counter += 1;
            }

            dragHandleElement.setAttribute('draggable', 'true');
            dragHandleElement.addEventListener('dragstart', this._dragstartHandler.bind(this, item));
            dragHandleElement.addEventListener('dragend', this._dragendHandler.bind(this, item));

            itemElement.addEventListener('dragenter', this._dragenterHandler.bind(this, item));
            itemElement.addEventListener('dragover', this._dragoverHandler.bind(this, item));
            itemElement.addEventListener('drop', this._dropHandler.bind(this, item));

            itemElement.append(dragHandleElement, ...this._renderActor(itemPath, actor, state));
            container.append(itemElement);
            this._itemElements.set(itemPath.toString(), itemElement);
        }
        return [container];
    }

    _renderActor(path, actor, state=null) {
        const actorTypeModel = actor.get('actorTypeModel')
          , typeLabel = actorTypeModel.get('label').value
          , typeClass = actorTypeModel.get('typeClass').value
          , fragment = this._domTool.createFragmentFromHTML(`<button><span></span> <em></em></button>`)
          , result = [...fragment.childNodes]
          , button = fragment.querySelector('button')
          ;
        button.addEventListener('click', this._onClickHandler.bind(this, path));
        fragment.querySelector('span').textContent = typeLabel;
        button.setAttribute('title', `local path: ${path}`);
        if(typeClass === LayerActorModel) {
            const activeActorsPath = Path.fromParts('instance', 'activeActors')
              , activeActors = getEntry(actor, activeActorsPath)
              , childrenPath = path.append(...activeActorsPath)
              ;
            if(state) state.depth += 1;
            result.push(...this._renderLayer(childrenPath, activeActors, state));
            if(state) state.depth -= 1;
        }
        return result;
    }

    _markActiveItems(...pathsToActivate) {
        for(const activePathStr of this._activePaths) {
            this._itemElements.get(activePathStr).classList.remove('active');
        }
        this._activePaths.clear();
        for(const activePath of pathsToActivate) {
            const activePathStr = activePath.toString();
            this._activePaths.add(activePathStr);
            this._itemElements.get(activePathStr).classList.add('active');
        }
    }

    update(changedMap) {
        const editingActor = changedMap.has('editingActor')
            ? changedMap.get('editingActor')
            : this.getEntry('editingActor')
            ;
        if(changedMap.has('activeActors')) {
            const activeActors = changedMap.get('activeActors')
              , basePath = Path.fromParts('./')
              ;
            this._domTool.clear(this._actorsElement);
            this._actorsElement.append(...this._renderLayer(basePath, activeActors, {counter: 0, depth: 0}));
            if(!editingActor.isEmpty)
                this._markActiveItems(editingActor.value);
        }
        else if(changedMap.has('editingActor')) {
            this._markActiveItems(...(editingActor.isEmpty ? [] : [editingActor.value]));
        }
    }
}

class WasteBasketDropTarget extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_NO_UPDATE // jshint ignore:line
    // jshint ignore:start
        static TEMPLATE = `<div class="waste_basket_drop_target">
    <strong class="waste_basket_drop_target-effect_label"></strong>
    <span class="waste_basket_drop_target-main_drop_zone"></span>
    <span class="waste_basket_drop_target-description_label"></span>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, effectLabel, descriptionLabel, applicableTypes) {
        super(parentAPI);
        this._applicableTypes = applicableTypes;
        [this.element] = this.initTemplate(effectLabel, descriptionLabel);
    }
    initTemplate(effectLabel, descriptionLabel) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , effectLabelContainer = element.querySelector('.waste_basket_drop_target-effect_label')
          , descriptionLabelContainer = element.querySelector('.waste_basket_drop_target-description_label')
          ;
        effectLabelContainer.textContent = effectLabel;
        descriptionLabelContainer.textContent = descriptionLabel;
        this._insertElement(element);

        element.addEventListener('dragenter', this._dragenterHandler.bind(this));
        element.addEventListener('dragover', this._dragoverHandler.bind(this));
        element.addEventListener('dragleave', this._dragleaveHandler.bind(this));
        element.addEventListener('drop', this._dropHandler.bind(this));
        return [element];
    }

    _takeDragEventOrLeaveIt(event) {
        // order is relevant here
        for(const type of this._applicableTypes) {
            if(event.dataTransfer.types.includes(type)) {
                // Don't trigger other pointer events or such.
                event.preventDefault();
                // This event is consumed, don't trigger another handler for this event
                event.stopPropagation();
                return [true, type];
            }
        }
        return [false, null];
    }

    _dragenterHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        this.element.classList.add(`waste_basket_drop_target-receptive`);
    }

    _dragoverHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        this.element.classList.add(`waste_basket_drop_target-receptive`);
    }

    _dragleaveHandler(event) {
        if(!this._takeDragEventOrLeaveIt(event)[0])
            return;
        // Remove indicator if not cancelled (by _setDropTargetIndicator before)
        this.element.classList.remove(`waste_basket_drop_target-receptive`);
        // const {setTimeout} = this._domTool.window;
        // this._removeDragIndicatorTimeoutId = setTimeout(this._setDropTargetIndicator.bind(this, event.currentTarget), 100);
    }

    _dropHandler(event) {
        this.element.classList.remove(`waste_basket_drop_target-receptive`);
        const [take, type] = this._takeDragEventOrLeaveIt(event);
        if(!take)
            return;

        // just a safeguard, but not helping for reusability!
        if(type !== DATA_TRANSFER_TYPES.ACTOR_PATH)
            throw new Error(`NOT IMPLEMENTED ${this}._dropHandler don't know how to handle type "${type}".`);
        return this._changeState(()=>{
            const rootPath = Path.fromString(this.parentAPI.getExternalName('rootCollection'))
              , relativeSourcePath = event.dataTransfer.getData(type)
              , sourcePath = rootPath.appendString(relativeSourcePath)
              , sourceParent = this.getEntry(sourcePath.parent)
              , sourceKey = sourcePath.parts.at(-1)
              ;

            // FIXME: This has too much destructive power in a way, E.g. we could
            // make sure that sourceParent is an ActorsModel, as the paths
            // could be spoofed in some way e.g. using  ./../../../../ in
            // the path.
            // rootPath.isRootOf is a good check, but it could still be
            // more specific.
            if(!rootPath.isRootOf(sourcePath))
                throw new Error(`PATH ERROR source path "${sourcePath}" (${relativeSourcePath}) is not contained in root path "${rootPath}"`);

            sourceParent.delete(sourceKey);
        });
    }
}


class CommonActorProperties extends _BaseComponent {
    // jshint ignore:start
     static TEMPLATE = `<div class="common_actor_properties">
    <h3><span class="common_actor_properties-actor-type">[Undefined Actor Type]</span> Actor Properties</h3>
    <h4>Inherited Properties</h4>
    <ol class="common_actor_properties-list common_actor_properties-list-inherited"></ol>
    <h4>Own Properties</h4>
    <ol class="common_actor_properties-list common_actor_properties-list-own"></ol>
</div>`;
    // jshint ignore:end
    constructor(parentAPI, typeKey) {
        super(parentAPI);
        this._typeKey = typeKey;
        this._baseClass = 'common_actor_properties';
        this._isTypographic = null;
        [this.element, this.inheritedPropertiesContainer, this.ownPropertiesContainer] = this.initTemplate();
        this.ownProperties = new Set();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , inheritedPropertiesContainer = element.querySelector(`.${this._baseClass}-list-inherited`)
          , ownPropertiesContainer = element.querySelector(`.${this._baseClass}-list-own`)
          ;
        element.querySelector(`.${this._baseClass}-actor-type`).textContent = this._typeKey;
        this._insertElement(element);
        return [element, inheritedPropertiesContainer, ownPropertiesContainer];
    }

    _createTextValueElement(key, value) {
        const valueText = typeof value === 'boolean'
                            ? (value && 'True' || 'False')
                              // undefined.toString raises ...
                            : value !== undefined ? value.toString() : 'undefined'
          , valueContainer = this._domTool.createElement(
                              'span'
                            , {'class': `${this._baseClass}-value-text`}
                            , valueText)
          ;
        return valueContainer;
    }

    _createColorValueElement(key, value) {
        const valueContainer = this._domTool.createElement('span')
          , colorCss = culoriFormatCss(value)
          , colorPatch = this._domTool.createElement(
                        'span'
                      , {'class': [
                                `${this._baseClass}-value-color_patch`
                                // Has an indicator for transparency
                                // and implements :hover to enlarge the
                                // sample.
                              , 'ui_color_patch'
                              , 'ui_color_patch-has_color'
                              ].join(' ')
                        })
          , textContainer = this._createTextValueElement(key, colorCss)
          ;
        colorPatch.style.setProperty(`--color`, colorCss);
        valueContainer.append(colorPatch, textContainer);
        return valueContainer;
    }

    // NOTE: copied from AnimationInfo
    _createBasicDisplayElement(key, value, label=null) {
        const [type, valueContainer] = key.startsWith('colors/') && typeof value === 'object'
                    ? ['color', this._createColorValueElement(key, value)]
                    : ['text', this._createTextValueElement(key, value)]
          , labelContainer = this._domTool.createElement(
                    'span'
                    , {'class': `${this._baseClass}-label`}
                    , label !== null ? label : key
            )
          , container = this._domTool.createElement(
                    'li'
                    , {'class': [
                                `${this._baseClass}-item`
                              , `${this._baseClass}-item-type_${type}`
                              ].join(' ')}
                    , [labelContainer, ' ' , valueContainer]
            )
          ;
        valueContainer.classList.add(`${this._baseClass}-value`);
        return [container, valueContainer];
    }

    update(changedMap) {
        if(changedMap.has('keyMoments')) {
            // update own properties
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , localPropertyNames = animationProperties.animanion.localPropertyNames
              ;
            this.ownProperties.clear();
            for(const localPropertyName of localPropertyNames)
                this.ownProperties.add(localPropertyName);
        }

        // TODO: AnimationInfo has a more holistic handling than this.
        // TODO globalT/animationProperties dependencies need to be straightened
        if(changedMap.has('@animationProperties') || changedMap.has('globalT')) {
            const animationProperties = changedMap.has('@animationProperties')
                        ? changedMap.get('@animationProperties')
                        : this.getEntry('@animationProperties')
              , globalT = (changedMap.has('globalT')
                        ? changedMap.get('globalT')
                        : this.getEntry('globalT')).value
              // , propertyValuesMap = animationProperties.propertyValuesMap
              , propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(globalT)
              , ownPropertiesChildren = []
              , inheritedPropertiesChildren = []
              ;
            for(const [property, value] of propertyValuesMap) {
                const target = this.ownProperties.has(property)
                                        ? ownPropertiesChildren
                                        : inheritedPropertiesChildren
                                        ;

                const [color, consumed] = _getColorFromPropertyValuesMap(property, propertyValuesMap);
                if(color !== null) {
                    const [elem] = this._createBasicDisplayElement(property, color);
                    target.push(elem);
                }
                if(consumed)
                    continue;
                if(property.startsWith('color/'))
                // else: treat it like a full color will be deprecated ...
                    console.warn(`DEPRECATED: rendering color ${property}:`, value);

                const [elem] = this._createBasicDisplayElement(property, value);
                target.push(elem);
            }
            this.ownPropertiesContainer.replaceChildren(...ownPropertiesChildren);
            this.inheritedPropertiesContainer.replaceChildren(...inheritedPropertiesChildren);
        }
    }
}

function _getColorFromPropertyValuesMap(property, propertyValuesMap, defaultVal=_NOTDEF) {
    if(!property.startsWith('colors/'))
        return [null, false];

    if(property.split('/').length === 2)
        // allow for colors/backgroundColor to work
        property = `${property}/mode`;
    if(!propertyValuesMap.has(property)) {
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error('KEY ERROR property name "${property}" not found in propertyValuesMap.');
    }

    const value = propertyValuesMap.get(property);
    if(!property.endsWith('/mode')) {
        if (typeof value === 'number')
            // This will be consumed, it should be a component of mode and
            // can be skipped by the calling function.
            return [null, true];
        // This is the deprecated case of a color object in the value
        // should become an error at some point.
        console.warn(`DEPRECATED: color property ${property}:`, value);
        return [null, false];
    }
    const color = {mode: value}
      , colorName = property.split('/', 2).at(-1)
      ;
    for(const component of culoriGetMode(color.mode).channels) {
        const fullComponentName = `colors/${colorName}/${component}`;
        if(!propertyValuesMap.has(fullComponentName))
            continue;
        color[component] = propertyValuesMap.get(fullComponentName);
    }
    return [color, true];
}



// Used to be "KeyMomentsTimeline" in example-key-moments, but the name
// was not fitting anyways and this also lost the buttons to select the
// active keyMoments.
class KeyMomentsControls extends _BaseComponent {
    [UPDATE_STRATEGY] = UPDATE_STRATEGY_COMPARE; // jshint ignore:line
    //jshint ignore:start
    static TEMPLATE = `<div class="key_moments_controls">
        <h3>Key-Moments Controls</h3>
        <div>
            <button class="key_moments_controls-add_moment" title="Add Moment">+ add</button><!--
            --><button class="key_moments_controls-remove_moment" title="Remove Active Moment">- remove</button><!--
            --><button class="key_moments_controls-insert_moment" title="Insert Moment at t">⎀ insert</button>
        </div>
        <div>
            <button class="key_moments_controls-select_previous" title="Select Previous">⇤ select previous</button><!--
            --><button class="key_moments_controls-select_next" title="Select Next">select next ⇥</button>
        </div>
</div>`;
    static KEY_MOMENT_BUTTON_TEMPLATE=`<li>
    <button class="key_moments_controls-button" title="Select"></button>
</li>`;
    //jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        [this.element, this.addButton, this.removeButton
            , this.previousButton, this.nextButton] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , addButton = element.querySelector('.key_moments_controls-add_moment')
          , insertButton = element.querySelector('.key_moments_controls-insert_moment')
          , removeButton = element.querySelector('.key_moments_controls-remove_moment')
          , previousButton = element.querySelector('.key_moments_controls-select_previous')
          , nextButton = element.querySelector('.key_moments_controls-select_next')
          ;

        insertButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{

            const keyMoments = this.getEntry('keyMoments')
              // , t = this.getEntry(this.parentAPI.rootPath.append('t')).value
              // , liveProperties = this.parentAPI.getWidgetById('AnimationLiveProperties')
              , liveProperties = this.getEntry('@animationProperties')
              , t = liveProperties.t
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newMoment = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft()
              , [insertIndex, newMomentDuration, afterMoment
                    , newAfterMomentDuration
                ] = this._getInsertParameters(keyMoments, liveProperties, t)
                // Starting with "before index" here, meaning: "afterIndex - 1".
              , label = createLabelForKeyMoment(keyMoments, Math.max(0, parseFloat(insertIndex, 10) - 1))
                // Setting the properties for t and not setting the properties,
                // leaving them undefined, must have -- in this insert-situation
                // -- the same effect on the animation. These are just two different
                // approaches and the better approach should be determined by
                // considering usability. But, considering that a moment is
                // inserted, let's for now assume that capturing the "active"
                // properties is a feature, otherwise they could be hand-captured
                // by using the "set explicitly" button of each axis.
                // NOTE: In the future, it will be interestig e.g. to split
                // easing definitions in half!
              , newMomentProperties = liveProperties.getPropertyValuesMapForLocalT(t)
              ;
            const models = {};
            for(const [path_, value] of newMomentProperties) {
                if(path_.startsWith('numericProperties/')) {
                    if(!Object.hasOwn(models ,'numericProperties'))
                        models.numericProperties = getEntry(newMoment, 'numericProperties');
                    const propertyName = Path.fromString(path_).parts.at(-1);
                    models.numericProperties.setSimpleValue(propertyName, value);
                }
                else if(path_.startsWith('colors/')) {
                    // This would be working code, inserting the current culors
                    // initialized into the newMoment, without changing
                    // the appearance of the animation. However, it's probably
                    // better to have a new KeyMoment as empty as possible.
                    // Instead, a color can be inserted by initializing the
                    // desired model.

                    // const propertyName = Path.fromString(path_).parts.at(1)
                    //   , [colorObject, ] = _getColorFromPropertyValuesMap(path_, newMomentProperties)
                    //   , color = colorObject !== null ? culoriToColor(colorObject, newMoment.dependencies) : null
                    //   ;
                    // if(color !== null)
                    //     newMoment.set(propertyName, color);
                    continue;
                }

                else if(!_keyMomentsImplementsTypography(keyMoments))
                    // FIXME: This is not a well extensible way of coding this.
                    continue;
                else if(path_.startsWith('axesLocations/')) {
                    // only if available in these keyMoments (e.g. in TypographicKeyMomnets)
                    // CAUTION: opsz/autoOPSZ requires special treatment!
                    if(!Object.hasOwn(models ,'axesLocations'))
                        models.axesLocations = getEntry(newMoment, 'axesLocations');
                    const axisTag = Path.fromString(path_).parts.at(-1);
                    models.axesLocations.setSimpleValue(axisTag, value);
                }
                else if(path_ === 'fontSize')
                    // Only fontSize so far.
                    newMoment.get(path_).value = value;
                else
                    console.warn(`NOT IMPLEMENTED property "${path_}" in ${this} insertButton.`);
            }
            if(newMomentDuration !== null)
                newMoment.get('duration').value = newMomentDuration;
            newMoment.get('label').value = label;
            if(afterMoment !== null && newAfterMomentDuration !== null)
                afterMoment.get('duration').value = newAfterMomentDuration;
            keyMoments.splice(insertIndex, 0, newMoment);
        }));

        // The add button, its functionality, is not totally wrong, so
        // I keep it here for now and add alongside the "insert" button.
        // TODO: However, as it is right now, I prefer to add an empty/initial
        // keyMoment, rather than a copy of the current Moment.
        addButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = Array.from(keyMoments)
                    .filter(([key, keyMoment])=>keyMoment.get('isActive').value)
                // last selected moment
              , activeKey = activeKeyMoments.size
                    // uses the logically/absolute last by value
                    ? activeKeyMoments.at(-1)[0]
                    : null
              ;

            const index =  activeKey !== null
                    // Insert after active entry.
                    ? parseInt(activeKey, 10) + 1
                    // just insert at end
                    : keyMoments.size
                // FIXME: duplication, seen in model coherenceFunction "prepare"!
              , newEntry = keyMoments.constructor.Model.createPrimalDraft(keyMoments.dependencies)
                // This would create a copy of the active entry.
                // Not sure if unwrapPotentialWriteProxy is required, but it doesn't hurt.
                // Decided against the copy:
                // newEntry = unwrapPotentialWriteProxy(keyMoments.get(activeKey))
              ;

            // insert
            newEntry.get('isActive').value = true;
            newEntry.get('label').value = createLabelForKeyMoment(keyMoments, index);
            keyMoments.splice(index, 0, newEntry);
        }));

        removeButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const keyMoments = this.getEntry('keyMoments')
              , activeKeys = Array.from(keyMoments)
                    .filter(([key, keyMoment])=>keyMoment.get('isActive').value)
                    .map(([key/*, keyMoment*/])=>key)
                    // delete higher indexes first, so lower indexes stay valid
                    .reverse()
              ;
            for(const key of activeKeys)
                keyMoments.delete(key);
        }));

        const _changeActiveMoment = changeAmount=>{
            if(changeAmount === 0)
                return;
            const keyMoments = this.getEntry('keyMoments')
              , activeKeyMoments = Array.from(keyMoments)
                    .filter(([key, keyMoment])=>keyMoment.get('isActive').value)
              , size = keyMoments.size
              ;
            if(size === 0)
                return;
            const maxIndex = size - 1;
            if(activeKeyMoments.size === 0) {
                // Nothing selected, pick first or last
                let newIndex = (changeAmount > 0)
                        // (maxIndex + 1) % size === 0
                        ? (maxIndex + changeAmount) % size
                        // (size - 1) % size = maxIndex
                        : (size + changeAmount) % size
                        ;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;

                keyMoments.get(`${newIndex}`).get('isActive').value = true;
                return;
            }
            // change all
            const newActiveKeys = new Set();
            // prepare
            for(const [key/*,activeKeyMoment*/] of activeKeyMoments) {
                let newIndex = (parseInt(key, 10) + changeAmount) % size;
                if(newIndex < 0)
                    // We've used % size everywhere, thus this will result
                    // in a valid index.
                    newIndex = size + newIndex;
                newActiveKeys.add(`${newIndex}`);
            }
            for(const [key, keyMoment] of keyMoments)
                keyMoment.get('isActive').value = newActiveKeys.has(key);
        };
        previousButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(-1);
        }));
        nextButton.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            return _changeActiveMoment(+1);
        }));

        this._insertElement(element);
        return [element, addButton, removeButton
              , previousButton, nextButton];
    }

    _getInsertParameters(keyMoments, liveProperties, t) {
            const absoluteT = t * liveProperties.fullDuration
                // - for t, get the absoluteT
                // - get the keyMoment after
              , momentTs = [...liveProperties.tToKeyMoments.keys()]
              , [leftIndex, rightIndex] = binarySearch(momentTs, absoluteT)
              , leftT = momentTs[leftIndex]
              , rightT = momentTs[rightIndex]
              ;

            // return values
            let insertIndex
              , newMomentDuration = null
              , newAfterMomentDuration = null
              , afterMoment = null
              ;
            if(leftIndex === null && rightIndex === null) {
                // No moments at all.
                // Just insert a blank, new, KeymomentMoment
                insertIndex = 0;
                newMomentDuration = null; // As per coherence function (will be 1).
                newAfterMomentDuration = null;
                afterMoment = null;

            }
            else if(leftIndex === null) {
                // leftIndex === null: t is bigger than/right of the last entry.
                //          Because absoluteT > momentTs[rightIndex]
                //          Assert: Must be a loop, otherwise there is no
                //                  right of last entry...
                //          Assert rightIndex === 0
                //          This will create a new last KeyMoment,
                //          but it will change the duration of the first
                //          keyMoment.
                // insert at the end
                afterMoment = keyMoments.get(0);
                insertIndex = keyMoments.size;
                // change first KeyMoment, as its duration closes the loop
                newMomentDuration = absoluteT - rightT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            else if(rightIndex === null) {
                // We're left from the first index,
                // This is not supposed to happen, because we use all
                // existing KeyMoments, not a subset and there is no
                // time before the first KeyMoment.
                throw new Error(`Assertion Failed, rightIndex must not be null.`);
            }
            else if (leftIndex === rightIndex) {
                //           Interesting since we can have possibly different in and
                //           out values when there are multiple moments at this position.
                //           We are directly on an existing momentT.
                //           Do we insert before or after?
                // Here the add-button allows for more control, but we can
                // just insert insert empty, after with a duration of 0.
                // But, since this method is changing the duration of the
                // after moment usually, it's maybe more intuitiv to insert
                // before. The way, properties are applied to the new moment,
                // via liveProperties, favors inserting after, it's jsut
                // simpler for now.
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT).at(-1);
                afterMoment = null;// Not required, doesn't change: keyMoments.get(afterIndex);
                insertIndex = parseInt(afterIndex,10) + 1;
                newMomentDuration = 0;
                newAfterMomentDuration = null; // don't change
            }
            else { // leftIndex !== rightIndex
                const [afterIndex, /*afterMoment (not a draft)*/] = liveProperties.tToKeyMoments.get(rightT)[0];
                afterMoment = keyMoments.get(afterIndex);
                insertIndex = afterIndex;
                newMomentDuration = absoluteT - leftT;
                const afterMomentDuration = afterMoment.get('duration').value;
                newAfterMomentDuration = afterMomentDuration - newMomentDuration;
            }
            return [insertIndex, newMomentDuration, afterMoment, newAfterMomentDuration];
    }

    // FIXME: looking at the implementation, I'm not sure why UPDATE_STRATEGY_COMPARE
    // is chosen in here, but, the main dependency is a list, and hence
    // UPDATE_STRATEGY_COMPARE could cause less effort to update the element,
    // it is just not implemented so far. I leave this here as an example
    // how to turn UPDATE_STRATEGY_COMPARE into UPDATE_STRATEGY_SIMPLE
    initialUpdate(rootState) {
        const compareResult = StateComparison.createInitial(rootState, this.parentAPI.wrapper.dependencyMapping);
        this.update(compareResult);
    }

    update(compareResult) {
        // console.log(`${this.constructor.name}.update(compareResult):`, compareResult);
        // compareResult.toLog();
        // console.log('dependencyMapping', this.parentAPI.wrapper.dependencyMapping);
        const changedMap = this._getChangedMapFromCompareResult(compareResult);
        // console.log('compareResult.getChangedMap(this.parentAPI.wrapper.dependencyMapping)', changedMap);
        // console.log('compareResult.getDetaislMap()', compareResult.getDetaislMap());

        // TODO: try out changing based on LIST_NEW_ORDER state
        if(changedMap.has('keyMoments')) {
            const keyMoments = changedMap.get('keyMoments');
            this.previousButton.disabled = keyMoments.size < 2;
            this.nextButton.disabled = keyMoments.size < 2;
        }
    }
}

export class ToggleKeyMomentButton extends _BaseComponent {
    // jshint ignore:start
    static baseClass = 'ui_toggle_key_moment_button';
    // jshint ignore:end

    constructor(parentAPI) {
        super(parentAPI);
        this.element = this._domTool.createElement('button', {
                'class': `${this.constructor.baseClass}`
              , title: 'Select this Key-Moment for editing.'
            }, '(initializing)');
        this._insertElement(this.element);
        this.element.addEventListener('click', this._changeStateHandler((/*event*/)=>{
            const entry = this.getEntry('boolean');
            entry.set(!entry.value);
        }));
    }

    update(changedMap) {
        if(changedMap.has('label'))
            this.element.textContent = changedMap.get('label').value;

        if(changedMap.has('boolean')) {
            const booleanValue = changedMap.get('boolean').value
              , _setActiveClass = elem=>elem.classList[booleanValue ? 'add' : 'remove']('active')
              ;
            _setActiveClass(this.element);
            _setActiveClass(this.parentAPI.wrapper.host);
        }
    }
}

function _frozenMapFromObject(obj) {
    return Object.freeze(
        new FreezableMap(
            Object.entries(obj)
                  .map(([k, v])=>[k, Object.freeze(v)])
        )
    );
}
const REGISTERED_PROPERTIES = Object.freeze({
    NUMERIC: _frozenMapFromObject({
        x: {'default': 0, inherit: false}
      , y: {'default': 0, inherit: false}
      , 'z-index': {'default': 0, step: 1, inherit: false}
      , r: {name: 'Radius', min: 0, 'default': 0, inherit: true}
      , t: {name: 'Children Time', 'default': 0, inherit: true}
      , width: {'default': 0, inherit: false}  // default should be 'inherit' ;-)
      , height: {'default': 0, inherit: false} // default should be 'inherit' ;-)
    })

    // This is interesting!
    // As a default text in black background in white is super common.
    // However, depending on the context, we don't want to apply these
    // colors all the time e.g.:
    //  default backgroundColor
    //          stage: is good
    //          lineOfText: no background color/transparent is good
    //  default textColor:
    //          stage: is good
    //          lineOfText: should inherit first, if there's no inherited
    //              value default would be good to activeley set no color,
    //              alpha channel transparency shold be used no color at
    //              all is not an option, also as it would use whatever
    //              a parent in CSS has. however, since Stage has a default
    //              textColor, that would be inherited.
    //              In this case, if we don't inherit a textColor we
    //              should even raise an error.
    // Currently (so far only in Stage) if 'default' returns a falsy value,
    // the css property is removed, and there's no faly default value.
    // Maybe that detail can be handled differently.
  , COLOR: _frozenMapFromObject({
        textColor: {
            inherit: true
          , label: 'Text Color'
            /* black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none)'))
        }
      , backgroundColor: {
            inherit: false
          , label: 'Background Color'
            /* white */
          , 'default': Object.freeze(culoriParse('oklch(100% 0 none)'))
        }
      , strokeColor: {
            inherit: false
          , label: 'Stroke Color'
            /* transparent black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none 0%)'))
        }
      , fillColor: {
            inherit: false
          , label: 'Fill Color'
            /* black */
          , 'default': Object.freeze(culoriParse('oklch(0% 0 none)'))
        }
    })
  , GENERIC: _frozenMapFromObject({
        textRun: {
            inherit: true
          , label: 'Text Content'
          , 'default': '' // <= StringModel can have a defaultValue!
        }
      , textAlign: {
            inherit: true
          , label: 'Text Align'
          , 'default': TextAlignmentModel.defaultValue
        }
      , positioningHorizontal: {
            inherit: true
          , label: 'Positioning-X'
          , 'default': CSSPositioningHorizontalModel.defaultValue
        }
      , positioningVertical: {
            inherit: true
          , label: 'Positioning-Y'
          , 'default': CSSPositioningVerticalModel.defaultValue
        }
      , direction: {
            inherit: true
          , label: 'Direction'
          , 'default': CSSDirectionModel.defaultValue
        }
      , heightTreatment: {
            inherit: true
          , label: 'Height Fixes'
          , 'default': HeightTreatmentModel.defaultValue
        }
    })
});



// FIXME: not all types require all REGISTERED_PROPERTIES.NUMERIC
// e.g. Radius is nonsense for LineOfText, or basically for all except
// Circle. Children Time is only relevant for Layer and Stage, everything else
// doesn't have children. However, Font-Size should probably be in here,
// it doesn't seem to make much sense to treat it differently. However,
// Colors will be a different ballpark!
// Despite of different targets (fill, background, stroke, ... more?)
// we have the different models to specify (rgb+a, hsl+a) and similarly
// different ways to interpolate the compontents! having flat components
// in the key moments would make it cool to work within one model, but it
// would create a lot of entries and it's not yet fully clear to me how
// these would interpolate...
// Initially, this will be rough and we might have an property explosion,
// but we should work towards nice, color picker based interfaces.
// but what if I only want to modulate L (lightness) ...? The numeric
// properties model allows this, but when one keyMoment specifies RGB
// it's hard to only change L in top of that!.
// Ok, so the plan is to start with OKLCH then add OKLAB, interpolation
// considerations onlz start in step 2, when OKLCH and OKLAB are there,
// as interpolating between A and B will create another transition than
// between C and H
// Maybe we can start in step 2 using CSS color-mix(), then use the
// colorio library to rebuild the functionality for other targets, that
// e.g. only support rgba, like for an export without CSS support...



export class UINumericProperties extends _BaseComponent {
    constructor (parentAPI, getDefaults=null, requireUpdateDefaults=()=>false) {
        super(parentAPI);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        this._propertiesChangeHandler = this._changeStateHandler(this.__propertiesChangeHandler.bind(this));

        this.element = this._domTool.createElement('div',
                {class: 'numeric_properties'},
                this._domTool.createElement('h3', {}, 'Numeric Properties'));

        this._insertElement(this.element);
        this._propertiesInterfaces = new Map();
        this._insertedElements = [];

        this._localPropertyValues = {};
        this._numericProperties = null;

        this._initUI();
    }

    // could be static and stand alone
    _setOrReset(mapLike, key, value) {
        if(value === null)
            mapLike.delete(key);
        else
            mapLike.setSimpleValue(key, value);
    }
     /* Run within transaction context */
    __propertiesChangeHandler(key, value) {
        const numericProperties = this.getEntry('numericProperties');
        this._setOrReset(numericProperties, key, value);
    }

    _cleanUp() {
        this._localPropertyValues = {};
        for(const ui of this._propertiesInterfaces.values())
            ui.destroy();
        this._propertiesInterfaces.clear();

        for(const element of this._insertedElements)
            this._domTool.removeNode(element);
        this._insertedElements.splice(0, Infinity);
    }

    _initUI() {
        const insertElement = (...elements)=>{
            this.element.append(...elements);
            this._insertedElements.push(...elements);
        };

        for(const key of this.propertiesKeys()) {
            if(this._propertiesInterfaces.has(key))
                //seen
                continue;
            const properties = {};
            for(const [k,v] of Object.entries(this.propertiesGet(key))){
                if(k === 'default') {
                    properties.value = v;
                    continue;
                }
                properties[k] = v;
            }
            if(!('name' in properties))
                properties.name = key;
            if(!('value' in properties))
                properties.value = 0;

            const {name, value:defaultVal} = properties;
            this._localPropertyValues[key] = defaultVal;

            const input = new PlainNumberAndRangeOrEmptyInput(
                this._domTool
                // numberChangeHandler
              , value=>this._propertiesChangeHandler(key, value)
                // toggleChangeHandler
              , ()=>{
                    const value = this._numericProperties.has(key)
                        ? null // if the property is defined delete
                        // if the property is not defined set default ...
                        : (this._getDefaults
                                    ? this._getDefaults(key, defaultVal)
                                    : defaultVal
                          )
                        ;
                    this._propertiesChangeHandler(key, value);
                }
              , name === key ? `${name}` :`${name} (${key})`
              , undefined
              , properties
            );

            insertElement(input.element);
            // console.log('_propertiesInterfaces set:', key, input);
            this._propertiesInterfaces.set(key, input);
        }
    }

    propertiesHas(key) {
        return REGISTERED_PROPERTIES.NUMERIC.has(key);
    }
    propertiesGet(key) {
        if(!this.propertiesHas(key))
            throw new Error(`KEY ERROR ${key} not found in REGISTERED_PROPERTIES.NUMERIC.`);
        return REGISTERED_PROPERTIES.NUMERIC.get(key);
    }

    propertiesKeys() {
        return REGISTERED_PROPERTIES.NUMERIC.keys();
    }

    *propertiesEntries() {
        for(const key of this.propertiesKeys())
            yield [key, this.propertiesGet(key)];
    }

    _getValueForProperty(key) {
        return this._numericProperties.has(key)
                    ? [true, this._numericProperties.get(key).value]
                    : [false, (this._getDefaults !== null
                            ? this._getDefaults(key, this.propertiesGet(key)['default'])
                            : this.propertiesGet(key)['default']
                            )
                      ]
                    ;
    }

    _updateValueToPropertyInterface(key, active, value) {
        if(!this._propertiesInterfaces.has(key))
            throw new Error(`KEY ERROR property interface for "${key}" not found.`);
        const widget = this._propertiesInterfaces.get(key);
        widget.update(active, value);
        this._localPropertyValues[key] = value;
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);

        if(changedMap.has('numericProperties') || requireUpdateDefaults) {
            const numericProperties = changedMap.has('numericProperties')
                                        ? changedMap.get('numericProperties')
                                        : this.getEntry('numericProperties')
                                        ;
            this._numericProperties = numericProperties;
            for(const key of this.propertiesKeys()) {
                const [active, value] = this._getValueForProperty(key);
                // It's interesting: in a way, the sub-ui's could listen
                // directly to their entry at axesLocations/{axisTag}
                // but on the other hand, because we want to set defaults
                // in here when nothing is in axesLocations and that requires
                // updating as well, we do it directly here.
                // Maybe there will be/is a nicer way to implement behavior
                // like this. I.e. when the entry is DELETED the UI knows
                // it's default and sets it by itself.
                this._updateValueToPropertyInterface(key, active, value);
            }
        }
    }
}


const PECENTAGE_UNIT_NUMBER_TYPES = new Set([
        PercentNumberModel
      , PercentNumberOrEmptyModel
      , PercentWithNegativeNumberModel
      , PercentWithNegativeNumberOrEmptyModel
]);

const TURN_UNIT_NUMBER_TYPES = new Set([
        HueNumberModel, HueNumberOrEmptyModel
]);


export function colorToCss(color) {
    let formatter;
    if(color instanceof RGBColorModel)
        formatter = (R, G, B, alpha)=>`rgb(${R} ${G} ${B} / ${alpha})`;
    else if(color instanceof OKLABColorModel)
        formatter = (L, a, b, alpha)=>`oklab(${L} ${a} ${b} / ${alpha})`;
    else if(color instanceof OKLCHColorModel)
        formatter = (L, C, H, alpha)=>`oklch(${L} ${C} ${H}/ ${alpha})`;
    else
        throw new Error(`KEY ERROR ColorToCss color type unkonw ${color} (${color.constructor.name}).`);
    const componentStrings = [];
    for(const [componentKey, component] of color) {
        if(component.isEmpty)
            // CSS alpha = none means complete transparency I think
            // semantically the appearance of no alpha channel specified
            // is better instead, i.e. like letting out the "/ ${A}" part
            // in the formatters above.
            componentStrings.push(componentKey === 'alpha' ? '100%': 'none');
        else if(PECENTAGE_UNIT_NUMBER_TYPES.has(component.constructor))
            componentStrings.push(`${component.value}%`);
        else if(TURN_UNIT_NUMBER_TYPES.has(component.constructor))// so far only HueOrEmptyModel
            componentStrings.push(`${component.value}turn`);
        else
            componentStrings.push(`${component.value}`);
    }
    return formatter(...componentStrings);
}

function _getMinMaxRangeFromComponentType(ComponentType) {
    const UnwrappedType = ComponentType.prototype instanceof _AbstractSimpleOrEmptyModel
        ? ComponentType.Model
        : ComponentType
        ;
    return [UnwrappedType.minVal, UnwrappedType.maxVal];
}

function _mapValueToRange(value, fromRange, toRange) {
    const [minVal, maxVal] = fromRange
        // normalize between 0 and 1
      , t = (value - minVal) / (maxVal - minVal)
      , [toMin, toMax] = toRange
      , mappedValue = interpolateNumber(t, toMin, toMax)
      ;
    return mappedValue;
}

function getCuloriModeFromColor(colorOrColorType) {
    const color = (colorOrColorType instanceof _AbstractDynamicStructModel)
            ? colorOrColorType.wrapped
            : colorOrColorType
       , ColorType = (color instanceof _BaseColorModel)
            ? color.constructor
            : color
            ;
    if(!COLOR_TYPE_TO_CULORI_MODE.has(ColorType))
        throw new Error(`KEY ERROR can't determine culori-js color mode from colorOrColorType ${colorOrColorType}.`);
    return COLOR_TYPE_TO_CULORI_MODE.get(ColorType);
}

function colorToCulori(colorWrapper) {
    const color = colorWrapper.wrapped
      , mode = getCuloriModeFromColor(color)
      , culoriModeRanges = culoriGetMode(mode).ranges
      ;

    const culorijsColor = Object.fromEntries(Array.from(color.entries())
        .filter(([/*componentKey*/, component])=>!(component instanceof _AbstractSimpleOrEmptyModel && component.isEmpty))
        .map(([componentKey, component])=>{
            const culoriComponent = componentKey.toLowerCase()
              , fromRange = _getMinMaxRangeFromComponentType(component.constructor)
              , toRange = culoriModeRanges[culoriComponent]
                // If it's an _AbstractSimpleOrEmptyModel and it's empty, it will
                // raise here(!) but that should be taken care of by the caller.
              , value = component.value
              , culoriValue = _mapValueToRange(value, fromRange, toRange)
              ;
            return [culoriComponent, culoriValue];
        }));
    culorijsColor.mode = mode;
    return culorijsColor;
}

function _culoriValuesToColorValuesRange(culorijsColor) {
    if(!CULORI_MODE_TO_COLOR_TYPE_KEY.has(culorijsColor.mode))
        throw new Error(`VALUE ERROR unsupported color mode: "${culorijsColor.mode}".`);

    const typeKey = CULORI_MODE_TO_COLOR_TYPE_KEY.get(culorijsColor.mode)
      , ColorType = availableColorTypes.get(typeKey).value.get('typeClass').value
      , culoriModeRanges = culoriGetMode(culorijsColor.mode).ranges
      , result = {}
      ;
    for(const [componentKey, ComponentType] of ColorType.fields.entries()) {
        const culoriComponent = componentKey.toLowerCase();
        if(!Object.hasOwn(culorijsColor, culoriComponent))
            continue;
        const culoriComponentValue = culorijsColor[culoriComponent]
          , fromRange = culoriModeRanges[culoriComponent]
          , toRange = _getMinMaxRangeFromComponentType(ComponentType)
          , componentValue = _mapValueToRange(culoriComponentValue, fromRange, toRange)
          ;
        result[componentKey] = componentValue;
    }
    return result;
}

function _culoriToColor(culorijsColor, dependencies) {
    if(!CULORI_MODE_TO_COLOR_TYPE_KEY.has(culorijsColor.mode))
        throw new Error(`VALUE ERROR unsupported color mode: "${culorijsColor.mode}".`);
    const typeKey = CULORI_MODE_TO_COLOR_TYPE_KEY.get(culorijsColor.mode)
      , colorWrapperDraft = createColor(typeKey, dependencies)
      , colorDraft = colorWrapperDraft.get('instance').wrapped
      , mappedColor = _culoriValuesToColorValuesRange(culorijsColor)
      ;
    for(const componentKey of colorDraft.constructor.fields.keys()) {
        if(!Object.hasOwn(mappedColor, componentKey))
            continue;
        colorDraft.get(componentKey).value = mappedColor[componentKey];
    }
    return colorWrapperDraft;
}

function culoriToColor(culorijsColor, dependencies) {
    const _culorijsColor = !CULORI_MODE_TO_COLOR_TYPE_KEY.has(culorijsColor.mode)
          // we know oklch exists in CULORI_MODE_TO_COLOR_TYPE_KEY
        ? culoriConverter('oklch')(culorijsColor)
        : culorijsColor
        ;
    return _culoriToColor(_culorijsColor, dependencies);
}


class PlainNumberAndRangeColorInput extends PlainNumberAndRangeInput {
    //jshint ignore:start
    static TEMPLATE = `<div class="number_and_range_input number_and_range_color_input">
    <div class="number-and-range-input_value-box">
        <label><!-- insert: label --></label>
        <input type='number'  /><!-- insert: unit -->
    </div>
    <div class="number-and-range-input_color-bar">
        <input type='range' />
    </div>
</div>`;
    //jshint ignore:end
    constructor(...args) {
        super(...args);
        this._colorBarContainer = this.element.querySelector('.number-and-range-input_color-bar');
        this._canvas = this._domTool.createElement('canvas');
        this._colorBarContainer.append(this._canvas);
        this._ctx = this._canvas.getContext('2d', {colorSpace: 'display-p3'});
    }
}

export class PlainColorComponentOrEmptyInput {
    constructor(domTool, baseClass='ui_color_component') {
        this._domTool = domTool;
        this._baseClass = baseClass;
        this._componentKey = null;

        this._uiNumber = new PlainNumberAndRangeColorInput(this._domTool
                , (...args)=>this._changeHandler(...args)
                , '', '', {});

        this._uiToggle = new PlainToggleButton(this._domTool
          , (...args)=>this._toggleHandler(...args)
          , 'toggle', 'set explicitly' , 'unset'
          , 'Toggle explicit color component input or set empty.');

        // Better for styling and the way PlainNumberAndRangeColorInput
        // is created allows it.
        this.element = this._uiNumber.element;

        this.element.classList.add(this._baseClass);
        this.element.append(/*this._uiNumber.element,*/ this._uiToggle.element);
        this._changeHandler = null;
        this._toggleHandler = null;
    }
    getComponentClassFragment(componentKey) {
        return componentKey.toLowerCase();
    }

    _renderColorStrip (componentKey, culoriColor) {
        const ranges= culoriGetMode(culoriColor.mode).ranges;
        // ranges = {
        //     "l": [0, 1],
        //     "a": [-0.4, 0.4],
        //     "b": [-0.4, 0.4],
        //     "alpha": [0, 1]
        // }
        const container = this._uiNumber._colorBarContainer
          , width = container.scrollWidth
          , height = container.scrollHeight
          , ctx = this._uiNumber._ctx
          , canvas = this._uiNumber._canvas
          , componentRange = ranges[componentKey]
          , colors = componentRange.map(value=>({...culoriColor, [componentKey]:value}))
          , interpolateArgs = [colors, culoriColor.mode]
          , hueInterpolationMethod = componentKey === 'h' ? 'longer hue' : false
          ;
        const HUE_INTERPOLATION_METHODS = new Map([
                ['shorter hue', fixupHueShorter]
              , ['longer hue', fixupHueLonger]
              , ['increasing hue', fixupHueDecreasing]
              , ['decreasing hue', fixupHueIncreasing]
        ]);
        if(hueInterpolationMethod) {
            if(!HUE_INTERPOLATION_METHODS.has(hueInterpolationMethod))
                console.error(`KEY ERROR unkown hueInterpolationMethod "${hueInterpolationMethod}".`);
            interpolateArgs.push({h: {fixup: HUE_INTERPOLATION_METHODS.get(hueInterpolationMethod)}});
            // Bummer, this is annoying: seems like culori does a toValue % maxValue (=== 360)
            // which leaves for interpolation from === 0 and to === 0
            // hence, the direction is irrelevant.
            colors[1].h -= Number.EPSILON * 1000;
        }
        const interpolator = culoriInterpolate(...interpolateArgs);
        if(canvas.width !== width) {
            canvas.width = width;
            canvas.style.setProperty('--width', `${width}px`);
        }
        // CAUTUION: Since height === container.scrollHeight
        // the continer will grow on each update, adding the current
        // canvas height to the new canvas height. That means, the
        // canvas must be positioned absolutely, to not interact with
        // container.scrollHeight.
        if(canvas.height !== height) {
            canvas.height = height;
            canvas.style.setProperty('--height', `${height}px`);
        }

        if(ctx.reset)
            ctx.reset();
        else
            // Safari doesn't have ctx.reset, below would work universally though.
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        for(let x=0;x<width;x++) {
            const t = x/(width-1);
            ctx.fillStyle = culoriFormatCss( interpolator(t) );
            ctx.fillRect(x, 0, 1, height);
        }
    }

    update(componentKey, color, changeHandler, toggleHandler, culoriColorInMode, defaultValue=0) {
        this._componentKey = componentKey;
        for(const className of [...this.element.classList]) {
            if(className.startsWith(`${this._baseClass}-`))
                this.element.classList.remove(className);
        }

        const component = color.get(componentKey);
        let unit = null;
        if(PECENTAGE_UNIT_NUMBER_TYPES.has(component.constructor))
            unit = '%';
        else if(TURN_UNIT_NUMBER_TYPES.has(component.constructor))
            unit = 'turn';

        const ValueModel = component instanceof _AbstractSimpleOrEmptyModel
                ? component.constructor.Model
                : component.constructor
                ;
        const min = ValueModel.minVal
          , max = ValueModel.maxVal
          , toFixedDigits = ValueModel.toFixedDigits
          , cleanDefaultValue = toFixedDigits !== null
                    ? parseFloat(defaultValue.toFixed(toFixedDigits))
                    : defaultValue
          ;
        this._uiNumber.updateTemplateVars(componentKey, unit, {min, max, 'default': ValueModel.defaultValue});

        if(component.isEmpty) {
            this._uiNumber.update(cleanDefaultValue);
            this._uiNumber.passive = true;
            this._uiToggle.update(true);
        }
        else {
            this._uiNumber.update(component.value);
            this._uiNumber.passive = false;
            this._uiToggle.update(false);
        }

        this.element.classList.add(`${this._baseClass}-${this.getComponentClassFragment(componentKey)}`);

        this._changeHandler = changeHandler;
        this._toggleHandler = toggleHandler;
        this._renderColorStrip(componentKey.toLowerCase(), culoriColorInMode);
    }
    destroy(){}
}

function _getNumberInstanceDefault(numberInstance, defaultVal=_NOTDEF) {
    if(numberInstance.constructor.Model.defaultValue !== null)
        return numberInstance.constructor.Model.defaultValue;
    if(defaultVal !== _NOTDEF)
        return _NOTDEF;
    throw new Error(`KEY ERROR default value not found for ${numberInstance}.`);
}

class UIColorComponentRanges extends _BaseComponent {
    //jshint ignore:start
        static TEMPLATE = `<div class="ui_color_component_ranges">
</div>`;
    //jshint ignore:end
     constructor (parentAPI, getDefaults=null, requireUpdateDefaults=()=>false) {
        super(parentAPI);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        this._components = [];
        [this.element] = this.initTemplate();
    }

    initTemplate() {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          ;
        this._insertElement(element);
        return [element];
    }

    _createComponent() {
        const component = new PlainColorComponentOrEmptyInput(this._domTool);
        this.element.append(component.element);
        return component;
    }

    _componentToggleHandler(componentKey) {
        this._changeState(()=>{
            const color = this.getEntry('color')
              , component = color.get(componentKey)
              ;
            if(!component.isEmpty){
                component.clear();
            }
            else {
                const [defaultColor, ] = this._getDefaultColor(color)
                  , defaultValue = Object.hasOwn(defaultColor, componentKey)
                      ? defaultColor[componentKey]
                      : _getNumberInstanceDefault(component, 0)
                  ;
                component.set(defaultValue);
            }
        });
    }

    _componentChangeHandler(componentKey, newValue/*, ...args*/) {
        this._changeState(()=>{
            const color = this.getEntry('color')
              , component = color.get(componentKey)
              ;
            component.set(newValue);
        });
    }

    _updateComponent(i, componentKey, color, defaultValue, culoriColorInMode) {
        const component = this._components[i];
        component.update(
                componentKey
              , color
               // set change handlers
              , this._componentChangeHandler.bind(this, componentKey)
              , this._componentToggleHandler.bind(this, componentKey)
              , culoriColorInMode
              , defaultValue
        );
    }

    _getDefaultColor(color) {
        const defaultCuloriColor = this._getDefaults()
          , mode = getCuloriModeFromColor(color)
          , defaultConvertedCuloriColor = _convertCuloriColorMode(defaultCuloriColor, mode)
            // has no 'mode' as the values are not compatible with culori anymore
          , defaultColor = _culoriValuesToColorValuesRange(defaultConvertedCuloriColor)
          ;
        return [defaultColor, defaultConvertedCuloriColor];
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('color') || requireUpdateDefaults) {
            const color = (changedMap.has('color')
                            ? changedMap.get('color')
                            : this.getEntry('color')
                        ).wrapped
              , [defaultColor, defaultCuloriColor] = this._getDefaultColor(color)
              ;
            let size = 0;
            for(const [i, componentKey] of enumerate(color.keys())) {
                size += 1;
                if(!this._components[i])
                    this._components.push(this._createComponent());
                const defaultValue = Object.hasOwn(defaultColor, componentKey)
                        ? defaultColor[componentKey]
                        : _getNumberInstanceDefault(color.get(componentKey), 0)
                        ;
                this._updateComponent(i, componentKey, color, defaultValue, defaultCuloriColor);
            }
            while(this._components.length > size) {
                const component = this._components.pop();
                component.element.remove();
                component.element.destroy();
            }
        }
    }
}

class UIColorPatch extends _BaseComponent{
     constructor (parentAPI, getDefaults, requireUpdateDefaults, elementTag='div') {
        super(parentAPI);
        this._getDefaults = getDefaults;
        this._requireUpdateDefaults = requireUpdateDefaults;
        [this.element] = this.initTemplate(elementTag);
    }

    initTemplate(elementTag) {
        const element =  this._domTool.createElement(
                                elementTag, {'class': 'ui_color_patch'});
        this._insertElement(element);
        return [element];
    }

    update (changedMap) {
        const requireUpdateDefaults = this._requireUpdateDefaults(changedMap);
        if(changedMap.has('color') || requireUpdateDefaults) {
            const defaultCuloriColor = this._getDefaults()
              , color = changedMap.has('color')
                            ? changedMap.get('color')
                            : this.getEntry('color')
              ;
            if(color.hasWrapped) {
                this.element.classList.add(`ui_color_patch-has_color`);
                this.element.classList.remove(`ui_color_patch-no_color`);
                // Always display the complete color if a color is set
                // used to be: colorToCss(color.wrapped));
                this.element.style.setProperty('--color',culoriFormatCss(defaultCuloriColor));
            }
            else {
                this.element.classList.remove(`ui_color_patch-has_color`);
                this.element.classList.add(`ui_color_patch-no_color`);
                this.element.style.removeProperty('--color');
            }
        }
    }
}

class UIColorChooser extends _BaseContainerComponent {
    constructor(parentAPI, _zones, label, getDefaults, updateDefaultsDependencies, requireUpdateDefaults) {
        // This widget should be potentially collapsed and only show a
        // label and tile of the color/none-color
        const baseClass = 'ui_color_chooser'
          , localZoneElement = parentAPI.domTool.createElement(
                                    'div', {'class': baseClass})
          , labelZoneElement = parentAPI.domTool.createElement('label', {'class': `${baseClass}-label_toggle`})
          , zones = new Map([..._zones
                        , ['local', localZoneElement]
                        , ['label', labelZoneElement]
            ])
          ;

        super(parentAPI, zones);
        this._container = localZoneElement;
        this._visibleClass = 'settings_visible';
        this._hiddenClass = 'settings_hidden';
        this._displaySettings = false;
        this._toggleSettingsVisibilityClasses();

        this._getDefaults = getDefaults;
        const activationTest = ()=>{
                if(!this._displaySettings)
                    return false;
                const testResult = this.parentAPI.getEntry(this.parentAPI.rootPath)
                                    .get('colorTypeKey').value !== ForeignKey.NULL;
                // console.log(`${this} activationTest:`, testResult
                //      , 'for:', parentAPI.rootPath.toString(), '<<>>'
                //      , this.parentAPI.getEntry(this.parentAPI.rootPath)
                //                    .get('colorTypeKey').value);
                return testResult;
            }
          , widgets = [
            // label: TODO get a proper human readable label into here
            // <h2>Color ${this.parentAPI.rootPath.parts.pop()}</h2>
            [
                {zone: 'main'}
              , []
              , StaticNode
              , localZoneElement
            ]
          , [
                {
                    zone: 'local'
                  , onInit: widget=>widget.node.addEventListener('click', this._toggleOptionsHandler.bind(this))
                }
              , []
              , StaticNode
              , labelZoneElement
            ]
          , [
                {zone: 'label'}
              , []
              , StaticNode
              , this._domTool.createElement('span', null, label)
            ]
          , [
                {zone: 'label'}
              , [
                    ['instance', 'color']
                  , ...updateDefaultsDependencies
                ]
              , UIColorPatch
              , getDefaults, requireUpdateDefaults
              , 'span'
            ]
          , [
                {
                    zone: 'local'
                  , activationTest: ()=>this._displaySettings
                }
              , [
                    ['availableColorTypes', 'options']
                  , ['colorTypeKey', 'value']
                ]
              , GenericSelect
              , 'ui_color_model_select'// baseClass
              , 'Color Mode'// labelContent
              , (key, availableColorType)=>{ return availableColorType.get('label').value; } // optionGetLabel
              , [true, '(no color)', ForeignKey.NULL] // [allowNull, allowNullLabel]
                // changing this should convert the previous color mode to the
                // new color mode, using colori!
              , this._changeColorModeHandler.bind(this) // onChangeFn(newValue)
           ]
          ,[
                {zone: 'local', activationTest}
              , [
                    ['instance', 'color']
                  , ...updateDefaultsDependencies
                ]
              , UIColorComponentRanges
              , getDefaults, requireUpdateDefaults
           ]
        ];
        this._initWidgets(widgets);
    }
    _toggleSettingsVisibilityClasses() {
        const [addClass, removeClass] = this._displaySettings
                    ? [this._visibleClass, this._hiddenClass]
                    : [this._hiddenClass, this._visibleClass]
                    ;
        this._container.classList.add(addClass);
        this._container.classList.remove(removeClass);
    }
    _toggleOptionsHandler(/*evt*/) {
        // ideally:
        this._displaySettings = !this._displaySettings;
        this._toggleSettingsVisibilityClasses();
        // rerun ActivationTest ...
        const rootState = this.getEntry('/');
        this.initialUpdate(rootState);
    }
    _changeColorModeHandler(newValue) {
        // new Value is either a string, e.g. "OKLCH" or Symbol('NULL') === ForeignKey.NULL
        if(newValue === ForeignKey.NULL)
            return;
        const keyMomentDraft = this.getEntry(this.parentAPI.rootPath.parent)
          , colorFieldName = this.parentAPI.rootPath.parts.at(-1)
          , ColorType = availableColorTypes.get(newValue).value.get('typeClass').value
          , defaultCuloriColor = this._getDefaults(null)
          ;
        if(defaultCuloriColor === null)
            return;
        const culoriTargetMode = COLOR_TYPE_TO_CULORI_MODE.get(ColorType)
          , targetCuloriColor = _convertCuloriColorMode(defaultCuloriColor, culoriTargetMode)
          , color = culoriToColor(targetCuloriColor, keyMomentDraft.dependencies)
          ;
        keyMomentDraft.set(colorFieldName, color);
    }
}

function* getFieldsByType(FromType, SearchType) {
    for(const [fieldName, Type] of FromType.fields) {
            if(Type === SearchType)
                yield fieldName;
    }
}

/**
 * This is to identify ColorModel fields in a (_AbstractStruct) dataType FromType.
 * yields fildMame such that:
 *      FromType.fields.get(fieldName) === ColorModel
 */
function* getColorModelFields(FromType) {
    yield* getFieldsByType(FromType, ColorModel);
}

function genericTypeToUIElement(Type, defaultVal=_NOTDEF) {
    const valueUIElements = new Map([
            [StringModel, UILineOfTextInput]
          , [_AbstractEnumModel, UISelectInput]
        ])
      , valueOrEmptyUIElements = new Map([
            [StringModel, UILineOfTextOrEmptyInput]
          , [_AbstractEnumModel, UISelectOrEmptyInput]
        ])
      , isOrEmpty = Type.prototype instanceof _AbstractSimpleOrEmptyModel
      , [lookupMap, KeyType] = isOrEmpty
           ? [valueOrEmptyUIElements, Type.Model]
           : [valueUIElements, Type]
      ;

    let UIElement, defaultValue, args = [];
    if(KeyType.prototype instanceof _AbstractEnumModel ) {
        UIElement = lookupMap.has(KeyType)
            ? lookupMap.get(KeyType)
            : lookupMap.get(_AbstractEnumModel)
            ;
        defaultValue = KeyType.defaultValue;
        args.push(new Map(KeyType.enumItems.map(value=>[value, value])));
    }
    else if(lookupMap.has(KeyType)) {
        UIElement = lookupMap.get(KeyType);
        defaultValue = KeyType.defaultValue;
    }
    else {
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR can't find generic UI-Element for Type ${Type.name} (isOrEmpty: ${isOrEmpty}, KeyType: ${KeyType.name}).`);
    }
    return [UIElement, KeyType.defaultValue, ...args];
}

// copied from example-key-moments
class KeyMomentController extends _BaseContainerComponent {
    constructor(parentAPI, _zones, typeKey) {
        // run super first, so we can use `this` in the widgets definition.
        const localZoneElement = parentAPI.domTool.createElement('li', {'class': 'ui_key_moment_controller'})
          , zones = new Map([..._zones, ['local', localZoneElement]])
          ;
        super(parentAPI, zones);
        // MUST BE RESET after _update
        this._activationTestCache = null;
        const activationTest = ()=>{
            if(this._activationTestCache === null) {
                const keyMoment = this.parentAPI.getEntry(parentAPI.rootPath);
                // see trace to figure when to reset the cache!
                this._activationTestCache = keyMoment.get('isActive').value;
            }
            return this._activationTestCache;
        };
        // FIXME:
        // Dependencies that when they change require to update default
        // values of some fields ()
        // this._getDefaults changes return value when these dependencies
        // change.
        // It's the dependencies of AnimationLiveProperties:
        // ['t', 'keyMoments', 'isLoop']
        //  * Sans the 't' because that is the live animation
        //    position and the widgets here depend on the  keyMoment t,
        //  *  added "activeKey" as that change would change the default
        //     values as well (other keyMoment). But that would likely
        //     trigger full re-evaluation anyways.
        this._animationPropertiesKey = `animationProperties@${this.parentAPI.rootPath.append('..', '..')}`;
        const updateDefaultsDependencies = [
                [this._animationPropertiesKey, '@animationProperties']
            ]
          , _updateDefaultsNames = new Set(Array.from(zip(...updateDefaultsDependencies))[1])
          , requireUpdateDefaults = changedMap=>Array.from(changedMap.keys())
                                        .some(name=>_updateDefaultsNames.has(name))
          ;
        // TODO: this displayes only a button with the label of the keymoment
        //       when the key moment is active, the label will be bold and
        //       below the button all the controls shall be displayed.
        const specificWidgets = [];
        // FIXME: we should detect this differently, not hard coded.
        const typographicTypes = new Set(['[STAGE:null]', 'LayerActorModel', 'LineOfTextActorModel']);
        if(typographicTypes.has(typeKey)) {
            specificWidgets.push(
            [
                {zone: 'local', activationTest}
              , [
                    ['fontSize', 'value']
                    , ...updateDefaultsDependencies
                ]
              , UINumberAndRangeOrEmptyInput // should be rather just a Number, as a range is not simple for this.
              , ()=>this._getDefaults('', 'fontSize', 66)
              , requireUpdateDefaults
              , 'Font-Size' // label
              , 'pt'// unit
              , {min:0, max:244, step:1, 'default': 36} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'local', activationTest}
              , [
                    ['fontSize', 'fontSize']
                  , [typeKey === '[STAGE:null]' ? '/font' : '../../font', 'font']
                  , ['axesLocations', 'axesLocations']
                  , ['autoOPSZ', 'autoOPSZ']
                  , ...updateDefaultsDependencies
                ]
              , UIManualAxesLocations
              , this._getDefaults.bind(this)
              , requireUpdateDefaults
            ]
            );
        }
        const widgets = [
            [
                {zone: 'main'}
              , []
              , StaticNode
              , localZoneElement
            ]
          , [
                {zone: 'local'}
              , [
                    'label'
                  , ['isActive', 'boolean']
                ]
              , ToggleKeyMomentButton
            ]
          , [
                {zone: 'local', activationTest}
              , [
                    ['label', 'data']
                ]
              , DynamicTag
              , 'h3'
              , {}
              , (data)=>`Key Moment: ${data}`
            ]
            // label
          , [
                {zone: 'local', activationTest}
              , [
                    ['label', 'value']
                ]
              , UILineOfTextInput
              , 'Label'
            ]
            // duration
          , [
                {zone: 'local', activationTest}
              , [
                    ['duration', 'value']
                ]
              , UINumberInput
              , 'Relative Duration' // label
              , '/ Full Relative Duration'// unit
              , {min:0} // minMaxValueStep => set attribute
            ]
          , [
                {zone: 'local', activationTest}
              , [
                   // ['fontSize', 'value']
                    ...updateDefaultsDependencies
                  , 'numericProperties'
                ]
              , UINumericProperties
              , this._getDefaults.bind(this, 'numericProperties/')
              , requireUpdateDefaults
            ]
          , ...specificWidgets
          , ...this._defineColorWidgets(
                    {zone: 'local', activationTest}
                  , updateDefaultsDependencies
                  , requireUpdateDefaults
            )
          , ...this._defineGenericWidgets(
                    {zone: 'local', activationTest}
                  , updateDefaultsDependencies
                  , requireUpdateDefaults
            )
        ];
        this._initWidgets(widgets);
    }

    _defineColorWidgets(settings, updateDefaultsDependencies, requireUpdateDefaults) {
        const resultWidgets = [];
        // Get the Model of the KeyMoments and go fishing for ColorModel
        // Currently CircleActorModel has strokeColor and fillColor
        // and StageAndActorsModel, LineOfTextActorModel and LayerActorModel
        // have 'textColor', 'backgroundColor but that's all just an initial
        // definition, hence I'm looking for flexibility on this.
        const TypeClass =  this.parentAPI.getEntry(this.parentAPI.rootPath).constructor;
        for(const fieldName of getColorModelFields(TypeClass)) {
            // TypeClass.fields.get(fieldName) === ColorModel
            const fullKey= `colors/${fieldName}`;
            resultWidgets.push([
                {
                    ...settings
                  , rootPath: this.parentAPI.rootPath.append(fieldName)
                }
              , [
                    // These have to be done in the children of
                    // UIColorChooser as UIColorChooser is a container,
                    // not a leave component.:
                    // [fieldName, 'color'], ...updateDefaultsDependencies
                ]
              , UIColorChooser
              , new Map([...this._zones.entries(), ['main', this._zones.get(settings.zone)]])
              , _getRegisteredPropertySetup(fullKey, {label:fieldName}).label || fieldName
              , this._getDefaultColor.bind(this, fullKey)
              , updateDefaultsDependencies
              , requireUpdateDefaults
            ]);
        }
        return resultWidgets;
    }
    _defineGenericWidgets(settings, updateDefaultsDependencies, requireUpdateDefaults) {
        const resultWidgets = [];
        const TypeClass =  this.parentAPI.getEntry(this.parentAPI.rootPath).constructor;
        for(const fieldName of REGISTERED_GENERIC_KEYMOMENT_FIELDS) {
            if(!TypeClass.fields.has(fieldName))
                continue;
            const FieldType = TypeClass.fields.get(fieldName)
              , fullKey = `generic/${fieldName}`
              , [UIElement, defaultValue, ...futherArgs] = genericTypeToUIElement(FieldType)
              ;
            resultWidgets.push([
                {
                    ...settings
                  // , rootPath: this.parentAPI.rootPath.append(fieldName)
                }
              , [
                    [fieldName, 'value']
                  , ...updateDefaultsDependencies
                ]
              , UIElement
              , ()=>this._getDefaults('', fullKey, defaultValue)
              , requireUpdateDefaults
              , _getRegisteredPropertySetup(fullKey, {label:fieldName}).label || fieldName
              , ...futherArgs
            ]);
        }
        return resultWidgets;
    }
    _update(...args) {
        try {
            return super._update(...args);
        }
        finally {
            this._activationTestCache = null;
        }
    }

    _getDefaults(prefix, key, defaultVal=_NOTDEF) {
        // const axisPrefix = 'axesLocations/';
        // activeKey: we can probably retrieve via this.getEntry('../activeKey').value

        // rootPath: /activeState/keyMoments/0
        // actor: activeState
        const fullKey = `${prefix}${key}`
           , liveProperties = this.getEntry(this._animationPropertiesKey)
           , activeKey = this.parentAPI.rootPath.parts.at(-1)
           , propertyValues = liveProperties.getPropertyValuesMapForKeyMoment(activeKey)
           ;
        if(fullKey.startsWith('colors/')) {
            const [color, ] = _getColorFromPropertyValuesMap(fullKey, propertyValues, [null]);
            if(color !== null)
                return color;
            // else: This will return defaultVal if set or raise the KEY ERROR.
        }
        else if(propertyValues.has(fullKey))
            return propertyValues.get(fullKey);
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw new Error(`KEY ERROR ${this}._getDefaults: not found "${fullKey}" for ${activeKey} in ${liveProperties}`);
    }

    _getDefaultColor(fullKey, defaultVal=_NOTDEF) {
        const result = this._getDefaults('', fullKey, null);
        if(result !== null)
            return result;
        // If defaultVal === _NOTDEF and fullKey is not found
        // this will raise.
        const fallback = _getRegisteredPropertySetup(fullKey, defaultVal);
        return fallback === defaultVal
                ? defaultVal
                : fallback.default
                ;
    }
}

class KeyMomentsController extends _BaseDynamicCollectionContainerComponent {
    constructor(parentAPI, zones, itemEntryPath, ...customArgs) {
        super(parentAPI, zones, itemEntryPath);
        this._customArgs = customArgs;
    }
    _createWrapper(rootPath) {
        const settings = {
               rootPath: rootPath
            }
          , dependencyMappings = [
                //[]
            ]
          , Constructor = KeyMomentController
          , args = [this._zones, ...this._customArgs]
          , childParentAPI = this._childrenParentAPI
          ;
        return this._initWrapper(childParentAPI, settings, dependencyMappings, Constructor, ...args);
    }
}


class InchwormTaskAutomationDialog extends _DialogBase {
    // jshint ignore:start
    static TEMPLATE = `<dialog class="ui_dialog-inchworm">
    <form method="dialog">
      <fieldset>
        <legend>Insert Inchworm -- Task Automation</legend>
        <p>The Inchworm is a run of text that moves across the stage by contracting and expanding its running width.</p>
        <menu>
          <div><span>Font: </span><em class="ui_dialog-inchworm-selected_font"></em></div>
          <label>Text <input
                  class="ui_dialog-inchworm-text"
                  type="text"
                  placeholder="(not initilized)"
                  value="" />
          </label>
          <label>x <input
                  class="ui_dialog-inchworm-x"
                  type="number"
                  value="0" />px
          </label>
          <label>y <input
                  class="ui_dialog-inchworm-y"
                  type="number"
                  value="0" />px
          </label>
          <input type="hidden" class="ui_dialog-inchworm-font" value="(not initialized)" />
          <!-- This is a bit more complicated, but the urgency is big
          <label> Font <select class="ui_dialog-inchworm-font">
          </select></label>
          -->
          <label>Font-Size <input
                  class="ui_dialog-inchworm-font_size"
                  type="number"
                  min="8"
                  value="{set default/current}" />pt
          </label>
          <label> Advancement By <select class="ui_dialog-inchworm-advancement_type">
                <option selected value="repetition">number of repetitions</option>
                <option value="min-distance">minimal distance in px</option>
          </select></label>
          <p><em>Tip:</em> Use a negative advancement value for reverse direction.</p>
          <label>Advancement Value <input
                  class="ui_dialog-inchworm-advancement_value"
                  type="number"
                  value="1" />
          </label>
          <!--
          will animate full wdth/width axis
          other possible values will have to come in a later revision
          -->
          <button type="submit" value="create">Insert Inchworm</button>
          <button>Cancel</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
    // jshint ignore:end
    constructor(domTool) {
        super(domTool);
        this._defaultText = 'Inchworm';
        [this.element, this._formElements] = this._initTemplate();
    }

    _initTemplate() {
        const [dialog] = super._initTemplate()
          , formElements = new Map()
          ;

        for(const entry of [
                        'text', 'x', 'y'
                      //, 'font' postponed
                      , ['selectedFont', 'selected_font']
                      , 'font'
                      , ['fontSize', 'font_size']
                      , ['advancementType', 'advancement_type']
                      , ['advancementValue', 'advancement_value']
        ]) {
            const [key, selectorPart] = typeof entry === 'string' ? [entry, entry] : entry
              , selector = `.ui_dialog-inchworm-${selectorPart !== undefined ? selectorPart : key}`
              , elem = dialog.querySelector(selector)
              ;
            if(!elem)
                throw new Error(`ASSERTION FAILED ${this} an element selected by "${selector}" must be in the TEMLATE.`);
            formElements.set(key, elem);
        }

        formElements.get('text').placeholder = this._defaultText;
        return [dialog, formElements];
    }

    _getFont(parentAPI) {
        const currentRoot = parentAPI.getEntry(parentAPI.rootPath)
          , font = currentRoot.has('font')
                ? currentRoot.get('font').value
                // FIXME: stage doesn't have it, but it probably should have it.
                : parentAPI.getEntry('/font').value
                ;
        return font;
    }

    _updateDefaults(parentAPI) {
        const animationPropertiesPath = `animationProperties@${parentAPI.rootPath.toString()}`
          , animationProperties = parentAPI.getEntry(animationPropertiesPath)
          , propertyValuesMap = animationProperties.propertyValuesMap
            // font = parentAPI.getEntry(lineofTextPath.append('font')).value
          , font = this._getFont(parentAPI)
          ;
        this._formElements.get('selectedFont').textContent = font.nameVersion;
        this._formElements.get('font').value = font.fullName;
        // postponed
        // const fontSelect = this._formElements.get('font');
        // this._domTool.clear(fontSelect);
        // const options = [];
        // for(font of fonts)
        //      options.push(this._domTool.createElement('option', {value: font.key}, font.name))
        // fontSelect.append(...options);
        // fontSelect.value = currentFont
        /// FIXME: hard coded defaults must vanish.
        this._formElements.get('fontSize').value = propertyValuesMap.has('fontSize')
                ? propertyValuesMap.get('fontSize')
                : 25
                ;
    }

    async show(parentAPI, ...args) {
        const promise = super.show()
          , dialog = this.element
          ;
        // add font selection to form
        // set defaults, e.g. for font, font-size
        this._updateDefaults(parentAPI);
        dialog.returnValue = null;
        dialog.showModal();
        const result = await promise;
        if(result !== 'create')
            return;
        else
            return this._create(parentAPI, {
                 text: this._formElements.get('text').value || this._defaultText
               , x: parseFloat(this._formElements.get('x').value || 0)
               , y: parseFloat(this._formElements.get('y').value || 0)
               , font: this._formElements.get('font').value
               , fontSize: parseFloat(this._formElements.get('fontSize').value || 1)
                 // '{type, value}
                 // type: 'min-distance', value: pixels advancement
                 // type: 'repetition', value: number of iterations

               , advancement: {
                     type: this._formElements.get('advancementType').value
                   , value: parseFloat(this._formElements.get('advancementValue').value || 1)
                }
                 // this could be "advanced" interface.
            // , mainAxis: {tag: 'wdth', defaultVal: null}
            // , widthParams: new Map([
            //      //
            //      // 151 - 25 = 126
            //      // 100 / 126 = ~0.794
            //      // 1 - 0.794 = 0.206  => should start at that t ...
            //      // as initially we are going from 151 to 25 with t from
            //      // 0 to 1 => not true, the full circle goes from 0 to 1
            //      //
            //      // measured by hand, we want to start ca. at t = 0.2548
            //      // the durations of both KMs are 1.7 and 1, sum : 2.7
            //      // The first interval is relevant.
            //      //
            //      //
            //      // None of this will be in the iniial, not advanced
            //      // UI, it will use the full wdth range, and begin at the
            //      // default value (that is 100)
            //      ['wdth', [25, 151]] // *main* axis, start at default
            //
            //    // more axes could be added in "advanced" interface
            //    // , ['GRAD', [150, -200]]
            //    // , ['YTLC', [570, 514]]
            //    // , ['YTUC', [760, 712]]
            //    // , ['YTAS', [854, 750]]
            //  ])
            }, ...args);
    }

    /**
     * What we are looking create:
     *  - layer -> repetition time control,
     *    KEY MOMENTS
     *      is a loop and KM0 t === 0 or is end to end
     *      These create the repetitions and must provide the
     *      per repertion advancement
     *      So, timing is required and moving y in a step function
     *      0
     *          duration: 0
     *          x: 0
     *          t: 0
     *      1
     *          duration: 1
     *          x: 0
     *          t: 1
     *      2
     *          duration: 0
     *          x: x += advancement (=== iteration * advancement)
     *          t: 0
     *      3:
     *          duration: 1
     *          x: x += advancement
     *          t: 1
     *    // each repetion is a set of 2 key moments
     *    CHILDREN
     *    - layer -> normalization to axis default value time control,
     *        CHILDREN
     *        - lineOfText
     *          KEY MOMENTS
     *            textContent, does not change so far, whatever the inchworm has to say
     *            one move of the inchworm, switching alignment
     *            requires measurement of width at full expansion
     *            requires measurment of advancement per move
     *            0
     *              duration: 0 // but is also end-to-end
     *              initially text-align: right
     *              width: set to full expansion measurement
     *              x: 0
     *            1
     *              duration: 1 === auto
     *              animate to full contraction
     *              x: 0
     *            2
     *              duration: 0
     *              text-align: left
     *              x: advancement
     *                 so that start of text (end of worm) stays at the same position
     *                 this is the actual advancement
     *                 it's the expanded text width - the contrated text width
     *            3
     *              duration: 1 === auto BUT can be longer, i.e. 1.5, as this
     *                 is the actual forward movement phase, e.g. slower than
     *                 contraction because it needs more force to move the "mass".
     *                 CAUTON: Actually, the other way around looks better:
     *                 slower contraction than expansion.
     *              animate to full expansion
     */
    async _create(parentAPI, options/*, ...args*/) {
        // console.log(`${this}._create options:`, options);
        // create container
        // create line of text
        //     KeyFrame 0 has textContent
        // insert lineOfText into container
        // insert container into parent...

        const font = this._getFont(parentAPI);
        if(options.font !== font.fullName)
            throw new Error(`ASSERTION ERRROR {this} font should be "${font.fullName}" but is "${options.font}"`);

        // console.log('font', font, 'font.axisRanges', font.axisRanges);
        if(!Object.hasOwn(options, 'mainAxis'))
           // can fall back to wdth and fail later if there's no wdth
           options.mainAxis = {name: 'wdth', 'default': null};
           //throw new Error('VALUE ERROR key "mainAxis" missing from options');

        if(!Object.hasOwn(options, 'widthParams'))
           // can fall back to wdth and fail later if there's no wdth
           options.widthParams = new Map();

        if(!Object.hasOwn(font.axisRanges, options.mainAxis.name))
            throw new Error(`VALUE ERRROR {this} font "${font.nameVersion}" doesn't have an "options.mainAxis.name" axis.`);


        // { name: "wdth", min: 25, max: 151, default: 100}
        const mainAxis = font.axisRanges[options.mainAxis.name];
        if(!options.widthParams.has(options.mainAxis.name))
            options.widthParams.set(options.mainAxis.name, [mainAxis.min, mainAxis.max]);

        // use font axis defaults!
        if(!Object.hasOwn(options.mainAxis, 'default') || options.mainAxis['default'] === null)
            options.mainAxis['default'] = mainAxis['default'];
        {
            // Clamp to make sure default is in between widthParams
            // NOTE: so far, theoretically an axis could go from a
            // smaller value to a bigger value and still get narrower,
            // hencem the sorting here, otherwise the clamping could fail.
            const [min, max] = Array.from(options.widthParams.get(options.mainAxis.name)).sort();
            options.mainAxis['default'] = Math.min(Math.max(options.mainAxis['default'], min), max);
        }

        // Zero is not an option.
        // FIXME: the default should depend on the other setup.
        if(options.advancement.value === 0)
            options.advancement.value = 1;

        // FIXME: we should detect if an inchworm doesn't move
        // forward, i.e. because the animated axes don't change the width.
        // Also, if the direction of the animation is wrong/reversed.
        const [containerPath, normalizationContainerPath, lineofTextPath] = await parentAPI.changeState(()=>{
            const activeActors = parentAPI.getEntry(parentAPI.rootPath.append('activeActors'))
              , containerActorDraft = createActor('LayerActorModel', activeActors.dependencies)
              , containerDraft = containerActorDraft.get('instance')//.wrapped
              , normalizationContainerActorDraft = createActor('LayerActorModel', activeActors.dependencies)
              , normalizationContainerDraft = normalizationContainerActorDraft.get('instance')
              , lineOfTextActorDraft = createActor('LineOfTextActorModel', containerActorDraft.dependencies)
              , lineOfTextDraft = lineOfTextActorDraft.get('instance')//.wrapped
              , keyMoments = lineOfTextDraft.get('keyMoments')
              , keyMomentA = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft()
              , keyMomentB = keyMoments.constructor.Model.createPrimalState(keyMoments.dependencies).getDraft()
              , numericPropertiesA = getEntry(keyMomentA, 'numericProperties')
              , axesLocationsA = getEntry(keyMomentA, 'axesLocations')
              , axesLocationsB = getEntry(keyMomentB, 'axesLocations')
              ;
            keyMomentA.get('label').value = '0: Measure Expansion';
            keyMomentB.get('label').value = '0: Measure Contraction';
            keyMomentA.get('textRun').value = options.text;
            keyMomentA.get('fontSize').value = options.fontSize;
            keyMomentA.get('textAlign').value = 'right';
            numericPropertiesA.setSimpleValue('x', 0);
            numericPropertiesA.setSimpleValue('y', 0);

            // FIXME: should be possible to use fontSize
            for(const [property, [/*contracted*/, expanded]] of options.widthParams)
                axesLocationsA.setSimpleValue(property, expanded);
             for(const [property, [contracted/*, expanded*/]] of options.widthParams)
                axesLocationsB.setSimpleValue(property, contracted);


            keyMoments.push(keyMomentA, keyMomentB);
            const normalizationContainerIndex = 0
              , lineOfTextIndex = 0
              ;
            containerDraft.get('activeActors').push(normalizationContainerActorDraft);
            normalizationContainerDraft.get('activeActors').push(lineOfTextActorDraft);
            const containerNewIndex = activeActors.size;
            activeActors.push(containerActorDraft);
            const containerNewPath = parentAPI.rootPath.append('activeActors', containerNewIndex, 'instance')
              , normalizationContainerPath = containerNewPath.append('activeActors', normalizationContainerIndex, 'instance')
              , lineofTextNewPath = normalizationContainerPath.append('activeActors', lineOfTextIndex, 'instance')
              ;
            return [containerNewPath, normalizationContainerPath, lineofTextNewPath];
        });
        // It's interesting, how to keep track of the actor/identity of that
        // actor, we use paths in here, but that's not an id, i.e. not
        // lasting long.
        // Also, it might be possible to measure the text sizes right
        // away, without witing for the insertion to finish, using
        // @animationProperties, whatever we enter here and font-defaults ...
        // However, waiting for insertion and then using @animationProperties
        // should be a bit easier to use.
        const animationPropertiesPath = `animationProperties@${lineofTextPath.toString()}`
          , animationProperties = parentAPI.getEntry(animationPropertiesPath)
          , sample = this._domTool.createElement('span', {'class': 'measure_box-sample'})
          , measureBox = this._domTool.createElement('div', {'class': 'measure_box'}, sample)
          ;
        {
            const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(0)
              , font = parentAPI.getEntry(lineofTextPath.append('font')).value
              ;
            sample.textContent = propertyValuesMap.get('generic/textRun');
            sample.style.setProperty('font-family', `"${font.fullName}"`);
            _setTypographicPropertiesToSample(sample, propertyValuesMap);
        }
        this._domTool.document.body.append(measureBox);
        // DOMRect { x, y, width, height, top, right, bottom, left }
        const  {width:expandedWidth} = sample.getBoundingClientRect();
        {
            const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(animationProperties.animanion.LAST_T);
            _setTypographicPropertiesToSample(sample, propertyValuesMap);
        }
        const {width:contractedWidth} = sample.getBoundingClientRect()
          , advancement = expandedWidth - contractedWidth
          ;

        const advancementSetup = options.advancement
                          ? options.advancement
                          : {type: 'repetition', value: 1}
          , repetitions = advancementSetup?.type === 'min-distance'
                  ? advancementSetup.value / advancement
                  // assert options.advancement.type === 'repetition'
                  : (advancementSetup?.type === 'repetition'
                          ? advancementSetup.value
                          : 1
                  )
          , direction = repetitions >= 0 ? 1 : -1
          , forwardSetup = [['Contraction', 1.7], ['Expansion', 1]]
          , [phaseASetup, phaseBSetup] = direction === 1
                      ? forwardSetup
                      : [...forwardSetup].reverse()
          , iterations = Math.abs(repetitions)
          , [mainAxisContracted, mainAxisEpanded] = options.widthParams.get('wdth')
          , mainAxisDefaultPosition = 100 // start here!
          , mainAxisRange = mainAxisEpanded - mainAxisContracted
          , mainAxisNormalizedDefaultPosition = mainAxisDefaultPosition - mainAxisContracted
          , mainAxisDefaultT = 1 - mainAxisNormalizedDefaultPosition / mainAxisRange
          , [, phaseADuration] = phaseASetup
          , [, phaseBDuration] = phaseBSetup
          , fullDuration = phaseADuration + phaseBDuration
          , phaseAPerFullDiuration = phaseADuration / fullDuration
          , timeShift = direction > 0
                    ? phaseAPerFullDiuration * mainAxisDefaultT
                    : 1 - phaseAPerFullDiuration * mainAxisDefaultT
          ;
        {
            const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(mainAxisDefaultT);
            _setTypographicPropertiesToSample(sample, propertyValuesMap);
        }
        const {width:defaultWidth} = sample.getBoundingClientRect()
          , defaultAdvancement = expandedWidth - defaultWidth
          ;
        // All measurements done, time to finalize the worm.
        measureBox.remove();
        return await parentAPI.changeState(()=>{
            const lineOfTextKeyMoments = parentAPI.getEntry(lineofTextPath.append('keyMoments'));
            {
                /**
                 * 0
                 * duration: 0 // but is also end-to-end
                 * initially text-align: right
                 * width: set to full expansion measurement
                 * x: 0
                 */
                const keyMoment = lineOfTextKeyMoments.get(0)
                  , numericProperties = keyMoment.get('numericProperties')
                  , axesLocations = keyMoment.get('axesLocations')
                  ;
                keyMoment.get('label').value = '0: Initialization';
                keyMoment.get('duration').value = 0;
                keyMoment.get('textAlign').value = 'right';
                numericProperties.setSimpleValue('width', expandedWidth);
                numericProperties.setSimpleValue('x', 0);
                for(const [property, [/*contracted*/, expanded]] of options.widthParams)
                    axesLocations.setSimpleValue(property, expanded);
            }
            {
                /**
                 * 1
                 * duration: 1 === auto
                 * animate to full contraction
                 * x: 0
                 */
                const keyMoment = lineOfTextKeyMoments.constructor.Model.createPrimalState(lineOfTextKeyMoments.dependencies).getDraft()
                  , numericProperties = keyMoment.get('numericProperties')
                  , axesLocations = keyMoment.get('axesLocations')
                  , [phaseALabel, phaseADuration] = phaseASetup
                  ;
                lineOfTextKeyMoments.splice(1, 1, keyMoment);
                keyMoment.get('label').value = `1: ${phaseALabel}`;
                keyMoment.get('duration').value = phaseADuration;
                numericProperties.setSimpleValue('x', 0);
                for(const [property, [contracted/*, expanded*/]] of options.widthParams)
                    axesLocations.setSimpleValue(property, contracted);
            }
            {
                /**
                 * 2
                 * duration: 0
                 * text-align: left
                 * x: advancement
                 *    so that start of text (end of worm) stays at the same position
                 *    this is the actual advancement
                 *    it's the expanded text width - the contrated text width
                 */
                const keyMoment = lineOfTextKeyMoments.constructor.Model.createPrimalState(lineOfTextKeyMoments.dependencies).getDraft()
                  , numericProperties = keyMoment.get('numericProperties')
                  ;
                lineOfTextKeyMoments.push(keyMoment);
                keyMoment.get('label').value = '2: Re-alignment';
                keyMoment.get('duration').value = 0;
                keyMoment.get('textAlign').value = 'left';
                numericProperties.setSimpleValue('x', advancement);
            }
            {
                /**
                 * 3
                 * duration: 1 === auto BUT can be longer, i.e. 1.5, as this
                 * is the actual forward movement phase, e.g. slower than
                 *      contraction because it needs more force to move the "mass".
                 *      CAUTON: Actually, the other way around looks better:
                 *      slower contraction than expansion.
                 *  animate to full expansion
                 */
                const keyMoment = lineOfTextKeyMoments.constructor.Model.createPrimalState(lineOfTextKeyMoments.dependencies).getDraft()
                  , axesLocations = keyMoment.get('axesLocations')
                  , [phaseBLabel, phaseBDuration] = phaseBSetup
                  ;
                lineOfTextKeyMoments.push(keyMoment);
                keyMoment.get('label').value = `3: ${phaseBLabel}`;
                // It's interesting, when moving backwards (to the left)
                // this should be reversed with the contracting duration.
                keyMoment.get('duration').value = phaseBDuration;
                for(const [property, [/*contracted*/, expanded]] of options.widthParams)
                    axesLocations.setSimpleValue(property, expanded);
            }
            // Normalization: Start at default axis positon
            const normalizationContainerKeyMoments = parentAPI.getEntry(normalizationContainerPath.append('keyMoments'));
            {
                // Caution: in lower levels, timing of the timeShift messes with
                // the timing of the x advancement
                // It's simplest to add an outer layer that moves overall timing
                // so, that the start is at the default value. However, this
                // also requires an additional, measured, x offset.
                const keyMomentA = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
                  , keyMomentB = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
                  , keyMomentC = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
                  , keyMomentD = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
                  , numericPropertiesA = keyMomentA.get('numericProperties')
                  , numericPropertiesB = keyMomentB.get('numericProperties')
                  , numericPropertiesC = keyMomentC.get('numericProperties')
                  , numericPropertiesD = keyMomentD.get('numericProperties')
                  ;
                normalizationContainerKeyMoments.push(keyMomentA, keyMomentB, keyMomentC, keyMomentD);
                keyMomentA.get('label').value = `Start Time Control`;
                keyMomentB.get('label').value = `Pin Inital`;
                keyMomentC.get('label').value = `Advance`;
                keyMomentD.get('label').value = `End Time Control`;
                const [posA, posB] = direction > 0
                        ? [-defaultAdvancement ,  advancement-defaultAdvancement]
                        : [-defaultAdvancement ,  -advancement-defaultAdvancement]
                  , [tA, tB] = direction > 0
                        ? [timeShift, 1 + timeShift]
                        : [ 1-timeShift,  -timeShift]
                        ;

                // normalize x coordinate
                keyMomentA.get('duration').value = 0;
                numericPropertiesA.setSimpleValue('x', posA);
                numericPropertiesA.setSimpleValue('t',  tA);

                keyMomentB.get('duration').value = 1-timeShift;
                numericPropertiesB.setSimpleValue('x', posA);

                // jump, this is where the raw animation ends
                keyMomentC.get('duration').value = 0;
                numericPropertiesC.setSimpleValue('x', posB);


                keyMomentD.get('duration').value = timeShift;
                numericPropertiesD.setSimpleValue('t', tB);
                // Not required, as keyMomentA is at the same t because
                // the animation is end to end. Left in here for robustness,
                // i.e. in case the assumption about the isLoop flag changes.
                numericPropertiesD.setSimpleValue('x', posB);
            }
            // Repetitions and Time Control
            const containerKeyMoments = parentAPI.getEntry(containerPath.append('keyMoments'));
            for(let i=0;i<iterations;i++) {
                /**
                 * Each repetion is a set of 2 key moments
                 * A
                 *    duration: 0
                 *    x: x += advancement (=== iteration * advancement)
                 *    t: 0
                 * B:
                 *    duration: 1
                 *    x: x += advancement
                 *    t: 1
                 */
                const keyMomentA = containerKeyMoments.constructor.Model.createPrimalState(containerKeyMoments.dependencies).getDraft()
                  , keyMomentB = containerKeyMoments.constructor.Model.createPrimalState(containerKeyMoments.dependencies).getDraft()
                  , numericPropertiesA = keyMomentA.get('numericProperties')
                  , numericPropertiesB = keyMomentB.get('numericProperties')
                    // last iteration may be a fraction
                  , x = options.x + direction * i * advancement
                  ;
                containerKeyMoments.push(keyMomentA, keyMomentB);
                keyMomentA.get('label').value = `${i}: positioning`;
                keyMomentB.get('label').value = `${i}: time control`;
                keyMomentA.get('duration').value = 0;
                numericPropertiesA.setSimpleValue('x', x);
                if(i===0) {
                    // set once for all
                    keyMomentA.get('positioningHorizontal').value = 'left';
                    if(Object.hasOwn(options, 'y'))
                        numericPropertiesA.setSimpleValue('y', options.y);
                }
                numericPropertiesA.setSimpleValue('t', 0);
                keyMomentB.get('duration').value = 1;
                numericPropertiesB.setSimpleValue('x', x);
                numericPropertiesB.setSimpleValue('t', 1);
            }

        });
    }
}


class CompareLineTaskAutomationDialog extends _DialogBase {
    // jshint ignore:start
    static TEMPLATE = `<dialog class="ui_dialog-compare_line">
    <form method="dialog">
      <fieldset>
        <legend>Compare a Line of Text -- Task Automation</legend>
        <p>Two lines of text with different fonts or different verions of a font are overlayed to create a direct comparison.</p>
        <menu>
          <div><span>Font A: </span><em class="ui_dialog-compare_line-selected_font_a"></em></div>
          <div><span>Font B: </span><em class="ui_dialog-compare_line-selected_font_b"></em></div>
          <label>Text <input
                  class="ui_dialog-compare_line-text"
                  type="text"
                  placeholder="(not initialized)"
                  value="" />
          </label>
          <input type="hidden" class="ui_dialog-compare_line-font_a" value="(not initialized)" />
          <input type="hidden" class="ui_dialog-compare_line-font_b" value="(not initialized)" />
          <!-- This is a bit more complicated, but the urgency is big
          <label> Font <select class="ui_dialog-compare_line-font">
          </select></label>
          -->
          <!-- maybe we can just make it fit width? requires constant
          measuring ...
          maybe this also comes into play when I get feedback...
          -->
          <label>Font-Size <input
                  class="ui_dialog-compare_line-font_size"
                  type="number"
                  min="8"
                  value="{set default/current}" />pt
          </label>
          <!-- TODO: add a color picker -->
          <button type="submit" value="create">Insert Comparison</button>
          <button>Cancel</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
    // jshint ignore:end
    constructor(domTool) {
        super(domTool);
        this._defaultText = 'Handgloves';
        [this.element, this._formElements] = this._initTemplate();
    }

    _initTemplate() {
        const [dialog] = super._initTemplate()
          , formElements = new Map()
          ;
        for(const entry of [
                        'text'
                      , ['selectedFontA', 'selected_font_a']
                      , ['selectedFontB', 'selected_font_b']
                      , ['fontA', 'font_a']
                      , ['fontB', 'font_b']
                      , ['fontSize', 'font_size']
        ]) {
            const [key, selectorPart] = typeof entry === 'string' ? [entry, entry] : entry
              , selector = `.ui_dialog-compare_line-${selectorPart !== undefined ? selectorPart : key}`
              , elem = dialog.querySelector(selector)
              ;
            if(!elem)
                throw new Error(`ASSERTION FAILED ${this} an element selected by "${selector}" must be in the TEMLATE.`);
            formElements.set(key, elem);
        }
        formElements.get('text').placeholder = this._defaultText;
        return [dialog, formElements];
    }

    _getFont(parentAPI) {
        const currentRoot = parentAPI.getEntry(parentAPI.rootPath)
          , font = currentRoot.has('font')
                ? currentRoot.get('font').value
                // FIXME: stage doesn't have it, but it probably should have it.
                : parentAPI.getEntry('/font').value
                ;
        return font;
    }

    _updateDefaults(parentAPI) {
        const animationPropertiesPath = `animationProperties@${parentAPI.rootPath.toString()}`
          , animationProperties = parentAPI.getEntry(animationPropertiesPath)
          , propertyValuesMap = animationProperties.propertyValuesMap
            // font = parentAPI.getEntry(lineofTextPath.append('font')).value
          , font = this._getFont(parentAPI)
          ;
        this._formElements.get('selectedFontA').textContent = font.nameVersion;
        this._formElements.get('selectedFontB').textContent = font.nameVersion;
        this._formElements.get('fontA').value = font.fullName;
        this._formElements.get('fontB').value = font.fullName;
        // postponed
        // const fontSelect = this._formElements.get('font');
        // this._domTool.clear(fontSelect);
        // const options = [];
        // for(font of fonts)
        //      options.push(this._domTool.createElement('option', {value: font.key}, font.name))
        // fontSelect.append(...options);
        // fontSelect.value = currentFont
        /// FIXME: hard coded defaults must vanish.
        this._formElements.get('fontSize').value = propertyValuesMap.has('fontSize')
                ? propertyValuesMap.get('fontSize')
                : 65
                ;
    }

    async show(parentAPI, ...args) {
        const promise = super.show()
          , dialog = this.element
          ;
        // add font selection to form
        // set defaults, e.g. for font, font-size
        this._updateDefaults(parentAPI);
        dialog.returnValue = null;
        dialog.showModal();
        const result = await promise;
        if(result !== 'create')
            return;
        else
            return this._create(parentAPI, {
                 text: this._formElements.get('text').value || this._defaultText
               , fontA: this._formElements.get('fontA').value
               , fontB: this._formElements.get('fontB').value
               , fontSize: parseFloat(this._formElements.get('fontSize').value || 1)
               , colorA: {mode: 'oklch', l: 0.7, c: 0.2, h: 0.7 * 360, alpha: 1}
               , colorB: {mode: 'oklch', l: 0.7, c: 0.2, h: 0.97 * 360, alpha: 0.6}
            }, ...args);
    }
    async _create(parentAPI, options/*, ...args*/) {
        // console.log(`${this}._create options:`, options);
        // create container
        // create line of text
        //     KeyFrame 0 has textContent
        // insert lineOfText into container
        // insert container into parent...

        const fontA = this._getFont(parentAPI);
        if(options.fontA !== fontA.fullName)
            throw new Error(`ASSERTION ERRROR {this} font-A should be "${fontA.fullName}" but is "${options.fontA}"`);
        if(options.fontB !== fontA.fullName)
            throw new Error(`ASSERTION ERRROR {this} font-B should be "${fontA.fullName}" but is "${options.fontB}"`);


        // TODO: to begin with create a comparison animation along the wdth axis
        // console.log('font', font, 'font.axisRanges', font.axisRanges);
        if(!Object.hasOwn(options, 'mainAxis'))
           // can fall back to wdth and fail later if there's no wdth
           options.mainAxis = {name: 'wght', 'default': null};
           //throw new Error('VALUE ERROR key "mainAxis" missing from options');

        if(!Object.hasOwn(options, 'widthParams'))
           // can fall back to wdth and fail later if there's no wdth
           options.widthParams = new Map();

        if(!Object.hasOwn(fontA.axisRanges, options.mainAxis.name))
            throw new Error(`VALUE ERRROR {this} font "${fontA.nameVersion}" doesn't have an "options.mainAxis.name" axis.`);


        // { name: "wdth", min: 25, max: 151, default: 100}
        const mainAxis = fontA.axisRanges[options.mainAxis.name];
        if(!options.widthParams.has(options.mainAxis.name))
            options.widthParams.set(options.mainAxis.name, [mainAxis.min, mainAxis.max]);

        // use font axis defaults!
        if(!Object.hasOwn(options.mainAxis, 'default') || options.mainAxis['default'] === null)
            options.mainAxis['default'] = mainAxis['default'];
        {
            // Clamp to make sure default is in between widthParams
            // NOTE: so far, theoretically an axis could go from a
            // smaller value to a bigger value and still get narrower,
            // hencem the sorting here, otherwise the clamping could fail.
            const [min, max] = Array.from(options.widthParams.get(options.mainAxis.name)).sort();
            options.mainAxis['default'] = Math.min(Math.max(options.mainAxis['default'], min), max);
        }

        console.log('options', options);

        // FIXME: we should detect if an inchworm doesn't move
        // forward, i.e. because the animated axes don't change the width.
        // Also, if the direction of the animation is wrong/reversed.
        const [controlLayerPath, lineofTextAPath, lineOfTextBPath] = await parentAPI.changeState(()=>{
            const activeActors = parentAPI.getEntry(parentAPI.rootPath.append('activeActors'))
              , controlLayerActorDraft = createActor('LayerActorModel', activeActors.dependencies)
              , controlLayerDraft = controlLayerActorDraft.get('instance')//.wrapped
              , lineOfTextAActorDraft = createActor('LineOfTextActorModel', controlLayerActorDraft.dependencies)
              , lineOfTextADraft = lineOfTextAActorDraft.get('instance')//.wrapped
              , lineOfTextBActorDraft = createActor('LineOfTextActorModel', controlLayerActorDraft.dependencies)
              , lineOfTextBDraft = lineOfTextBActorDraft.get('instance')//.wrapped
              , keyMomentsCtrl = controlLayerDraft.get('keyMoments')
              // , keyMomentsA = lineOfTextADraft.get('keyMoments')
              // , keyMomentsB = lineOfTextBDraft.get('keyMoments')
              , keyMomentCtrlSettings = keyMomentsCtrl.constructor.Model.createPrimalState(keyMomentsCtrl.dependencies).getDraft()
              , keyMomentCtrlA = keyMomentsCtrl.constructor.Model.createPrimalState(keyMomentsCtrl.dependencies).getDraft()
              , keyMomentCtrlB = keyMomentsCtrl.constructor.Model.createPrimalState(keyMomentsCtrl.dependencies).getDraft()
              // These will be set via controlLayer
              , numericPropertiesCtrlSettings = getEntry(keyMomentCtrlSettings, 'numericProperties')
              , axesLocationsCtrlA = getEntry(keyMomentCtrlA, 'axesLocations')
              , axesLocationsCtrlB = getEntry(keyMomentCtrlB, 'axesLocations')
              , keyMomentsLOTA = lineOfTextADraft.get('keyMoments')
              , keyMomentsLOTB = lineOfTextBDraft.get('keyMoments')
              , keyMomentLOTASettings = keyMomentsLOTA.constructor.Model.createPrimalState(keyMomentsLOTA.dependencies).getDraft()
              , keyMomentLOTBSettings = keyMomentsLOTB.constructor.Model.createPrimalState(keyMomentsLOTB.dependencies).getDraft()
              ;
            // will be inherited by the lineOfText-children
            keyMomentCtrlSettings.get('textRun').value = options.text;
            keyMomentCtrlSettings.get('fontSize').value = options.fontSize;
            keyMomentCtrlSettings.get('textAlign').value = 'center';
            keyMomentCtrlSettings.get('heightTreatment').value = 'baselineToBottomFix';
            keyMomentCtrlSettings.get('positioningVertical').value = 'bottom';
            // Center vertically ... requires measurement
            // numericPropertiesCtrlSettings.setSimpleValue('x', 0);
            numericPropertiesCtrlSettings.setSimpleValue('y', 350);

            // give them names
            keyMomentCtrlSettings.get('label').value = `Settings`;
            keyMomentCtrlA.get('duration').value = 0;
            keyMomentCtrlA.get('label').value = `Axis max. ${mainAxis.name} and settings`;
            keyMomentCtrlB.get('label').value = `Axis min ${mainAxis.name}`;
            // FIXME: should be possible to use fontSize
            for(const [property, [/*contracted*/, expanded]] of options.widthParams)
                axesLocationsCtrlA.setSimpleValue(property, expanded);
            for(const [property, [contracted/*, expanded*/]] of options.widthParams)
                axesLocationsCtrlB.setSimpleValue(property, contracted);
            keyMomentsCtrl.push(keyMomentCtrlSettings, keyMomentCtrlA, keyMomentCtrlB);

            if(options.colorA) {
                const color = culoriToColor(options.colorA, keyMomentLOTASettings.dependencies);
                console.log('options.colorA', options.colorA, 'color', color);
                keyMomentLOTASettings.set('textColor', color);
                keyMomentCtrlA.get('label').value = 'Settings';
                keyMomentsLOTA.push(keyMomentLOTASettings);

            }
            if(options.colorB) {
                const color = culoriToColor(options.colorB, keyMomentLOTBSettings.dependencies);
                console.log('options.colorB', options.colorB, 'color', color);
                keyMomentLOTBSettings.set('textColor', color);
                keyMomentCtrlB.get('label').value = 'Settings';
                keyMomentsLOTB.push(keyMomentLOTBSettings);
            }

            const lineOfTextAIndex = 0
              , lineOfTextBIndex = 1
              , controlLayerNewIndex = activeActors.size
              ;
            controlLayerDraft.get('activeActors').push(
                            lineOfTextAActorDraft, lineOfTextBActorDraft);
            activeActors.push(controlLayerActorDraft);

            const controlLayerPath = parentAPI.rootPath.append('activeActors', controlLayerNewIndex, 'instance')
              , lineofTextAPath = controlLayerPath.append('activeActors', lineOfTextAIndex, 'instance')
              , lineofTextBPath = controlLayerPath.append('activeActors', lineOfTextBIndex, 'instance')
              ;
            return [controlLayerPath, lineofTextAPath, lineofTextBPath];
        });
    }
}


class UISelectTaskAutomation extends _BaseComponent {
    //jshint ignore:start
        static TEMPLATE = `<div class="ui_select_task_automation">
        <!-- insert: select-widget -->
        <button class="ui_select_task_automation-execute">run</button>
</div>`;
    //jshint ignore:end
     constructor (parentAPI, items) {
        super(parentAPI);

        this._items = items;
        const itemKeyTolabels = new Map(Array.from(this._items.entries())
                    .map(([key, [label/*, TaskAutomationDialog */]])=>[key, label]));
        [this.element, this._select] = this.initTemplate(itemKeyTolabels);
        this._dialog = null;
    }

    initTemplate(items) {
        const frag = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE)
          , element = frag.firstElementChild
          , select = new PlainSelectInput(this._domTool, null, 'Task Automation', items)
          , button = element.querySelector('.ui_select_task_automation-execute')
          ;
        button.addEventListener('click', ()=>this._executeItem(this._select._input.value));
        this._domTool.insertAtMarkerComment(element, 'insert: select-widget', select.element);
        this._insertElement(element);
        return [element, select];
    }

    async _executeItem(key) {
        if(this._dialog !== null)
            console.error(`${this}._executeItem can't execute this._dialog is not empty`);
        let result = null;
        const [/*label*/, TaskAutomationDialog] = this._items.get(key);
        this._dialog = new TaskAutomationDialog(this._domTool);

        try {
          // FIXME: it would be good to have this guarded in a kind of
          // transaction, so that only this thread can manipulate
          // the global state until it is finished. So far, that is
          // only "informal", as the dialog is modal. Ideally, we could
          // "lock" the sub-element that we are working on. In case of
          // an error, we could just put the original sub element back
          // in place.
          result = await this._dialog.show(this.parentAPI);
        }
        catch(error) {
            console.error(`TASK_AUTOMATION_DIALOG ERROR ${this}._executeItem with "${key}":`, error);
        }
        finally {
            if(this._dialog) {
                this._dialog.destroy();
                this._dialog = null;
            }
        }
        return result;
    }

    destroy() {
        if(this._dialog) {
            this._dialog.destroy();
            this._dialog = null;
        }
        return super.destroy();
    }

    // update(/* changeMap*/) {
        // pass
    // }
}

const CONTAINER_TASK_AUTOMATIONS = Object.freeze(new FreezableMap([
    ['comparison', ['Compar-A-Line', CompareLineTaskAutomationDialog]]
  , ['inchworm', ['The Inchworm', InchwormTaskAutomationDialog]]
]));


class PropertiesManager extends _CommonContainerComponent {
    // jshint ignore:start
    /**
     * could be as well:
     * initialUpdate(...args){
     *     return _BaseDynamicCollectionContainerComponent.prototype.initialUpdate.call(this, ...args);
     * }
     */
    initialUpdate = _BaseDynamicCollectionContainerComponent.prototype.initialUpdate;
    // jshint ignore:end
    constructor(parentAPI, zones) {
        // provision widgets dynamically!
        super(parentAPI, zones);
        this._currentActorTypeKey = null;
    }
    get dependencies() {
        const dependencies = super.dependencies;
        dependencies.add(this.parentAPI.getExternalName('actorPath'));
        // Seem not required: the child will define this dependency:
        //
        // const actorsPathStr = this.parentAPI.getExternalName('actors')
        //   , actorsPath = Path.fromString(actorsPathStr)
        //   , actorPath = this.getEntry('actorPath')
        //   ;
        // if(!actorPath.isEmpty) {
        //     // get info when active actor changes, on type change, we want
        //     // to change the widgets
        //
        //     const absoluteActorsPath = actorsPath.append(...actorPath.value);
        //     dependencies.add(absoluteActorsPath.toString());
        // }
        return dependencies;
    }
    get modelDependencies() {
        const dependencies = super.modelDependencies;
        dependencies.add(this.parentAPI.getExternalName('actorPath'));
        return dependencies;
    }

    _createStageWrappers() {
        const widgetRootPath = Path.fromString(this.parentAPI.getExternalName('stage'))
          , keyMomentsMain = this._domTool.createElement('ol', {'class': 'ui_zone-key_moments_main'})
          , animationPropertiesPath = `animationProperties@${widgetRootPath}`
          ;

        const widgets = [
            getBasicPlayerControlWidgets({zone: 'main', rootPath: widgetRootPath}).isLoop
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                ]
              , UISelectTaskAutomation
              , CONTAINER_TASK_AUTOMATIONS
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    'keyMoments'
                  , [animationPropertiesPath, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                ]
              , CommonActorProperties // Constructor
              , '[STAGE:null]'// has no typeKey, but is also no Type....
              // , ...args
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    ['keyMoments', 'keyMoments']
                  , [animationPropertiesPath, '@animationProperties']
                ]
              , KeyMomentsControls
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'main'}
              , []
              , StaticNode
              , keyMomentsMain
            ]
          , [
                {
                    rootPath: widgetRootPath
                }
              , [
                    ['keyMoments', 'collection'] // itemsCollectionName
                ]
              , KeyMomentsController
                // the children of this will insert their "main"
                // into keyMomentsMain
              ,  new Map([...this._zones, ['main', keyMomentsMain]]) // zones
                // it's already in rootPath!
              , []// 'keyMoment' // itemEntryPath within the item at itemsCollectionName[i]
              , '[STAGE:null]'// has no typeKey, but is also no Type....
            ]
            // TODO: add widgets for specific aspects of the actorType
        ];
        // this._initWrapper(this._childrenParentAPI, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenParentAPI, ...widgetArgs));
    }
    _createActorWrappers(actorPath, actor) {
        const typeKey = actor.get('actorTypeKey').value
          , actorsPath = Path.fromString(this.parentAPI.getExternalName('actors'))
          // , actorTypeModel = actor.get('actorTypeModel')
          // , typeLabel = actorTypeModel.get('label').value
          // , typeClass = actorTypeModel.get('typeClass').value
          // actor.get('instance')
          , widgetRootPath = actorsPath.append(...actorPath, 'instance')
          , keyMomentsMain = this._domTool.createElement('ol', {'class': 'ui_zone-key_moments_main'})
          , actorSpecificWidgets  = []
          , animationPropertiesPath = `animationProperties@${widgetRootPath}`
          ;
        if(['LayerActorModel', 'LineOfTextActorModel'].includes(typeKey)) {
            // has typographyActorMixin
            actorSpecificWidgets.push(
            [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                    ['/availableFonts', 'options']
                  , ['localActiveFontKey', 'activeFontKey']
                ]
              , FontSelect
              , true
            ]);
        }
        if(typeKey === 'LayerActorModel') {
            actorSpecificWidgets.push(
            [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                // dependencyMappings
                // path => as internal name
                ]
              , UISelectTaskAutomation
              , CONTAINER_TASK_AUTOMATIONS
            ]);
        }
        if(typeKey === 'LineOfTextActorModel') {
            // textRun is now part of the KeyMoments as generic/textRun
            // actorSpecificWidgets.push([
            //     {
            //         rootPath: widgetRootPath
            //       , zone: 'main'
            //     }
            //   , [
            //         ['text', 'value']
            //     ]
            //   , UILineOfTextInput
            //   , 'Text'
            // ]);
        }
        const widgets = [
            [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'}
              , [
                    [animationPropertiesPath, '@animationProperties']
                  , 'keyMoments'
                ]
              , UIActorTimeControlKeyMomentSelectCircle
            ]
          , getBasicPlayerControlWidgets({zone: 'main', rootPath: widgetRootPath}).isLoop
          , ...actorSpecificWidgets
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    'keyMoments'
                  , [animationPropertiesPath, '@animationProperties']
                  , ['/activeState/t', 'globalT']
                ]
              , CommonActorProperties // Constructor
              , typeKey
              // , ...args
            ]
          , [
                {
                    rootPath: widgetRootPath
                  , zone: 'main'
                }
              , [
                    ['keyMoments', 'keyMoments']
                  , [animationPropertiesPath, '@animationProperties']
                ]
              , KeyMomentsControls
            ]
          , [
                // This will act as a placeholder/container element.
                // It also takes care that the element is inserted and
                // later removed again.
                {zone: 'main'}
              , []
              , StaticNode
              , keyMomentsMain
            ]
          , [
                {
                    rootPath: widgetRootPath
                }
              , [
                    ['keyMoments', 'collection'] // itemsCollectionName
                ]
              , KeyMomentsController
                // the children of this will insert their "main"
                // into keyMomentsMain
              ,  new Map([...this._zones, ['main', keyMomentsMain]]) // zones
                // it's already in rootPath!
              , []// 'keyMoment' // itemEntryPath within the item at itemsCollectionName[i]
              , typeKey
            ]
        ];
        // this._initWrapper(this._childrenParentAPI, settings, dependencyMappings, Constructor, ...args);
        return widgets.map(widgetArgs=>this._initWrapper(this._childrenParentAPI, ...widgetArgs));
    }

    _provisionWidgets(compareResult) {
        const changedMap = this._getChangedMapFromCompareResult(compareResult)
          , actorPathOrEmpty = changedMap.has('actorPath')
                ? changedMap.get('actorPath')
                : this.getEntry('actorPath')
           , actors = changedMap.has('actors')
                ? changedMap.get('actors')
                : this.getEntry('actors')
           , actor = !actorPathOrEmpty.isEmpty
                  // If path can't be resolved actor becomes null, no Error
                  // This is because there's no ForeignKey constraint
                  // for long paths currently.
                ? getEntry(actors, actorPathOrEmpty.value, null)
                : null
           , actorTypeKey = actor === null ? null : actor.get('actorTypeKey').value
           , typeChanged = this._currentActorTypeKey !== actorTypeKey
           , rebuild = changedMap.has('actorPath') || typeChanged
           ;
        this._currentActorTypeKey = actorTypeKey;

        if(rebuild) {
            // deprovision widgets
            for(const widgetWrapper of this._widgets)
                widgetWrapper.destroy();
            this._widgets.splice(0, Infinity); // equivalent to clear() in a map
        }
        const requiresFullInitialUpdate = new Set();

        // Keeping for debugging for now:
        // console.log(`${this.constructor.name}._provisionWidgets(compareResult):`, ...changedMap.keys()
        //     , `\n actor !== null`, actor !== null
        //     , `\n changedMap.has('actorPath')`, changedMap.has('actorPath')
        //     , `\n typeChanged`, typeChanged, `actorTypeKey`, actorTypeKey
        //     , `\n rebuild`, rebuild
        // )

        const widgetWrappers = [];

        if(actor !== null && rebuild) {
            // If widget types change this has to react as well
            // and actorPath could be present, but the actor could not be
            // in actors anymore, as we can't use ForeingKey constraints
            // with this link currently!
            widgetWrappers.push(...this._createActorWrappers(actorPathOrEmpty.value, actor));
        }
        else if(rebuild) {
            // The StageAndActorsModel actually functions as the root
            // of all properties, so we manage the stage when we don't
            // manage another actor...
            widgetWrappers.push(...this._createStageWrappers());
        }

        this._widgets.push(...widgetWrappers);
        for(const widgetWrapper of widgetWrappers) {
            this._createWidget(widgetWrapper);
            requiresFullInitialUpdate.add(widgetWrapper);
        }

        return requiresFullInitialUpdate;
    }
}

class StageAndActorsController extends _BaseContainerComponent {
    constructor(parentAPI, zones) {
        parentAPI.wrapper.setProtocolHandlerImplementation(
            ...AnimationPropertiesProtocolHandler.create('animationProperties@'));
        const widgets = [
            [
                {}
              , [ 't', 'duration', 'playing', 'perpetual']
              , AnimationTGenerator
            ]
          , [
                {}
              , [
                    ['t', 'globalT'], 'keyMoments', 'isLoop'
                    // NOT required as this is the root. However, it could
                    // be used here as well e.g. to inject global defaults'.
                    // parent is always two levels above from here
                    // as this is {index}/instance
                    //, [`animationProperties@${parentAPI.rootPath.append('..', '..')}`, '@parentProperties']
                ]
              , ContainerMeta
              , zones
            ]
          , ...Object.entries(getBasicPlayerControlWidgets({zone: 'before-layout'}))
                                    .filter(([k,/*v*/])=>k!=='isLoop').map(([k,v])=>v)
          , [
                {zone: 'main'}
              , [
                    't', 'playing'
                ]
              , UITimeControlCircle
            ]
          , [
                {zone: 'layout'}
              , []
              , StageHTML
              , zones
              , 'stage_and_actors'
            ]
            // Part of StageManger: select type and drag into StageManger
            // to create it add the drop position.
          , [
                {
                    zone: 'main'
                }
              , [
                    ['availableActorTypes', 'sourceTypes']
                ]
              , SelectAndDrag
              , 'Create'
              , 'drag and drop into Stage Manager.'
              , function setDragDataFN(dataTransfer, selectedValue) {
                    dataTransfer.setData('text/plain', `[TypeRoof actor create: ${selectedValue}]`);
                    dataTransfer.setData(DATA_TRANSFER_TYPES.ACTOR_CREATE, `${selectedValue}`);
                }
            ]
          , [
                {
                    zone: 'main'
                }
              , [
                    ['activeActors', 'rootCollection']

                ]
              , WasteBasketDropTarget
              , 'Remove actor'
              , 'drag and drop into bin from Stage Manager.'
              , [DATA_TRANSFER_TYPES.ACTOR_PATH]
            ]
          , [
                {
                    zone: 'main'
                }
              , [
                    'activeActors', 'editingActor'
                  , ['availableActorTypes', 'sourceTypes']
                ]
              , StageManager
            ]
          , [
                {}
              , [
                    ['editingActor', 'actorPath']
                  , ['activeActors', 'actors']
                  , [parentAPI.rootPath.toString(), 'stage']
                ]
              , PropertiesManager
              , zones
            ]
        ];
        super(parentAPI, zones, widgets);

        /**
         * Keeping this a bit longer to lookup automated
         * state creation, but this block will be removed in the future.
        setTimeout(this._changeStateHandler(()=>{
            // setting up more development fixture
            // a layer containing
            //     circle #1 so it is reused (used twice)
            //     circle #2

            const state = this.getEntry(this.parentAPI.rootPath)
              , activeActors = state.get('activeActors')
              ;
            const layerTypeKey = 'LayerActorModel'
              , layerActorDraft = createActor(layerTypeKey, activeActors.dependencies)
              , layerDraft = layerActorDraft.get('instance').wrapped
              ;
            activeActors.push(layerActorDraft);

            for(let i=0;i<2;i++) {
                const circleTypeKey = 'CircleActorModel'
                  , circleActorDraft = createActor(circleTypeKey, activeActors.dependencies)
                  // , circelDraft = circleActorDraft.get('instance').wrapped
                  ;
                // circelDraft.get('x').value = 332;
                // circelDraft.get('y').value = 100 * i + 52;
                // circelDraft.get('radius').value = 43;
                layerDraft.get('activeActors').push(circleActorDraft);
            }
            const LinoOfTextTypeKey = 'LineOfTextActorModel'
              , lotActorDraft = createActor(LinoOfTextTypeKey, activeActors.dependencies)
              // , lotDraft = lotActorDraft.get('instance').wrapped
              ;
            // lotDraft.get('text').value = 'Hello World';
            layerDraft.get('activeActors').push(lotActorDraft);

            setTimeout(this._changeStateHandler(()=>{
                const activeActors = this.getEntry(this.parentAPI.rootPath + '/activeActors/0/instance/activeActors');
                activeActors.push(layerActorDraft);
            }), 1000);
        }), 1000);
        */
    }
    update(...args) {
        this.parentAPI.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.update(...args);
    }
    initialUpdate(...args) {
        this.parentAPI.wrapper.getProtocolHandlerImplementation('animationProperties@').resetUpdatedLog();
        super.initialUpdate(...args);
    }
}

export {
    StageAndActorsModel as Model
  , StageAndActorsController as Controller
};
