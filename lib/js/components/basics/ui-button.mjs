import {
    _BaseComponent
} from './component.mjs';

export class UIButton extends _BaseComponent {
    static ROOT_CLASS = 'ui-button';
    static TEMPLATE = `<button><!-- insert: label --></button>`;
    BASE_CLASS = null;
    constructor(widgetBus, label, eventHandlers = [],
        options = { title:null, classPart:null, elementAttributes:[], typeClassPart:null }
    ) {
        super(widgetBus);
        if(options.typeClassPart !== null)
            Object.defineProperties(this,{
                    BASE_CLASS: {
                        value: `${this.constructor.ROOT_CLASS}_${options.typeClassPart}`
                    }
            });
        [this.element, this._input] = this._initTemplate(label, eventHandlers, options);

    }
    _setClassesHelper(requireClasses) {
        const baseClasses = [this.constructor.ROOT_CLASS];
        if(this.BASE_CLASS)
            baseClasses.push(this.BASE_CLASS)

        for(const baseClass of baseClasses) {
            for(const [element, ...classParts] of requireClasses)
                element.classList.add([baseClass, ...classParts].join('-'));
        }
    }

    _initTemplate(label, eventHandlers,
            {title=null, classPart=null, elementAttributes=[]}) {
        const element = this._domTool.createFragmentFromHTML(this.constructor.TEMPLATE).firstElementChild
            , input = element
            ;
        this._domTool.insertAtMarkerComment(element, 'insert: label', label);

        const classPartInject = classPart === null ? []: [classPart];
        this._setClassesHelper([
            [element, ...classPartInject]
          , [input, ...classPartInject, 'input']
        ]);

        if (title !== null) element.title = title;
        for (const [name, value] of elementAttributes)
            element.setAttribute(name, value);

        for(const [event, fn, ...args] of eventHandlers)
            input.addEventListener(event, fn, ...args);

        this._insertElement(element);
        return [element, input];
    }

    set passive(val) {
         this._input.disabled = !!val;
    }

    get passive() {
        return !!this._input.disabled;
    }
}
