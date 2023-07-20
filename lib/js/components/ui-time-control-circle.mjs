/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */
/* jshint -W008 */ // leading dot in decimals...


import {
    _BaseComponent
} from './basics.mjs';

const SVGNS = 'http://www.w3.org/2000/svg';

export class UITimeControlCircle extends _BaseComponent {
    //jshint ignore:start
    static TEMPLATE = `<svg class="ui_time_control_circle"
        width="200" height="200"
        xmlns="http://www.w3.org/2000/svg">
    <circle class="ui_time_control_circle-track_back"
        pointer-event="all"
        cx="0" cy="0"
        fill="black"
    />
    <path class="ui_time_control_circle-track"
        d=""
        fill="#333"
    />
    <circle class="ui_time_control_circle-hand"
        cx="0" cy="0"
        r="13"
        fill="white"
    />
</svg>`;
    //jshint ignore:end
    constructor(parentAPI) {
        super(parentAPI);
        this._elementCenter = {x:100, y:100};
        this._trackRadius = 75;
        this._rotateStart = .25;
        [this.element, this._track, this._hand, this._trackBack] = this._initTemplate();

        this._windowEventListeners = [];
        this._animationWasPlaying = null;
        // We could create an active circle, or maybe use this._trackBack
        // as this._track changes it's form, but i couldn't receive the
        // event on this._trackBack so far.
        this.element.addEventListener('pointerdown', (event)=>this._onPointerDownHandler(event));
    }

    _initTemplate() {
        const container = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
          , track = container.querySelector('.ui_time_control_circle-track')
          , hand = container.querySelector('.ui_time_control_circle-hand')
          , trackBack = container.querySelector('.ui_time_control_circle-track_back')
          ;

        // Should implement some styling via css custom properties!
        trackBack.setAttribute('r', this._trackRadius);
        trackBack.setAttribute('cx', this._elementCenter.x);
        trackBack.setAttribute('cy', this._elementCenter.y);

        this._insertElement(container);
        return [container, track, hand, trackBack];
    }

    destroy() {
        this._removeEventListeners();
    }

    _removeEventListeners() {
        for(const eventListener of this._windowEventListeners)
            this._domTool.window.removeEventListener(...eventListener);
        this._windowEventListeners = [];
    }

    get dragActive() {
        return this._windowEventListeners.length !== 0;
    }
    _onPointerUpHandler(event) {
        if(!event.isPrimary)
            return;
        this._removeEventListeners();
        if(this._animationWasPlaying)
            // turn back on
            this._changeState(()=>this.getEntry('playing').value = true);
        this._animationWasPlaying = null;

        // reSync with state
        this._setT(this.getEntry('t').value);
    }
    _onPointerDownHandler(event) {
        if(!event.isPrimary)
            return;

        const eventT = this._getTForEvent(event)
          , tOffset = this.getEntry('t').value - eventT
          ;
        // Just in case we there is an old drag session active, but usually
        // we should capture the 'pointerup' and that would not happen.
        this._removeEventListeners();
        this._windowEventListeners.push(['pointermove', this._onPointerMoveHandler.bind(this, tOffset)]);
        this._windowEventListeners.push(['pointerup', this._onPointerUpHandler.bind(this)]);
        for(const eventListener of this._windowEventListeners)
            this._domTool.window.addEventListener(...eventListener);

        this._animationWasPlaying = this.getEntry('playing').value;
        if(this._animationWasPlaying)
            // we now control t
            this._changeState(()=>this.getEntry('playing').value = false);
    }

    _onPointerMoveHandler(tOffset, event) {
        if(!event.isPrimary)
            return;
        event.preventDefault();
        // The X/Y  coordinates of the mouse pointer in local (DOM content) coordinates.
        const eventT = this._getTForEvent(event)
          , t = (eventT + tOffset + 1) % 1
          ;
        this._setT(t);
        this._changeState(()=>this.getEntry('t').value = t);
    }

    _getTForEvent(event) {
        const clientRect = this.element.getBoundingClientRect()
          , centerX = clientRect.left + this._elementCenter.x
          , centerY = clientRect.top  + this._elementCenter.y
          , x = event.clientX - centerX
          , y = event.clientY - centerY
          ;
        return this.getTForXY(x, y, this._rotateStart);
    }

    getTForXY(x, y, rotateStart) {
        // to get from the -1 to + 1 range to the 0 to 1 range
        // divide by two => -0.5 to + 0.5
        // + 1 => 0 to 1
        return (Math.atan2(y, x) / Math.PI / 2 + 1 + rotateStart) % 1;
    }

    getXYForT(t, radius, rotateStart=0, translate={x:0, y:0}) {
        const rotatedT = (t + rotateStart) % 1
          , scaledT = rotatedT * 2 - 1 // from -1 to +1
          ;
        return [
            Math.cos(scaledT * Math.PI) * radius + translate.x
          , Math.sin(scaledT * Math.PI) * radius + translate.y
        ];
    }

