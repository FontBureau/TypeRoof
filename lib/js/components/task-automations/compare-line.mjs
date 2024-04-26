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
    culoriToColor
} from '../color.mjs';

export class CompareLineTaskAutomationDialog extends _DialogBase {
    // jshint ignore:start
    static TEMPLATE = `<dialog class="ui_dialog-compare_line">
    <form class="ui_dialog-compare_line-form" method="dialog">
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
          <button type="submit" value="cancel">Cancel</button>
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
                      , 'form'
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

        formElements.get('fontSize').addEventListener('change', (event)=>{
            console.log('changed font size', event.target.value);
        });

        // OK, so this works.
        formElements.get('form').addEventListener('submit', (event)=>{
            console.log(`${this} submit form`, event.submitter.value, event);

            if(event.submitter.value === 'cancel')
                return;
            const [valid, message] = this._validate();
            if(!valid) {
                event.preventDefault();
                console.log(`INVALID: ${message}`, event);
            }
            // this._testingParameter = event.target.value;
        });


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
    _validate() {
        const fontSizeUI = this._formElements.get('fontSize')
          , fontSize = parseFloat(fontSizeUI.value || 1)
          ;
        if(fontSize === 123) {
        //    complicated, as, when set, prevents the submit event.
        //    fontSizeUI.setCustomValidity('');
            return [true, null];
        }
        // fontSizeUI.setCustomValidity(`font size is not 123 but instead ${fontSize}`);
        return [false, `font size is not 123`];
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
               , fontA: this._formElements.get('fontA').value
               , fontB: this._formElements.get('fontB').value
               , fontSize: parseFloat(this._formElements.get('fontSize').value || 1)
               , colorA: {mode: 'oklch', l: 0.7, c: 0.2, h: 0.7 * 360, alpha: 1}
               , colorB: {mode: 'oklch', l: 0.7, c: 0.2, h: 0.97 * 360, alpha: 0.6}
            }, ...args);
    }
    async _create(widgetBus, options/*, ...args*/) {
        // console.log(`${this}._create options:`, options);
        // create container
        // create line of text
        //     KeyFrame 0 has textContent
        // insert lineOfText into container
        // insert container into parent...

        const fontA = this._getFont(widgetBus);
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
        const [controlLayerPath, lineofTextAPath, lineOfTextBPath] = await widgetBus.changeState(()=>{
            const activeActors = widgetBus.getEntry(widgetBus.rootPath.append('activeActors'))
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
                keyMomentLOTASettings.get('label').value = 'Settings';
                keyMomentsLOTA.push(keyMomentLOTASettings);

            }
            if(options.colorB) {
                const color = culoriToColor(options.colorB, keyMomentLOTBSettings.dependencies);
                console.log('options.colorB', options.colorB, 'color', color);
                keyMomentLOTBSettings.set('textColor', color);
                keyMomentLOTBSettings.get('label').value = 'Settings';
                keyMomentsLOTB.push(keyMomentLOTBSettings);
            }

            const lineOfTextAIndex = 0
              , lineOfTextBIndex = 1
              , controlLayerNewIndex = activeActors.size
              ;
            controlLayerDraft.get('activeActors').push(
                            lineOfTextAActorDraft, lineOfTextBActorDraft);
            activeActors.push(controlLayerActorDraft);

            const controlLayerPath = widgetBus.rootPath.append('activeActors', controlLayerNewIndex, 'instance')
              , lineofTextAPath = controlLayerPath.append('activeActors', lineOfTextAIndex, 'instance')
              , lineofTextBPath = controlLayerPath.append('activeActors', lineOfTextBIndex, 'instance')
              ;
            return [controlLayerPath, lineofTextAPath, lineofTextBPath];
        });
    //    // It's interesting, how to keep track of the actor/identity of that
    //    // actor, we use paths in here, but that's not an id, i.e. not
    //    // lasting long.
    //    // Also, it might be possible to measure the text sizes right
    //    // away, without witing for the insertion to finish, using
    //    // animationProperties@, whatever we enter here and font-defaults ...
    //    // However, waiting for insertion and then using animationProperties@
    //    // should be a bit easier to use.
    //    const animationPropertiesPath = `animationProperties@${lineofTextPath.toString()}`
    //      , animationProperties = widgetBus.getEntry(animationPropertiesPath)
    //      , sample = this._domTool.createElement('span', {'class': 'measure_box-sample'})
    //      , measureBox = this._domTool.createElement('div', {'class': 'measure_box'}, sample)
    //      ;
    //    {
    //        const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(0)
    //          , font = widgetBus.getEntry(lineofTextPath.append('font')).value
    //          ;
    //        sample.textContent = propertyValuesMap.get('generic/textRun');
    //        sample.style.setProperty('font-family', `"${font.fullName}"`);
    //        setTypographicPropertiesToSample(sample, propertyValuesMap);
    //    }
    //    this._domTool.document.body.append(measureBox);
    //    // DOMRect { x, y, width, height, top, right, bottom, left }
    //    const  {width:expandedWidth} = sample.getBoundingClientRect();
    //    {
    //        const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(animationProperties.animanion.LAST_T);
    //        setTypographicPropertiesToSample(sample, propertyValuesMap);
    //    }
    //    const {width:contractedWidth} = sample.getBoundingClientRect()
    //      , advancement = expandedWidth - contractedWidth
    //      ;
    //
    //    const advancementSetup = options.advancement
    //                      ? options.advancement
    //                      : {type: 'repetition', value: 1}
    //      , repetitions = advancementSetup?.type === 'min-distance'
    //              ? advancementSetup.value / advancement
    //              // assert options.advancement.type === 'repetition'
    //              : (advancementSetup?.type === 'repetition'
    //                      ? advancementSetup.value
    //                      : 1
    //              )
    //      , direction = repetitions >= 0 ? 1 : -1
    //      , forwardSetup = [['Contraction', 1.7], ['Expansion', 1]]
    //      , [phaseASetup, phaseBSetup] = direction === 1
    //                  ? forwardSetup
    //                  : [...forwardSetup].reverse()
    //      , iterations = Math.abs(repetitions)
    //      , [mainAxisContracted, mainAxisEpanded] = options.widthParams.get('wdth')
    //      , mainAxisDefaultPosition = 100 // start here!
    //      , mainAxisRange = mainAxisEpanded - mainAxisContracted
    //      , mainAxisNormalizedDefaultPosition = mainAxisDefaultPosition - mainAxisContracted
    //      , mainAxisDefaultT = 1 - mainAxisNormalizedDefaultPosition / mainAxisRange
    //      , [, phaseADuration] = phaseASetup
    //      , [, phaseBDuration] = phaseBSetup
    //      , fullDuration = phaseADuration + phaseBDuration
    //      , phaseAPerFullDiuration = phaseADuration / fullDuration
    //      , timeShift = direction > 0
    //                ? phaseAPerFullDiuration * mainAxisDefaultT
    //                : 1 - phaseAPerFullDiuration * mainAxisDefaultT
    //      ;
    //    {
    //        const propertyValuesMap = animationProperties.animanion.getPropertiesFromGlobalT(mainAxisDefaultT);
    //        setTypographicPropertiesToSample(sample, propertyValuesMap);
    //    }
    //    const {width:defaultWidth} = sample.getBoundingClientRect()
    //      , defaultAdvancement = expandedWidth - defaultWidth
    //      ;
    //    // All measurements done, time to finalize the worm.
    //    measureBox.remove();
    //    return await widgetBus.changeState(()=>{
    //        const lineOfTextKeyMoments = widgetBus.getEntry(lineofTextPath.append('keyMoments'));
    //        {
    //            /**
    //             * 0
    //             * duration: 0 // but is also end-to-end
    //             * initially text-align: right
    //             * width: set to full expansion measurement
    //             * x: 0
    //             */
    //            const keyMoment = lineOfTextKeyMoments.get(0)
    //              , numericProperties = keyMoment.get('numericProperties')
    //              , axesLocations = keyMoment.get('axesLocations')
    //              ;
    //            keyMoment.get('label').value = '0: Initialization';
    //            keyMoment.get('duration').value = 0;
    //            keyMoment.get('textAlign').value = 'right';
    //            numericProperties.setSimpleValue('width', expandedWidth);
    //            numericProperties.setSimpleValue('x', 0);
    //            for(const [property, [/*contracted*/, expanded]] of options.widthParams)
    //                axesLocations.setSimpleValue(property, expanded);
    //        }
    //        {
    //            /**
    //             * 1
    //             * duration: 1 === auto
    //             * animate to full contraction
    //             * x: 0
    //             */
    //            const keyMoment = lineOfTextKeyMoments.constructor.Model.createPrimalState(lineOfTextKeyMoments.dependencies).getDraft()
    //              , numericProperties = keyMoment.get('numericProperties')
    //              , axesLocations = keyMoment.get('axesLocations')
    //              , [phaseALabel, phaseADuration] = phaseASetup
    //              ;
    //            lineOfTextKeyMoments.splice(1, 1, keyMoment);
    //            keyMoment.get('label').value = `1: ${phaseALabel}`;
    //            keyMoment.get('duration').value = phaseADuration;
    //            numericProperties.setSimpleValue('x', 0);
    //            for(const [property, [contracted/*, expanded*/]] of options.widthParams)
    //                axesLocations.setSimpleValue(property, contracted);
    //        }
    //        {
    //            /**
    //             * 2
    //             * duration: 0
    //             * text-align: left
    //             * x: advancement
    //             *    so that start of text (end of worm) stays at the same position
    //             *    this is the actual advancement
    //             *    it's the expanded text width - the contrated text width
    //             */
    //            const keyMoment = lineOfTextKeyMoments.constructor.Model.createPrimalState(lineOfTextKeyMoments.dependencies).getDraft()
    //              , numericProperties = keyMoment.get('numericProperties')
    //              ;
    //            lineOfTextKeyMoments.push(keyMoment);
    //            keyMoment.get('label').value = '2: Re-alignment';
    //            keyMoment.get('duration').value = 0;
    //            keyMoment.get('textAlign').value = 'left';
    //            numericProperties.setSimpleValue('x', advancement);
    //        }
    //        {
    //            /**
    //             * 3
    //             * duration: 1 === auto BUT can be longer, i.e. 1.5, as this
    //             * is the actual forward movement phase, e.g. slower than
    //             *      contraction because it needs more force to move the "mass".
    //             *      CAUTON: Actually, the other way around looks better:
    //             *      slower contraction than expansion.
    //             *  animate to full expansion
    //             */
    //            const keyMoment = lineOfTextKeyMoments.constructor.Model.createPrimalState(lineOfTextKeyMoments.dependencies).getDraft()
    //              , axesLocations = keyMoment.get('axesLocations')
    //              , [phaseBLabel, phaseBDuration] = phaseBSetup
    //              ;
    //            lineOfTextKeyMoments.push(keyMoment);
    //            keyMoment.get('label').value = `3: ${phaseBLabel}`;
    //            // It's interesting, when moving backwards (to the left)
    //            // this should be reversed with the contracting duration.
    //            keyMoment.get('duration').value = phaseBDuration;
    //            for(const [property, [/*contracted*/, expanded]] of options.widthParams)
    //                axesLocations.setSimpleValue(property, expanded);
    //        }
    //        // Normalization: Start at default axis positon
    //        const normalizationContainerKeyMoments = widgetBus.getEntry(normalizationContainerPath.append('keyMoments'));
    //        {
    //            // Caution: in lower levels, timing of the timeShift messes with
    //            // the timing of the x advancement
    //            // It's simplest to add an outer layer that moves overall timing
    //            // so, that the start is at the default value. However, this
    //            // also requires an additional, measured, x offset.
    //            const keyMomentA = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
    //              , keyMomentB = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
    //              , keyMomentC = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
    //              , keyMomentD = normalizationContainerKeyMoments.constructor.Model.createPrimalState(normalizationContainerKeyMoments.dependencies).getDraft()
    //              , numericPropertiesA = keyMomentA.get('numericProperties')
    //              , numericPropertiesB = keyMomentB.get('numericProperties')
    //              , numericPropertiesC = keyMomentC.get('numericProperties')
    //              , numericPropertiesD = keyMomentD.get('numericProperties')
    //              ;
    //            normalizationContainerKeyMoments.push(keyMomentA, keyMomentB, keyMomentC, keyMomentD);
    //            keyMomentA.get('label').value = `Start Time Control`;
    //            keyMomentB.get('label').value = `Pin Inital`;
    //            keyMomentC.get('label').value = `Advance`;
    //            keyMomentD.get('label').value = `End Time Control`;
    //            const [posA, posB] = direction > 0
    //                    ? [-defaultAdvancement ,  advancement-defaultAdvancement]
    //                    : [-defaultAdvancement ,  -advancement-defaultAdvancement]
    //              , [tA, tB] = direction > 0
    //                    ? [timeShift, 1 + timeShift]
    //                    : [ 1-timeShift,  -timeShift]
    //                    ;
    //
    //            // normalize x coordinate
    //            keyMomentA.get('duration').value = 0;
    //            numericPropertiesA.setSimpleValue('x', posA);
    //            numericPropertiesA.setSimpleValue('t',  tA);
    //
    //            keyMomentB.get('duration').value = 1-timeShift;
    //            numericPropertiesB.setSimpleValue('x', posA);
    //
    //            // jump, this is where the raw animation ends
    //            keyMomentC.get('duration').value = 0;
    //            numericPropertiesC.setSimpleValue('x', posB);
    //
    //
    //            keyMomentD.get('duration').value = timeShift;
    //            numericPropertiesD.setSimpleValue('t', tB);
    //            // Not required, as keyMomentA is at the same t because
    //            // the animation is end to end. Left in here for robustness,
    //            // i.e. in case the assumption about the isLoop flag changes.
    //            numericPropertiesD.setSimpleValue('x', posB);
    //        }
    //        // Repetitions and Time Control
    //        const containerKeyMoments = widgetBus.getEntry(containerPath.append('keyMoments'));
    //        for(let i=0;i<iterations;i++) {
    //            /**
    //             * Each repetion is a set of 2 key moments
    //             * A
    //             *    duration: 0
    //             *    x: x += advancement (=== iteration * advancement)
    //             *    t: 0
    //             * B:
    //             *    duration: 1
    //             *    x: x += advancement
    //             *    t: 1
    //             */
    //            const keyMomentA = containerKeyMoments.constructor.Model.createPrimalState(containerKeyMoments.dependencies).getDraft()
    //              , keyMomentB = containerKeyMoments.constructor.Model.createPrimalState(containerKeyMoments.dependencies).getDraft()
    //              , numericPropertiesA = keyMomentA.get('numericProperties')
    //              , numericPropertiesB = keyMomentB.get('numericProperties')
    //                // last iteration may be a fraction
    //              , x = options.x + direction * i * advancement
    //              ;
    //            containerKeyMoments.push(keyMomentA, keyMomentB);
    //            keyMomentA.get('label').value = `${i}: positioning`;
    //            keyMomentB.get('label').value = `${i}: time control`;
    //            keyMomentA.get('duration').value = 0;
    //            numericPropertiesA.setSimpleValue('x', x);
    //            if(i===0) {
    //                // set once for all
    //                keyMomentA.get('positioningHorizontal').value = 'left';
    //                if(Object.hasOwn(options, 'y'))
    //                    numericPropertiesA.setSimpleValue('y', options.y);
    //            }
    //            numericPropertiesA.setSimpleValue('t', 0);
    //            keyMomentB.get('duration').value = 1;
    //            numericPropertiesB.setSimpleValue('x', x);
    //            numericPropertiesB.setSimpleValue('t', 1);
    //        }
    //
    //    });
    }
}
