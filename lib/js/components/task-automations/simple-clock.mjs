/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/
/* jshint -W008 */ // leading dot in decimals...
/* jshint -W028 */ // labels on if statement

import {
    enumerate
} from '../../util.mjs';

import {
    _DialogBase
} from '../basics.mjs';

import {
    createActor
} from '../actors/actors-base.mjs';

import {
    culoriToColor
} from '../color.mjs';

export class SimpleClockTaskAutomationDialog extends _DialogBase {
    // jshint ignore:start
    static TEMPLATE = `<dialog class="ui_dialog-clock">
    <form method="dialog">
      <fieldset>
        <legend>Insert a simple Clock -- Task Automation</legend>
        <p>A clock that shows correct hours, minutes and seconds between t 0 to 1,
        the hand in the time circle behaves like the hour hand of a clock. I
        I.e.: 12 hours require a total animation tie of 43200 seconds (12 * 60 * 60)</p>
        <menu>
          <button type="submit" value="create">Insert Clock</button>
          <button>Cancel</button>
        </menu>
      </fieldset>
    </form>
  </dialog>
`;
    // jshint ignore:end
    constructor(domTool) {
        super(domTool);
        [this.element, this._formElements] = this._initTemplate();
    }

    _initTemplate() {
        const [dialog] = super._initTemplate()
          , formElements = new Map()
          ;
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

    _updateDefaults(/*widgetBus*/) {
        // pass
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
            return this._create(widgetBus, {}, ...args);
    }

    _createTimingLayer(activeActors, size, label, formatText){
        const containerActorDraft = createActor('LayerActorModel', activeActors.dependencies)
              , containerDraft = containerActorDraft.get('instance')//.wrapped
              , containerKeyMoments = containerDraft.get('keyMoments')
              ;
         containerDraft.get('label').value = `Control ${label}`;
         activeActors.push(containerActorDraft);
         for(let i=0;i<size;i++) {
             /**
              * Each repetion is a set of 2 key moments
              * A
              *    duration: 0
              *    t: 0
              *    textContent: `${i + 1}`
              * B:
              *    duration: 1
              *    t: 1
              */
             const keyMomentA = containerKeyMoments.constructor.Model.createPrimalState(containerKeyMoments.dependencies).getDraft()
               , keyMomentB = containerKeyMoments.constructor.Model.createPrimalState(containerKeyMoments.dependencies).getDraft()
               , numericPropertiesA = keyMomentA.get('numericProperties')
               , numericPropertiesB = keyMomentB.get('numericProperties')
               , textContent = formatText(i)
               ;
             containerKeyMoments.push(keyMomentA, keyMomentB);
             keyMomentA.get('label').value = `${textContent}: new ${label}`;
             keyMomentA.get('duration').value = 0;
             // This will be displayed as the hours.
             keyMomentA.get('textRun').value = textContent;
             numericPropertiesA.setSimpleValue('t', 0);

             keyMomentB.get('label').value = `${textContent}: animate ${label}`;
             keyMomentB.get('duration').value = 1;
             numericPropertiesB.setSimpleValue('t', 1);
         }

         const containerActiveActors = containerDraft.get('activeActors')
            // insert a line of text -> to display the hours
              , lineOfTextActorDraft = createActor('LineOfTextActorModel', containerActiveActors.dependencies)
              , lineOfTextDraft = lineOfTextActorDraft.get('instance')
              ;
            lineOfTextDraft.get('label').value = `Display ${label}`;
            containerActiveActors.push(lineOfTextActorDraft);

         return [containerDraft, containerActiveActors, lineOfTextDraft];
    }

    async _create(widgetBus, /*options, ...args*/) {
        const options = {
            fontSize: 90
          , wght: {max: 800, min: 200}
          , opsz: 18
          , colorA: {mode: 'oklch', l: 0.7, c: 0.15 * 0.38, h: 0.4 * 360, alpha: 1}
          , colorB: {mode: 'oklch', l: 0.3, c: 0.00 * 0.38, h: 0.4 * 360, alpha: 1}
        };

        return await widgetBus.changeState(()=>{
            const activeActors = widgetBus.getEntry(widgetBus.rootPath.append('activeActors'))
              , [hoursContainer , hoursActiveActors, hoursLineOfText] = this._createTimingLayer(activeActors, 12, 'Hours', i=>`0${i || 12}`.slice(-2)) // two digits
              , [/* container */, minutesActiveActors, minutesLineOfText] = this._createTimingLayer(hoursActiveActors, 60, 'Minutes', i=>`0${i}`.slice(-2)) // two digits
              , [/* container */, /*secondsActiveActors*/, secondsLineOfText] = this._createTimingLayer(minutesActiveActors, 60, 'Seconds', i=>`0${i}`.slice(-2)) // two digits
              , root = widgetBus.getEntry(widgetBus.rootPath)
              , portalWidth = root.get('width').value
              , portalHeight = root.get('height').value
              , em = options.fontSize * 4/3  // 4/3 is pt to px
              , widthDigits = 1.2 * em
              , widthSeparators = 0.25 * em
              , widthClock = 3 * widthDigits + 2 * widthSeparators
              , colorA = culoriToColor(options.colorA, activeActors.dependencies)
              , colorB = culoriToColor(options.colorB, activeActors.dependencies)
              , separators = []
              , hoursKeyMoments = hoursContainer.get('keyMoments')
              , hoursKeyMomentOne = hoursKeyMoments.get(0)
              , numericPropertiesOne = hoursKeyMomentOne.get('numericProperties')
              ;
            root.get('duration').value = 12 * 60 * 60; // 12 hours in seconds

            hoursKeyMomentOne.get('fontSize').value = options.fontSize;
            hoursKeyMomentOne.get('heightTreatment').value = 'baselineToBottomFix';
            hoursKeyMomentOne.get('positioningVertical').value = 'bottom';
            numericPropertiesOne.setSimpleValue('x', portalWidth / 2 - widthClock / 2);
            numericPropertiesOne.setSimpleValue('y', portalHeight / 2 );
            numericPropertiesOne.setSimpleValue('width', widthClock);// = 100 %


            // insert : separators
            for(const [i, [label, separatorActiveActors]] of enumerate([['hh:mm', hoursActiveActors], ['mm:ss', minutesActiveActors]])) {
                const lineOfTextActorDraft = createActor('LineOfTextActorModel', separatorActiveActors.dependencies)
                  , lineOfTextDraft = lineOfTextActorDraft.get('instance')
                  , lotKeyMoments = lineOfTextDraft.get('keyMoments')
                  , keyMomentA = lotKeyMoments.constructor.Model.createPrimalState(lotKeyMoments.dependencies).getDraft()
                  , keyMomentB = lotKeyMoments.constructor.Model.createPrimalState(lotKeyMoments.dependencies).getDraft()
                  , axesLocationsA = keyMomentA.get('axesLocations')
                  , axesLocationsB = keyMomentB.get('axesLocations')
                  , numericPropertiesA = keyMomentA.get('numericProperties')
                  ;
                lineOfTextDraft.get('label').value = `Separator ${label}`;
                keyMomentA.get('label').value = 'settings';
                keyMomentA.get('textRun').value = ':';
                keyMomentA.get('textAlign').value = 'center';
                numericPropertiesA.setSimpleValue('x', (i + 1) * widthDigits + i * widthSeparators);
                numericPropertiesA.setSimpleValue('width', widthSeparators);

                axesLocationsA.setSimpleValue('opsz', options.opsz);
                axesLocationsA.setSimpleValue('wght', (options.wght.max - options.wght.min)* 0.5 + options.wght.min);
                axesLocationsA.setSimpleValue('GRAD', 150);
                axesLocationsB.setSimpleValue('GRAD', -200);

                keyMomentA.set('textColor', colorA);
                keyMomentB.set('textColor', colorB);

                lotKeyMoments.push(keyMomentA, keyMomentB);
                separatorActiveActors.push(lineOfTextActorDraft);
                separators.push(lineOfTextDraft);
            }

            for(const [i, lotItem] of enumerate([hoursLineOfText, minutesLineOfText, secondsLineOfText])) {
                const lotKeyMoments = lotItem.get('keyMoments')
                  , textAligns = ['right', 'center', 'left']
                  , keyMomentA = lotKeyMoments.constructor.Model.createPrimalState(lotKeyMoments.dependencies).getDraft()
                  , keyMomentB = lotKeyMoments.constructor.Model.createPrimalState(lotKeyMoments.dependencies).getDraft()
                  , numericPropertiesA = keyMomentA.get('numericProperties')
                  , axesLocationsA = keyMomentA.get('axesLocations')
                  , axesLocationsB = keyMomentB.get('axesLocations')
                  //, numericPropertiesB = keyMomentB.get('numericProperties')
                  ;
                keyMomentA.get('label').value = 'start';
                keyMomentB.get('label').value = 'end';
                keyMomentA.get('textAlign').value = textAligns[i % textAligns.length];

                axesLocationsA.setSimpleValue('opsz', options.opsz);
                axesLocationsA.setSimpleValue('wght', options.wght.max);
                axesLocationsB.setSimpleValue('wght', options.wght.min);

                keyMomentA.set('textColor', colorA);
                keyMomentB.set('textColor', colorB);

                // positioning .... this works for RobotoFlex regular width,
                //  i.e. one digit is 0.5 em wide
                // + in between space for the a colon (:) separatos
                numericPropertiesA.setSimpleValue('x', i * widthDigits + i * widthSeparators);
                numericPropertiesA.setSimpleValue('width', widthDigits);
                lotKeyMoments.push(keyMomentA, keyMomentB);
            }
        });

    }
}
