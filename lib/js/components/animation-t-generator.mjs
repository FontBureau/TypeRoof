/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...

import {
    _BaseComponent
} from './basics.mjs';

export function* animationGenerator(performanceAPI, duration, perpetual, newT) {
    let t = 0
      , lastExecution
      ;
    // run forever
    while(true) {
        const now = performanceAPI.now();
        let fps = 0
          ,  tOverflow = false
          ;
        if(newT !== undefined) {
            // newT can be used to jump to an initial position
            // or to resume animation after a pause.
            if(newT < 0) {
                // Can't end the none-loop generator with newT < 0
                tOverflow = false;
                // newT = -1.23
                // Math.abs(newT) % 1 => 0.23
                // 1 - 0.23 => 0.77
                t = 1 - (Math.abs(newT) % 1);
            }
            else {
                tOverflow = newT >= 1;
                t = newT % 1; // 0 >= t < 1
            }
        }
        // It's initially undefined, but then either t is 0
        // or newT was set as argument.
        else if(lastExecution !== undefined) {
            const frameTime = now - lastExecution
                // Need milliseconds, duration is in milliseconds
              , frameTimeFraction =  frameTime / duration
              , localT = t + frameTimeFraction
              ;
            fps = 1000 / frameTime;
            tOverflow = localT >= 1;
            t = localT % 1; // 0 >= t < 1
        }


        lastExecution = now;
        // call next like e.g: gen.next({duration: 2000})
        // duration will be mapped to newDuration

        // Don't change the internal t.
        let yieldT = t;
        if(tOverflow && !perpetual)
            // t would never be exactly 1 with % 1, it would be 0
            // instead! But I this will cause the animation to
            // halt on the last state instead of the first.
            // Ideally this means the timeline indicator is also
            // at the end position.
            yieldT = 1;

        const control = yield [yieldT, duration, perpetual, fps];

        if(Object.hasOwn(control, 'perpetual'))
            // before the return check below, because this can stop
            // behavior.
            perpetual = control.perpetual;

        // User can stop this from happening by injecting a newT or by
        // changing this into a loop.
        if(tOverflow && !perpetual && !Object.hasOwn(control, 't'))
            return;

        newT = Object.hasOwn(control, 't')
            ? control.t
            : undefined
            ;

        if(Object.hasOwn(control, 'duration'))
            duration = control.duration;
    }
}

export class AnimationTGenerator extends _BaseComponent {
    constructor(widgetBus) {
        super(widgetBus);
        this._running = false;
        this._generator = null;
        this._lastYield = null;
        this._genControl = {};
        this._animationFrameRequestId = null;
    }

    _scheduleIterate() {
        if(this._animationFrameRequestId !== null)
            // is already scheduled
            return;
        this._animationFrameRequestId = this._domTool.window.requestAnimationFrame(this._iterate.bind(this));
    }

    _unscheduleIterate() {
        this._domTool.window.cancelAnimationFrame( this._animationFrameRequestId );
        this._animationFrameRequestId = null;
    }

    destroy() {
        this._unscheduleIterate();
    }

    async _iterate(/*timestamp*/) {
        // clean up for _scheduleIterate
        this._unscheduleIterate();

        if(!this._generator) return;
        const result = this._generator.next(this._genControl);
        this._genControl = {};

        if(result.done) {
            // the generator has halted
            this._generator = null;
            this._lastYield = null;
            // set playing to false
            await this._changeState(()=>this.getEntry('playing').value = false);
        }
        else {
            const [t] = this._lastYield = result.value; // => [t, duration, isLoop, fps];
            // set t
            // maybe only if T hasn't changed.
            await this._changeState(()=>this.getEntry('t').value = t);
        }

        // schedule next round
        if(this._running)
            this._scheduleIterate();
    }

    _createGenerator() {
        const duration = (Object.hasOwn(this._genControl, 'duration')
                ? this._genControl.duration
                : this.getEntry('duration').value  * 1000)
          , perpetual = Object.hasOwn(this._genControl, 'perpetual')
                ? this._genControl.perpetual
                : this.getEntry('perpetual').value
          , t = Object.hasOwn(this._genControl, 't')
                    ? this._genControl.t
                    : this.getEntry('t').value
          ;
        return animationGenerator(this._domTool.window.performance
                               , duration, perpetual
                               // Don't overflow t in a new generator ever.
                               , t % 1
                               );
    }

    _setRunning(isRunning) {
        if(this._running === !!isRunning) // jshint ignore:line
            return;

        // changed
        this._running = !!isRunning;

        // was running, is paused
        if(!this._running) {
            this._genControl = {};
            this._unscheduleIterate();
            return;
        }

        // was paused, is resuming
        if(this._generator === null) {
            // Will take resume t from application state or this._genControl.
            this._generator = this._createGenerator();
            // Used up for initial state, besides, the initial yield
            // can't be controlled this way, so not resetting it here
            // is less explicit, but has the same effect.
            this._genControl = {};
        }
        else if(!Object.hasOwn(this._genControl, 't') && this._lastYield) {
            // [t, duration, perpetual, fps] =  this._lastYield
            const [ t ] = this._lastYield;
            this._genControl.t = t;
        }
        this._scheduleIterate();
        return;
    }

    update(changedMap) {
        if(changedMap.has('t')) {
            // Don't change t when the change was caused by the generator
            // i.e `if this._lastYield.t equals changedMap.get('t').value`.
            const newT = changedMap.get('t').value
              , lastT = this._lastYield === null
                    ? null
                    : this._lastYield[0]
              ;
            if(lastT === null || newT !== lastT)
                this._genControl.t = newT;
        }
        if(changedMap.has('duration'))
            this._genControl.duration = changedMap.get('duration').value * 1000;
        if(changedMap.has('perpetual'))
            this._genControl.perpetual = changedMap.get('perpetual').value;

        if(changedMap.has('playing')) {
            // pause or start the t generator
            this._setRunning(changedMap.get('playing').value);
        }
    }
}
