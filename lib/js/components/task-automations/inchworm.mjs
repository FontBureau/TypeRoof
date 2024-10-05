/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement
import {
    getEntry
} from '../../metamodel.mjs';

import {
    _DialogBase
} from '../basics.mjs';

import {
    createActor
} from '../actors/actors-base.mjs';

import {
    setTypographicPropertiesToSample
} from '../actors/properties-util.mjs';

export class InchwormTaskAutomationDialog extends _DialogBase {
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

    _getFont(widgetBus) {
        const currentRoot = widgetBus.getEntry(widgetBus.rootPath)
          , font = currentRoot.has('font')
                ? currentRoot.get('font').value
                // FIXME: stage doesn't have it, but it probably should have it.
                : widgetBus.getEntry('/font').value
                ;
        return font;
    }

    _updateDefaults(widgetBus) {
        const animationPropertiesPath = `animationProperties@${widgetBus.rootPath.toString()}`
          , animationProperties = widgetBus.getEntry(animationPropertiesPath)
          , propertyValuesMap = animationProperties.propertyValuesMap
            // font = widgetBus.getEntry(lineofTextPath.append('font')).value
          , font = this._getFont(widgetBus)
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

    async show(widgetBus, ...args) {
        const promise = super.show()
          , dialog = this.element
          ;
        // add font selection to form
        // set defaults, e.g. for font, font-size
        this._updateDefaults(widgetBus);
        dialog.returnValue = null;
        dialog.showModal();
        const result = await promise;
        if(result !== 'create')
            return;
        else
            return this._create(widgetBus, {
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
    async _create(widgetBus, options/*, ...args*/) {
        // console.log(`${this}._create options:`, options);
        // create container
        // create line of text
        //     KeyFrame 0 has textContent
        // insert lineOfText into container
        // insert container into parent...

        const font = this._getFont(widgetBus);
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
        const [containerPath, normalizationContainerPath, lineofTextPath] = await widgetBus.changeState(()=>{
            const activeActors = widgetBus.getEntry(widgetBus.rootPath.append('activeActors'))
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

            containerDraft.get('label').value = 'Inchworm';
            normalizationContainerDraft.get('label').value = 'normalization';
            lineOfTextDraft.get('label').value = 'Body';

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
            const containerNewPath = widgetBus.rootPath.append('activeActors', containerNewIndex, 'instance')
              , normalizationContainerPath = containerNewPath.append('activeActors', normalizationContainerIndex, 'instance')
              , lineofTextNewPath = normalizationContainerPath.append('activeActors', lineOfTextIndex, 'instance')
              ;
            return [containerNewPath, normalizationContainerPath, lineofTextNewPath];
        });
        // It's interesting, how to keep track of the actor/identity of that
        // actor, we use paths in here, but that's not an id, i.e. not
        // lasting long.
        // Also, it might be possible to measure the text sizes right
        // away, without waiting for the insertion to finish, using
        // animationProperties@, whatever we enter here and font-defaults ...
        // However, waiting for insertion and then using animationProperties@
        // should be a bit easier to use.
        const animationPropertiesPath = `animationProperties@${lineofTextPath.toString()}`
          , animationProperties = widgetBus.getEntry(animationPropertiesPath)
          , sample = this._domTool.createElement('span', {'class': 'measure_box-sample'})
          , measureBox = this._domTool.createElement('div', {'class': 'measure_box'}, sample)
          ;
        {
            const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(0)
              , font = widgetBus.getEntry(lineofTextPath.append('font')).value
              ;
            sample.textContent = propertyValuesMap.get('generic/textRun');
            sample.style.setProperty('font-family', `"${font.fullName}"`);
            setTypographicPropertiesToSample(sample, propertyValuesMap);
        }
        this._domTool.document.body.append(measureBox);
        // DOMRect { x, y, width, height, top, right, bottom, left }
        const  {width:expandedWidth} = sample.getBoundingClientRect();
        {
            const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(animationProperties.animanion.LAST_T);
            setTypographicPropertiesToSample(sample, propertyValuesMap);
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
          , phaseAPerFullDuration = phaseADuration / fullDuration
          , timeShift = direction > 0
                    ? phaseAPerFullDuration * mainAxisDefaultT
                    : 1 - phaseAPerFullDuration * mainAxisDefaultT
          ;
        {
            const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(mainAxisDefaultT);
            setTypographicPropertiesToSample(sample, propertyValuesMap);
        }
        const {width:defaultWidth} = sample.getBoundingClientRect()
          , defaultAdvancement = expandedWidth - defaultWidth
          ;
        // All measurements done, time to finalize the worm.
        measureBox.remove();
        return await widgetBus.changeState(()=>{
            const lineOfTextKeyMoments = widgetBus.getEntry(lineofTextPath.append('keyMoments'));
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
            const normalizationContainerKeyMoments = widgetBus.getEntry(normalizationContainerPath.append('keyMoments'));
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
            const containerKeyMoments = widgetBus.getEntry(containerPath.append('keyMoments'));
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
