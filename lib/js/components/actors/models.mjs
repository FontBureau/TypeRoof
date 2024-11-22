/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    ForeignKey
  // , unwrapPotentialWriteProxy
  , CoherenceFunction
  , BooleanModel
  , BooleanDefaultTrueModel
  , StringModel
  , NumberModel
  , ValueLink
  , FallBackValue
  , InternalizedDependency
  , _AbstractStructModel
  , _AbstractOrderedMapModel
  , _AbstractListModel
  , _AbstractSimpleOrEmptyModel
  , _AbstractEnumModel
  , ResourceRequirement
  , keyConstraintError
} from '../../metamodel.mjs';

import {
    InstalledFontsModel
  , InstalledFontModel
} from '../main-model.mjs';

import {
    ColorModel
} from '../color.mjs';

import {
    keyMomentBaseModelMixin // duration, label
}  from '../animation-fundamentals.mjs';

import {
    manualAxesLocationsModelMixin
} from '../ui-manual-axis-locations.mjs';

export const NumericPropertiesModel = _AbstractOrderedMapModel.createClass('NumericPropertiesModel', NumberModel)
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
      , ...manualAxesLocationsModelMixin // requires font, fontSize: NOT ANYMORE!
      , ...typographyKeyMomentPureModelMixin
    ]
  , stageKeyMomentModelMixin = [
        ...keyMomentModelMixin
      , ...manualAxesLocationsModelMixin // requires font, fontSize: NOT ANYMORE!
      , ['fontSize', FontSizeModel]
      , ['textColor', ColorModel] // inherited from upper layers
      , ['stageBackgroundColor', ColorModel] // not inherited
    ]
  , TypographyKeyMomentModel = _AbstractStructModel.createClass(
        'TypographyKeyMomentModel'
      , ...typographyKeyMomentModelMixin
    )
  , StageKeyMomentModel = _AbstractStructModel.createClass(
        'StageKeyMomentModel'
      , ...stageKeyMomentModelMixin
    )
  , BooleanOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(BooleanModel)
  , BooleanDefaultTrueOrEmptyModel = _AbstractSimpleOrEmptyModel.createClass(BooleanDefaultTrueModel)
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
  , StageKeyMomentsModel = _AbstractListModel.createClass('StageKeyMomentsModel', StageKeyMomentModel)
  , TypeSettingKeyMomentsModel = _AbstractListModel.createClass('TypeSettingKeyMomentsModel', TypeSettingKeyMomentModel)
  , typographyActorMixin = [
        ['installedFonts', new InternalizedDependency('installedFonts', InstalledFontsModel)]
      , ['parentFont', new InternalizedDependency('font', InstalledFontModel)]
        // FIXME: the custom constraint is very similar to the
        // font(resource)-loading constraint of main-model "activeFontKey"
        //    => should not be required this way, a central copy would be better!
        // The difference is here the last parameter of new ResourceRequirement
        // is ForeignKey.SET_NULL and for "activeFontKey" it is ForeignKey.SET_DEFAULT_FIRST
        // However, this ForeignKey is set to ALLOW_NULL and "activeFontKey"
        // is set to NOT_NULL.
      , ['localActiveFontKey', new ForeignKey('installedFonts', ForeignKey.ALLOW_NULL, ForeignKey.CUSTOM,
        function* (targetContainer, currentKeyValue) {
            // With this shortcut we can prevent the yield and this
            // don't fail when running with driveResolverGenSyncFailing.
            if(this.allowNull && (!currentKeyValue || currentKeyValue === ForeignKey.NULL))
                return ForeignKey.NULL;
            const key = yield new ResourceRequirement(this, targetContainer, currentKeyValue,
                // ForeignKey.SET_DEFAULT_FIRST would be very opinionated,
                // it should rather be configured in the key than hard coded
                // in here.
                this.allowNull ? ForeignKey.SET_NULL : ForeignKey.NO_ACTION
            );
            if(!targetContainer.has(key)) {
                if(this.allowNull)
                    return ForeignKey.NULL;
                // NOTE: this implies targetContainer can change between
                // yield and its return.
                throw keyConstraintError(new Error(`CONSTRAINT ERROR ${this} Can't set key from requested `
                    + `ResourceRequirement ${key.toString()} is not in targetContainer "${this.targetName}" or NULL.`));
            }
            return key;
        })]
      , ['localFont', new ValueLink('localActiveFontKey')]
      , ['font', new FallBackValue('localFont', 'parentFont', InstalledFontModel)]
    ]
  ;