    _setT(t) {
        const radius = this._trackRadius
          , handRadius = radius - 25 // should maybe be CSS styleable ...
          , translate = this._elementCenter
          , rotateStart = this._rotateStart // we start at the top (not right), move a quater back
          , [cx, cy] = this.getXYForT(t, handRadius, rotateStart, translate)
          , [mx, my] = this.getXYForT(0, radius, rotateStart, translate)
          , [dx_, dy] = this.getXYForT(t, radius, rotateStart, translate)
            // Otherwise the cirxle does not draw as "full" when t === 1
          , dx = t === 1 ? dx_ - 0.00001 : dx_
          , dCommands = [
                `M ${mx} ${my}`
              , `A ${radius} ${radius} 0 ${ t < .5 ? 0 : 1} 1 ${dx.toFixed(5)} ${dy.toFixed(5)}`
              , ... (t === 1
                        ? [] // don't show when circle is full
                        : [`L ${translate.x} ${translate.y}`] // draw to center
                    )
              , 'Z'
            ]
          ;
        this.element.style.setProperty('--t', t); // for custom css styling
        this._hand.setAttribute('cx', cx);
        this._hand.setAttribute('cy', cy);
        this._track.setAttribute('d', dCommands.join('\n'));
    }

    update(changedMap) {
        if(this.dragActive !== true && changedMap.has('t'))
            // has "focus" i.e. while dragging we don't respond to t changes
            // as we  cause them ourselves and it would create an annoying
            // when the animation is active.
            this._setT(changedMap.get('t').value);
    }
}


// FIXME: should be shared but is duplicated so far.
// No shared within this though
// Maybe it could become part of a more general library module.
export function activeKeyMomentsSortedKeys(activeKeyMoments) {
    const indexes = new Set();
    for(const [/* key */, activeKeyMoment] of activeKeyMoments)
        indexes.add(activeKeyMoment.get('activeKey').value);

    return Array.from(indexes) // used a set to have only unique entries
            .map(i=>parseInt(i, 10)) // for the sort function
            .sort((a,b)=>a-b)
            .map(i=>`${i}`)
            ;
}

export class UITimeControlKeyMomentSelectCircle extends UITimeControlCircle {
    constructor(parentAPI) {
        super(parentAPI);
        this._keyMomentMarkers = new Map();
        this._activeKeys = new Set(); // local cache

        this._keyMoments = this._domTool.document.createElementNS(SVGNS, 'g');
        this._keyMoments.classList.add('ui_time_control_circle-key_moments');
        this._domTool.insertBefore(this._keyMoments, this._hand);

        this._keyMoments = this.element.querySelector('.ui_time_control_circle-key_moments');
    }
    _updateKeyMoments(fullDuration, tToKeyMoments) {
        this._domTool.clear(this._keyMoments);
        this._keyMomentMarkers.clear();
        const children = []
          ;
        for(const [momentT,  keyMoments] of tToKeyMoments) {
            const t = momentT/fullDuration;
            for(const [i , [key/*, keyMoment*/]] of keyMoments.entries()) {
                const marker = this._domTool.document.createElementNS(SVGNS, 'circle')
                  , r = 3
                  , level = Math.floor(t) + i
                  , gap = 2 * r
                  , radius =  10 + (level * 2 * r) + (level * gap) + this._trackRadius// = 75;
                  , translate = this._elementCenter
                  , [cx, cy] = this.getXYForT(t, radius, this._rotateStart, translate)
                  ;
                marker.setAttribute('cx', cx);
                marker.setAttribute('cy', cy);
                marker.setAttribute('r', r);
                // normalT => draw onto timeline
                // maybe for each of the key-moments something .... ?
                marker.addEventListener('click', e=>{
                    // FIXME: this is a duplication of the code for the
                    // click-to-select-button in the KeyMomentsTimeline.
                    e.preventDefault();
                    this._changeState(()=>{
                        const activeKeyMoments = this.getEntry('activeKeyMoments')
                          , remove = []
                          ;

                        for(const [i, activeKeyMoment] of activeKeyMoments) {
                            if(activeKeyMoment.get('activeKey').value === key)
                                remove.push(i);
                        }
                        // If it is selected, unselect:
                        if(remove.length) {
                            remove.reverse();
                            for(const i of remove)
                                activeKeyMoments.delete(i);
                            return;
                        }
                        // It was not selected: add to selection
                        const activeKeyMoment = activeKeyMoments.constructor.Model
                            .createPrimalState(activeKeyMoments.dependencies)
                            .getDraft()
                            ;
                        activeKeyMoment.get('activeKey').value = key;
                        // It would be nice to insert in the right order, but it's
                        // not too necessary right now.
                        activeKeyMoments.push(activeKeyMoment);
                    });
                });
                if(this._activeKeys.has(key))
                    marker.classList.add('active');
                this._keyMomentMarkers.set(key, marker);
                children.push(marker);
            }
        }
        this._keyMoments.append(...children);
    }

    _setActiveKeyMoments(activeKeyMoments) {
        this._activeKeys = new Set(activeKeyMomentsSortedKeys(activeKeyMoments));
        for(const [markerKey, marker] of this._keyMomentMarkers)
            marker.classList[this._activeKeys.has(markerKey) ? 'add':'remove']('active');
    }

    update(changedMap) {
        super.update(changedMap);
        if(changedMap.has('activeKeyMoments')) {
            const activeKeyMoments = changedMap.get('activeKeyMoments');
            this._setActiveKeyMoments(activeKeyMoments);
        }

        // FIXME: this an experimental API
        if(changedMap.has('@animationProperties')) {
            const liveProperties = changedMap.get('@animationProperties')
              , tToKeyMoments = liveProperties.tToKeyMoments
              , fullDuration = liveProperties.fullDuration
              ;
            this._updateKeyMoments(fullDuration, tToKeyMoments);
        }
    }
}
