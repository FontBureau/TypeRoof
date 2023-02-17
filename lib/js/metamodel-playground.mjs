/* jshint esversion: 11, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true */


const _NOTDEF = Symbol('_NOTDEF')
    , REQUIRES =  Symbol('REQUIRES')
      // THIS may hint a way to create symbolic link like behavior
      // i.e. in MultipleTargets of ManualAxisLocations
      // The single UI for ManualAxisLocations shows the state of
      // the ActiveTarget, but that is so far just an index into
      // the List of ManualAxisLocations states. So the symbolic
      // link would always point to the actual state of the active
      // manualAxisLocations and the UI would subscribe to that link.
    , PROVIDES = Symbol('PROVIDES')
    ;

class _BaseModel {
    // qualifiedKey => can distinguish between alias/shortcut and
    // absolut entry. e.g. "@firstChild" vs ".0"
    get(qualifiedKey) {
        throw new Error(`NOT IMPLEMENTED get (of "${qualifiedKey}") in ${this}.`);
    }

    // Each model will have to define this.
    get value() {
        throw new Error(`NOT IMPLEMENTED get value in ${this}.`);
    }

    // use only for console.log/Error/debugging purposes
    toString() {
        return `[model ${this.constructor.name}]`;
    }

    toObject() { // => JSON compatible ...
         throw new Error(`NOT IMPLEMENTED toObject in ${this}.`);
    }

    fromRawValue(raw) {
        // static on the class!
        return this.constructor.fromRawValue(raw);
    }
}

class _BaseContainerModel extends _BaseModel {
    *[Symbol.iterator](){
        yield *this.value.entries();
    }
    get(key) {
        throw new Error(`NOT IMPLEMENTED get(key) in ${this}.`);
    }
    set(key, entry) {
        throw new Error(`NOT IMPLEMENTED get(key) in ${this}.`);
    }
}

// generic map/dictionary type
// Not sure we'll ever need this!
// class MapModel extends _BaseModel{}


// list/array type
// items are accessed by index
// has a size/length
// I'd prefer to have a single type for all items, that way,
// we can't have undefined entries, however, a type could be
// of the form TypeOrEmpty...
// MultipleTargets ...!
// class ListModel extends _BaseModel{}


class _AbstractStructModel extends _BaseContainerModel {
    // See _AbstractStructModel.createClass
    static get fields() {
        // NOT IMPLEMENTED fields is not defined in _AbstractStructModel
        throw new Error(`NOT IMPLEMENTED fields is not defined in ${this.name}`);
    }
    // fields: [string fieldName, instanceof _BaseModel (duck typed?)] ...
    static createClass(className, ...fields) {
            console.log(className, 'raw fields:', fields);
            if(typeof className !== 'string')
                throw new Error(`className must be string but is ${typeof string}`);
            const filteredFields = fields.filter(field=>
                    typeof field !== 'function'
                    && field[0] !== REQUIRES
                    && field[0] !== PROVIDES);
            // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            static fields = Object.freeze(new Map(filteredFields));
        }};
        // Can't override class.fields anymore, would be possible w/o the freeze.
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(entries) {
        super();

        const value = Object.assign(Object.create(null),
             Object.fromEntries(entries.filter(([name,])=>this.fields.has(name)))
        );
        // Do type checking and completeness checking.
        {
            const missing = []
              , types = []
              ;
            for(const [key, Type] of this.fields.entries()) {
                if(!Object.hasOwn(value, key)) {
                    missing.push(key);
                    continue;
                }
                if(!(value[key] instanceof Type))
                    types.push(`${key} is not ${Type.name}`);
            }
            if(missing.length || types.length)
                throw new Error(`TYPE ERROR can't initialize ${this.constructor.name}`
                        + (missing.length ? `; missing items: ${missing.join(', ')}` : '')
                        + (types.length ? `; wrong types: ${types.join(', ')}` : '')
                        + '.'
                );
        }
        Object.defineProperty(this, 'value', {
            value: Object.freeze(value)
          , writable: false
        });
    }
    *[Symbol.iterator](){
        yield *Object.entries(this.value);
    }
    toObject() {
        const result = {};
        for(let k of this.fields.keys())
            result[k] = this.value[k].toObject();
        return result;
    }
    // This is only to demonstrate dynamic, instance access to the static
    // fields Map.
    get fields() {
        return this.constructor.fields;
    }
    static fromRawValue(raw) {
        console.log(this, 'raw', raw);
        console.log('this.fields', this.fields);
        const entries = raw.map(([name, ...rawValue])=>{
                    console.log('name', name);
                    const Model = this.fields.get(name);
                    return [name, Model.fromRawValue(...rawValue)];
                });
        // FIXME: if entry can be empty and is missing we should
        //        push ['entryName'] to entries ...
        // could also be part of the constructor.
        return new this(entries);
    }
    has(key) {
        return Object.hasOwn(this.value, key);
    }
    get(key, defaultReturn=_NOTDEF) {
        if(this.has(key))
            return this.value[key];
        if(defaultReturn !== _NOTDEF)
            return defaultReturn;
        throw new Error(`KEY ERROR "${key}" not found in ${this}.`);
    }
    set(key, entry) {
        // could return this
        console.warn(`!!!!! set "${key}" in ${this}.`);
        if(this.has(key) && this.value[key] === entry){
            console.warn(`>>>>>Value at "${key}" equals entry in ${this}.`, entry);
            return this;
        }
        const newValue = Object.assign({}, this.value, {[key]: entry});
        return new this.constructor(Object.entries(newValue));
    }
}

class _AbstractListModel extends _BaseContainerModel {
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractListModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }

    static createClass(className, Model /* a _BaseModel */) {
            // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            static Model = Model;
        }};
        // Can't override class.Model anymore, would be possibl w/o the freeze.
        // Maybe only fix "Model" property?
        // Object.freeze(result[className]);
        return result[className];
    }

    constructor(entries) {
        super();
        {
            const typeFails = [];
            for(const [i, entry] of entries.entries()) {
                if(!(entry instanceof this.constructor.Model))
                    typeFails.push(`${i} ("${entry.toString()}" typeof ${typeof entry})`);
            }
            if(typeFails.length)
                throw new Error(`TYPE ERROR ${this.constructor.name} `
                    + `expects ${this.constructor.Model.name} `
                    + `wrong types in ${typeFails.join(', ')}`
                );
        }
        Object.defineProperty(this, 'value', {
            value: Object.freeze(Array.from(entries))
          , writable: false
          , enumerable: true
        });
    }
    toObject() {
        return this.value.map(entry=>entry.toObject());
    }
    static fromRawValue(raw) {
        return new this(raw.map(entry=>this.Model.fromRawValue(entry)));
    }

    get length() {
        return this.value.length;
    }

    has(key) {
        const index = parseInt(key, 10);
        return (index >= 0 && index < this.length);
    }

    get(key, defaultReturn=_NOTDEF) {
        const index = parseInt(key, 10);
        if(index < 0)
            // like Array.prototype.at
            // HOWEVER, the key is not the canonical path in this case;
            index = this.value.length - index;
        if(index >= 0 && index < this.value.length)
            return this.value[key];
        throw new Error(`KEY ERROR index "${key}" not found, length ${this.value.length} in ${this}.`);
    }

    set(key, entry) {
        const index = parseInt(key, 10);
        if(index < 0)
            // like Array.prototype.at
            // HOWEVER, the key is not the canonical path in this case;
            index = this.value.length - index;
        if(this.value[index] === entry)
            return this;
        const newValue = this.value.slice();
        if(index >= 0 && index < this.value.length)
            newValue[index] = entry;
        else
            // See other array operations like push, pop, shift, unshift, splice
            throw new Error(`KEY ERROR index "${key}" not found, length ${this.value.length} in ${this}.`);
        return new this.constructor(newValue);
    }

    _add(method, ...entries) {
        if(entries.length === 0)
            return this;
        const newValue = this.value.slice();
        newValue[method](...entries);
        return new this.constructor(newValue);
    }
    push(...entries) {
        return this._add('push', ...entries);
    }
    unshift(...entries) {
        return this._add('unshift', ...entries);
    }

    _remove(method) {
        if(this.value.length === 0)
            return this;
        const newValue = this.value.slice();
        newValue[method]();
        return new this.constructor(newValue);
    }
    pop() {
        return this._remove('pop');
    }
    shift() {
        return this._remove('shift');
    }

    splice(start, deleteCount=0, ...entries) {
        if(deleteCount === 0 && entries.length === 0)
            return this;
        const newValue = this.value.slice();
        newValue.splice(start, deleteCount, ...entries);
        return new this.constructor(newValue);
    }
}


// Will prevent accidental alteration, howeber, this is not vandalism proof.
// I tried using Javascript Proxy for this, however, it is not vandalism
// proof either (e.g. via prototype pollution), if that is a concern, an
// object with an internal map as storage and the same interface as Map
// is be better.
class FreezableMap extends Map {
    set(...args) {
        if (Object.isFrozen(this)) return this;
        return super.set(...args);
    }
    delete(...args){
        if (Object.isFrozen(this)) return false;
        return super.delete(...args);
    }
    clear() {
        if (Object.isFrozen(this)) return;
        return super.clear();
    }
}

// Very similar to _AbstractListModel
class _AbstractMapModel extends _BaseContainerModel {
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractMapModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }

    static createClass(className, Model /* a _BaseModel */) {
            // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            static Model = Model;
        }};
        // Can't override class.Model anymore, would be possible w/o the freeze.
        // Maybe only fix "Model" property?
        // Object.freeze(result[className]);
        return result[className];
    }

    constructor(entries) {
        super();
        {
            const typeFails = [];
            for(const [key, entry] of entries) {
                if(!(entry instanceof this.constructor.Model))
                    typeFails.push(`${key} ("${entry.toString()}" typeof ${typeof entry})`);
            }
            if(typeFails.length)
                throw new Error(`TYPE ERROR ${this.constructor.name} `
                    + `expects ${this.constructor.Model.name} `
                    + `wrong types in ${typeFails.join(', ')}`
                );
        }
        Object.defineProperty(this, 'value', {
            value: Object.freeze(new FreezableMap(entries))
          , writable: false
          , enumerable: true
        });
    }

    // Add a toMap method if a Map is desired.
    // This is used e.g. to put into JSON.
    toObject() {
        return Object.fromEntries(
            Array.from(this.value)
                 .map(([key, entry])=>[key, entry.toObject()])
        );
    }

    static fromRawValue(raw) {
        return new this(raw.map(([key, entry])=>[key, this.Model.fromRawValue(entry)]));
    }

    get size() {
        return this.value.size;
    }

    has(key) {
        return this.value.has(key);
    }

    get(key, defaultReturn=_NOTDEF) {
        if(this.value.has(key))
            return this.value.get(key);
        if(defaultReturn !== _NOTDEF)
            return defaultReturn;
        throw new Error(`KEY ERROR "${key}" not found in ${this}.`);
    }

    set(key, entry) {
        // could return this
        if(this.value.has(key) && this.value.get(key) === entry)
            return this;
        const newValue = new Map(this.value);
        newValue.set(key, entry);
        return new this.constructor(Array.from(newValue));
    }
    delete(key) {
        if(!this.value.has(key))
            return this;
        const newValue = new Map(this.value);
        newValue.delete(key);
        return new this.constructor(Array.from(newValue));
    }
}


// combines the order and inserting logic of the _AbstractListModel
// with the uniqueness by the keys of the _AbstractMapModel
class _AbstractOrderedMapModel extends _BaseContainerModel {
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractMapModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }

    static createClass(className, Model /* a _BaseModel */) {
            // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            static Model = Model;
        }};
        // Can't override class.Model anymore, would be possible w/o the freeze.
        // Maybe only fix "Model" property?
        // Object.freeze(result[className]);
        return result[className];
    }

    constructor(entries) {
        const _values = []
          , _keys = new FreezableMap()
          , index = 0
          ;
        super();
        {
            // made from an entries array : [[key, value], [key, value]]
            // or a map, which can be iterated that way.
            const typeFails = [];
            for(const [key, entry] of entries) {
                if(!(entry instanceof this.constructor.Model))
                    typeFails.push(`${key} [at ${index}] ("${entry.toString()}" typeof ${typeof entry})`);

                if(_keys.has(key)) {
                    // Could be an error as well, but the newer entry
                    // will override the older value;
                    _values[_keys.get(key)] = entry;
                }
                else {
                    _values.push(entry);
                    _keys.set(key, index);
                    index += 1;
                }
            }
            if(typeFails.length)
                throw new Error(`TYPE ERROR ${this.constructor.name} `
                    + `expects ${this.constructor.Model.name} `
                    + `wrong types in ${typeFails.join(', ')}`
                );
        }
        Object.defineProperty(this, '_values', {
            value: Object.freeze(_values)
          , writable: false
          , enumerable: true
        });
        Object.defineProperty(this, '_keys', {
            value: Object.freeze(_keys)
          , writable: false
          , enumerable: true
        });
    }

    entries() {
        const entries = [];
        for(const [k, index] of this._keys)
            entries[index] = [key, this._values[index]];
        return entries;
    }

    toObject() { // => JSON compatible ...
        this.entries().map([k, v]=>[k, v.toObject()]);
    }

    get size() {
        return this._value.length;
    }

    has(key) {
        return this._keys.has(key);
    }

    get(key, defaultReturn=_NOTDEF) {
        if(this.has(key))
            return this._values[this._keys.get(key)];
        if(defaultReturn !== _NOTDEF)
            return defaultReturn;
        throw new Error(`KEY ERROR "${key}" not found in ${this}.`);
    }

    // This method can be handy for the slice method, which is handy together
    // with the splice method.
    indexOf(key) {
        return this.has(key) ? this._keys(key) : -1;
    }

    // this.indexOf(key) and this.size can be handy to use splice.
    // It uses the original Array.prototype.splice method, but it
    // returns a changed _AbstractOrderedMapModel instance if it detects
    // change (which doesn't do a too deep equality comparison).
    splice(startIndex, deleteCount=0, ...entries) {
        const newEntries = this.entries()
          , deleted = newEntries.splice(startIndex, deleteCount, ...entries)
          ;
        // Using deleted because splice accepts also a negative deleteCount
        // and checkung the result is just simpler.
        if(deleted.length === 0 && entries.length === 0)
            // TODO: Could check more thoroughly if it has changed, but this is
            // good enough for now.
            return this;
        return new this.constructor(newEntries);
    }

    // This method won't accept undefined keys, because the ordered insertion
    // intent is more explicitly expressed by the push, unshift, splice
    // methods to insert new values.
    set(key, newEntry) {
        // The KEY ERROR from the get method is intendet here if key does not exist!
        if(this.get(key) === newEntry)
            return this;
        // replace
        this.splice(this._keys.get(key), 1, [key, newEntry]);
    }

    delete(key) {
        if(!this.has(key))
            return this;
        return this.splice(this._keys.get(key), 1);
    }

    // append, add to end
    push(...entries) {
        return this._splice(this.size, 0, ...entries);
    }
    // add to front
    unshift(...entries) {
        return this._splice(0, 0, ...entries);
    }
    // remove from end
    pop(deleteCount=1) {
        return this._splice(this.size-deleteAmount, amount);
    }
    // remove from front
    shift(deleteCount=1) {
        return this._splice(0, amount);
    }

}

// has a value or is empty
// get value => [bool isEmpty, null or value]
class _AbstractOrEmptyModel extends _BaseModel {
    static get Model() {
        // NOT IMPLEMENTED Model is not defined in _AbstractOrEmptyModel
        throw new Error(`NOT IMPLEMENTED Model is not defined in ${this.name}`);
    }
    static createClass(className, Model /* a _BaseModel */ ) {
            // this way name will naturally become class.name.
        const result = {[className]: class extends this {
            static Model = Model;
        }};
        // Can't override class.Model anymore, would be possibl w/o the freeze.
        // Maybe only fix "Model" property?
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(value=_NOTDEF) {
        super();
        Object.defineProperty(this, 'isEmpty',{
            value: value === _NOTDEF
          , writable: false
          , enumerable: true
        });
        if(!this.isEmpty && !(value instanceof this.Model))
            throw new Error(`TYPE ERROR ${this.constructor.name}`
                + ` value must be a ${this.Model.name}`
                + ` but is ${value.toString()} typeof ${typeof value}`);

        Object.defineProperty(this, '_value',{
            value: this.isEmpty ? undefined : value
          , writable: false
          , enumerable: true
        });
    }
    toObject() {
        // Could be not set in resulting parent object or null???
        // but I don't want to bloat this right away.
        return [this.isEmpty, ...( this.isEmpty ? [] : [this._value.toObject()] )];
    }

    static fromRawValue(raw=_NOTDEF) {
        const value = raw === _NOTDEF
                ? _NOTDEF
                : this.Model.fromRawValue(raw)
                ;
        return new this(value);
    }

    get Model() {
        return this.constructor.Model;
    }

    get value() {
        return [this.isEmpty, ...( this.isEmpty ? [] : [this._value.value] )];
    }
}

/**
 * Rather a placeholder, to have quick type classes.
 */
class _AbstractGenericModel extends _BaseModel {
    static createClass(className) {
            // this way name will naturally become class.name.
        const result = {[className]: class extends this {}};
        Object.freeze(result[className]);
        return result[className];
    }
    constructor(value=_NOTDEF) {
        super();
        if(value===_NOTDEF)
            throw new Error(`TYPE ERROR value must be set but is _NOTDEF in ${this}`);

        Object.defineProperty(this, 'value', {
            value: value
          , writable: false
          , enumerable: true
        });
    }
    toObject() {
        // not much knowledge about this!
        return this.value;
    }
    static fromRawValue(raw) {
        return new this(raw);
    }
}

/*

> MyStructClass = _AbstractStructModel.createClass('MyStructClass', ['a', 'hello'], ['b', 2])
[class MyStructClass extends _AbstractStructModel] {
  fields: Map(2) { 'a' => 'hello', 'b' => 2 }
}

> MyStructClass.fields
Map(2) { 'a' => 'hello', 'b' => 2 }

> _AbstractStructModel.fields
Uncaught Error: NOT IMPLEMENTED fields is not defined in _AbstractStructModel
    at get fields [as fields] (file:///home/commander/Projects/fontbureau/videoproof/lib/js/metamodel.mjs:37:15)

> myStruct = new MyStructClass()
MyStructClass {}

> myStruct.fields
[ 'a', 'b' ]

> myStruct + ''
'[_BaseModel MyStructClass]'

*/

// this is great so far, but the struct should be able to validate it's
// own integrity, in other words, it should not be possible to create an
// invalid/inconsistent state! At least, it should be possible to describe
// guards that try to keep the state consistent. How to?

// depends on font, fontSize (fontSize in case of autoOPSZ)
// how to read fontSize??? in a way this should also subscribe to changes!



const AnyModel = _AbstractGenericModel.createClass('AnyModel')
  , IntegerModel = _AbstractGenericModel.createClass('IntegerModel')
    // Beautiful
  , IntegerOrEmptyModel = _AbstractOrEmptyModel.createClass('IntegerOrEmptyModel', IntegerModel)
  , NumberModel =  _AbstractGenericModel.createClass('NumberModel')
  , NumberOrEmptyModel = _AbstractOrEmptyModel.createClass('NumberOrEmptyModel', NumberModel)
  , BooleanModel = _AbstractGenericModel.createClass('BooleanModel')
  , StringModel = _AbstractGenericModel.createClass('StringModel')
  , AxisLocationModel = _AbstractStructModel.createClass('AxisLocationModel'
            //, ['name', StringModel]
          , ['value', NumberOrEmptyModel]// => if null we can fall back to the default
                                        //    on the other hand, in that case,
                                        //    the AxisLocationValueModel could be an
                                        //    AxisLocationOrEmptyValueModel
            // min, max, default => could come from font => we'd build an
            // extra model on the fly per axis? That way, at least validation
            // could be truly inherent!
    )
    // Make an _AbstractMapModel, the values wouldn't require a name ... ?
  , AxisLocationsModel = _AbstractMapModel.createClass('AxisLocationsModel', AxisLocationModel)
  , ManualAxisLocationsModel = _AbstractStructModel.createClass(
        'ManualAxisLocationsModel'
        // requires
      , [REQUIRES, 'font', 'fontSize']
        // requires means: I don't know where it comes from but I need its
        // value and I need to get informed when it changes.
        // however, the value of this may or may not change subsequently.
        //
        // the counterpart to "requires" would be "provides", obiously
        // provides should be directed only at children. It could be,
        // however, maybe a rewrite,
        // Thinking about this as of the mantra right now. font would be
        // defined above, and just become part of the "scope" of this.
        // layers inbetween could rewrite the scope for their children.
        // provides could, while walking down the tree, be used to update
        // the active scope. It's a bit like css cascade. If a parent "provides"
        // it set's it to scope.
        // could be provided via a sibling maybe, rerouting ...
        // however, when sibling changes anywhere, everything that requires
        // must get updated.
        //
        // In a away, doing the order of evaluation in Mantra style is the
        // same as a topological order of a dependency tree. That way it
        // may even be simpler to implement! At least until a better image
        // evolves, doing it manually could be ideal.
        //
        // Also, try to do it immutable.
      , function coherenceGuard() {
            // This is only expected to set fontSize to opsz if
            // autoOPSZ is true (and if there is an opsz axis anyways).
            // In order to do that, it needs access to fontSize.
            // so, when fontSize changes, or when autoOPSZ is set to true,
            // this needs to run. Actually, when autoOPSZ is set to false,
            // opsz  will not be changed.
            // in order for opsz to be something else than font-size
            // autoOPSZ must be false.
            //
            // so a good example to set opsz to something else when
            // autoOPSZ is true as an compound action:
            //       set autoOPSZ = false
            //       set opsz = 123
            // the other way around must fail
            //       set opsz = 123 // -> ERROR cannot set opsz because autoOPSZ is true
            //       set autoOPSZ = false
            //
            // !!! There is an order that must be obeyed.
            // Should this be done internally? After all, setting single
            // values is chaotic anyways.
            //


        }
      , ['autoOPSZ', BooleanModel, /* default true*/ ]
      , ['axisLocations', AxisLocationsModel]
);
// above, it would make a lot of sense to add fontSize
// and also fontName
// HOWEVER:
// depending on the model/layout we need e.g. one fontName for many
// ManualAxisLocationsModel and hence, we don't want to store it here,
// but instead above, in a parent model. Here comes the requires part in
// into play, in order to check this, it needs these environment values.
//
// Maybe(!)




// One exercise here is to enforce activeTarget to be an index within targets
// when targets is changed, e.g. a pop(), activeTarget must changes as well
// say activeTarget is the last item of targets and we remove the first item
// how to keep activeTarget the last item (second to last etc.)
// It could be kept in sync if it was stored in targets, and maybe just
// be the first actice entry, but to keep that clean, we also need to
// enforce some rules ... (e.g. don't allow multiple actice items in targets)
const FontModel = _AbstractGenericModel.createClass('FontModel')
  , MultipleManualAxisLocationsModel = _AbstractListModel.createClass('MultipleManualAxisLocationsModel', ManualAxisLocationsModel)
  , ExampleLayoutModel = _AbstractStructModel.createClass(
    'ExampleLayoutModel'
    //requires
  , [REQUIRES, 'templates' /* to initialize targets */] // e.g. available fonts? could be typed!
    // provides
  , [PROVIDES, 'font', 'fontSize']
  , ['font', FontModel]
  , ['fontSize', NumberModel] // when we control min/max and precision at this level we'll get a lot from it, could be used to configure a generic number ui

  // , ['templates', ExampleTemplatesModel]
  // , ['activeTemplate', IntegerOrEmptyModel] //
  // on init
  , ['targets', MultipleManualAxisLocationsModel] // not enough, there are also content implications on targets!
  , ['activeTarget', IntegerOrEmptyModel]
);

// Bootstrapping is hard!
let applicationFonts = [{name: 'fixture font'}];

let exampleLayoutState = ExampleLayoutModel.fromRawValue([
    // => above in ApplicationModel['fonts', applicationFonts]
    // i.e. when font changes, this will need to change as well
    // requires a 'font'
    ['font', applicationFonts[0]]
  , ['fontSize', 14 /*some default*/] // want this to experiment with autoOPSZ
    // requires targets, via template
    // template defines the targets actually
    // hence this depends on activeTemplate => templates

    // hmm want this to be dynamic, so going to start empty for now
  , ['targets', [
        [// manual axis locations
            ['autoOPSZ', true]
          , ['axisLocations', [
                ['opsz', [['value']]]
              , ['wght', [['value', 400]]]
            ]]
        ]
    ]]
  , ['activeTarget', 1]
]);

console.log('exampleLayoutState', exampleLayoutState);


const ApplicationModel = _AbstractStructModel.createClass(
    'ApplicationModel'
    // owns all assets, like fonts, data files ...
    // AvailableFontsModel entries should also contain a [category, label]
    //      like: "included", "local" ... there should also be a label for these
    //      the order is included, but the UI can choose to reorder, and/or
    //      split into the categories.
  , ['availableFonts', AvailableFontsModel] // ordered map, all of type FontModel
  , ['activeFont', KeyOf('availableFonts')]

    // would create a depencdency description
    // as well as a forward link.
    // so when the actual font object changes or the key in activeFont
    // changes, everything that depends on "font" should change!
    //
  , ['font', Link('availableFonts[activeFont]')] // => provides one FontModel of AvailableFontsModel

    // this is going to be interesting as well
    // AvailableLayoutsModel entries should also contain a category
    //      Works similat like the AvailableFontsModel including
    //      a [category, label]  the data
  , ['availableLayoutsModel', AvailableLayoutsModel]
    // ordered map, all of type LayoutsModel, maybe also something unitinitialized
    // and we initialize ot when it becomes active?
    // We could also keep the last state there, but it would be hard/a lot
    // of work to keep in sync when e.g. fonts change etc, so I prever right now
    // rather just the raw Models, which we initalize on becoming active.
  , ['activeLayoutModel', OneOfTheAvailableLayoytsEnum]
  , ['layoutModel']
);


//let [newExmpleLayoutState, changedPaths] = exampleLayoutState.transform(entries);



class Path {
    static SEPARATOR = '/';
    constructor(...pathParts) {
        for(let [i, part] of pathParts.entries()) {
            if(typeof part !== 'number' && part.indexOf(this.constructor.SEPARATOR) !== -1)
                throw new Error(`TYPE ERROR path parts must not contain SEPERATOR "${SEPERATOR}"`
                    + ` but found in part #${i} "${part}" ${this}.`);
        }
        const cleanParts = pathParts.filter(part=>part !== '');
        Object.defineProperty(this, 'parts', {
            value: Object.freeze(cleanParts)
          , enumerable: true
        });
    }
    static fromParts(...pathParts) {
        return new this(...pathParts);
    }
    static fromString(pathString) {
        return this.fromParts(...pathString.split(this.SEPARATOR));
    }
    fromString(pathString) {
        return this.constructor.fromString(pathString);
    }
    fromParts(...pathParts) {
        return this.constructor.fromParts(...pathParts);
    }
    toString() {
        return this.parts.join(this.constructor.SEPARATOR)
    }
    [Symbol.iterator](){
        return this.parts[Symbol.iterator]();
    }
    appendString(pathString) {
        return this.append(...this.fromString(pathString).parts);
    }
    append(...pathParts) {
        return this.fromParts(...this.parts, ...pathParts);
    }
    get isRoot(){
        return this.parts.length === 0;
    }
    get parent() {
        if(this.isRoot)
            throw new Error('Can\'t get parent path is root path.');
        return this.fromParts(...this.parts.slice(0, -1));
    }
}

const IS_CONTAINER = Symbol('IS_CONTAINER')
  ;
function *getAllPathsAndValues(state) {
    const value = state.value;
    // This check should rather be "is a container type"
    // and that would mean it has entries and it has a
    // get function that returns values for keys...
    if(state instanceof _BaseContainerModel) {
        yield [IS_CONTAINER];
        for(const [keyOrIndex, entry] of state)
            for(const [value, ...path] of getAllPathsAndValues(entry))
                yield [value, keyOrIndex, ...path];
    }
    else
        yield [state.value];
}

for(const [value, ...path] of getAllPathsAndValues(exampleLayoutState))
    console.log(
            path.join(Path.SEPARATOR) + (value === IS_CONTAINER ? Path.SEPARATOR : ''),
            ...(value === IS_CONTAINER ? [] : [value])
    );


function getEntry(state, path, defaultVal=_NOTDEF) {
    console.log(`getEntry ${path}`);
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path);
    try {
        return [...pathInstance].reduce((accum, part)=>{
            if(!(accum instanceof _BaseContainerModel))
                throw new Error('CONTAINER ENTRY ERROR no container at ${part} in ${path}');
            return accum.get(part);
        }, state);
    }
    catch(error) {
        // Could check if error is not a KEY ERROR type, but e don't!
        if(defaultVal !== _NOTDEF)
            return defaultVal;
        throw error;
    }
}

function getValue(state, path, defaultVal=_NOTDEF) {
    const result = getEntry(state, path, defaultVal);
    return result === defaultVal ? result : result.value;
}

let path = Path.fromString('targets/0/axisLocations/wght/value');
console.log(getValue(exampleLayoutState, path));

path = Path.fromString('targets/1/axisLocations/wght/value');
console.log(getValue(exampleLayoutState, path, null));

console.log(getEntry(exampleLayoutState, 'targets/0/axisLocations///wght/', null));


// How does changing the font trickle down to an updated axisLocations state!
// it seems that some knowledge about the font (READ ONLY) must be in some
// lower model.
// AND:

function* _getAllEntries(state, path) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path);
    let current = state
    yield current; // for the empty path
    for(let pathPart of pathInstance) {
        current = getEntry(current, pathPart)
        yield current;
    }
}


function setEntry(state, path, entry) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path)
        // pathInstance.parts[i] will be a key in entriesAlongPath[i]
        //    i.e.: entriesAlongPath[i].get(pathInstance.parts[i])
        // entriesAlongPath[i] is located at the empty path
        // Thus, path is than entriesAlongPath.
      , entriesAlongPath = [..._getAllEntries(state, path)]
      ;
    let updated = entry;
    for(let i=pathInstance.parts.length-1; i>=0; i--) {
        // We never access the last item in entriesAlongPath as
        // entriesAlongPath.length - 1 === pathInstance.parts.length
        const key = pathInstance.parts[i];
        // All of these must be container types, as they contain children.
        updated = entriesAlongPath[i].set(key, updated);
    }
    return updated;
}

function getModel(Model, path) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path);
    return path.parts.reduce((accum, key)=>{
        console.log('getModel:', key, 'from:', accum);
        if('Model' in accum)
            return accum.Model;
        if('fields' in accum)
            return accum.fields.get(key);
        throw new Error(`KEY ERROR don't know how to get model from ${accum.name}`);
    }, Model);
}


// In this cases, for array/map types, path keys/indexes don't
// need to exist they can in fact be any value but not empty!.
function fromRawValue(RootModel, path, rawValue) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path)
      , Model = getModel(RootModel, path)
      ;
    return Model.fromRawValue(rawValue);
}

function setRawValue(state, path, rawValue) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path)
      , newEntry = fromRawValue(state.constructor, pathInstance, rawValue)
      ;
      // FIXME: Only do if value changes ... eq() ...
      //    because this would optimize required change/update work.
    console.log('setRawValue newEntry:', newEntry);
    return setEntry(state, pathInstance, newEntry);
}

function changeEntry(state, path, method, ...args) {
    const pathInstance = (typeof path === 'string' ? Path.fromString(path) : path)
      , entry = getEntry(state, pathInstance)
      , newEntry = entry[method](...args)
      ;
    return setEntry(state, pathInstance, newEntry);
}

function pushEntry(state, path, ...entries) {
    return changeValue(state, path, 'push', ...entries);
}
function popEntry(state, path) {
    return changeValue(state, path, 'pop');
}

function spliceEntry(state, path, start, deleteCount=0, ...items) {
    return changeValue(state, path, 'splice', start, deleteCount, items);
}

function deleteEntry(state, path, key) {
    return changeValue(state, path, 'delete', key);
}


let changePath = Path.fromString('targets/0/axisLocations/wght/value');
// well if it was changed at all every entry along path has changed now.
// hence, changed should be a boolean
// however, a change because of coherenceGuards, more paths may have changed
let newState = setRawValue(exampleLayoutState, changePath, 500);
console.log('newState ' + newState, newState,  'eq exampleLayoutState:', newState===exampleLayoutState);
let newEntry = getEntry(newState, changePath);
let oldEntry = getEntry(exampleLayoutState, changePath);
console.log('newEntry', newEntry, 'oldEntry', oldEntry);
// did not change
let pathDidNotChange = Path.fromString('targets/0/axisLocations/opsz/value');
console.log('did not change assert TRUE:', getEntry(exampleLayoutState, pathDidNotChange) === getEntry(newState, pathDidNotChange));
// did change

console.log(oldEntry, newEntry);
console.log('did change assert FALSE:', oldEntry === newEntry);


// States need comparison, state.eq(otherState).
// Also, it would be very nice if state were immutable, thus:
//          state.setSomeValue() => aNewState;
// we would be recreating state a lot though as this would have to change application state.
// but we would move parallell/sibling states that did not change to the new object.
// and checkiing is always done on initialization.
//
//    No: this.value = ...
//    But: that = this.set(value);
// that === this === true === no change???
// It's interesting. but is it overkill?
// is it a big effort to teach the Model how to update itself?
// can a visitor do so?
let oldState;
oldState = newState
changePath = Path.fromString('targets');
newState = changeEntry(oldState, changePath, 'push');
console.log('push no change assert True', newState === oldState);

let rawValue = [// manual axis locations
            ['autoOPSZ', false]
          , ['axisLocations', [
                ['opsz', [['value', 100]]]
              , ['wght', [['value', 800]]]
              , ['wdth', [['value', 300]]]
            ]]
        ];
newEntry = fromRawValue(oldState.constructor, changePath.append('0'), rawValue);

let compareBaseState = changeEntry(exampleLayoutState, changePath, 'unshift', newEntry);
console.log('push change assert False', newState === exampleLayoutState);
// two times newEntry
newState = changeEntry(compareBaseState, changePath, 'unshift', newEntry);

console.log(JSON.stringify(newState.toObject(), null, 1));

let oldArray = getEntry(newState, changePath)
  , newArray = new oldArray.constructor(oldArray.value)
  , changedArraySameContents = setEntry(newState, changePath, newArray)
  ;
//Allright: TODO:
//
// change multiple values
//      transaction like behavior is actually super easy when we do the
//      immutable/copy on write thing:
//          * get the state
//          * transform as much as you like
//          * set the state to the application.
//
// Inherent coherenceGuards!!!
//
// produce changed paths in a comparison(oldState, newState)
//          NOTE: in arrays/maps add/delete operation could be tracked
//                not sure we need this though, maybe just acknowledge that
//                the thing has changed???
//                especially for deletions, as for additons we can just
//                output the new path.
//                BTW: size/length could be treated as a change indicator
//                      so the ui knows wherther to rebuild a list rather
//                      than to update it?
//
// hmm for simple types and structs everything is always changed
// maps can also have added/deleted
// arrays can have added/deleted but also moves, when the element is still
// in the array but has another index.

class CompareStatus {
    constructor(name) {
        this.name = name;
        Object.freeze(this);
    }
    toString() {
        return `[compare ${this.name}]`;
    }
}
const COMPARE_STATUSES = Object.freeze(Object.fromEntries([
        'EQUALS', 'CHANGED', 'NEW', 'DELETED', 'MOVED', 'LIST_NEW_ORDER'
    ].map(name=>[name, new CompareStatus(name)])
));

function* rawCompare(oldState, newState) {
    if(!(oldState instanceof _BaseModel) || !(newState instanceof _BaseModel))
        throw new Error(`TYPE ERROR oldState ${oldState} and `
                + `newState ${newState} must be instances of _BaseModel.`);
    const {EQUALS, CHANGED, NEW, DELETED, MOVED, LIST_NEW_ORDER} = COMPARE_STATUSES
    if(oldState === newState) {
        // return also equal paths for completeness at the beginning,
        // can be filtered later.
        // HOWEVER this return will prevent the alogrithm from descending
        // in the structure and thus we won't get all available paths anyways!
        yield [EQUALS, null];
        return;
    }

    // Not the same constructor, but instanceof is not relevant here
    // because a sub-class can change everything about the model.
    if(oldState.constructor !== newState.constructor) {
        yield [CHANGED, null];
        return;
    }

    // self yield? yes e.g. an array may not be equal (===) but contain
    // just equal items at the same position, still for strict equality
    // that doesn't matter because it's a diferent array?
    yield [CHANGED, null];

    // Now instanceof counts, because it tells us how to use/read the instances.
    if(oldState instanceof _AbstractStructModel) {
        // both states are expected to have the same key
        for(const [key, oldEntry] of oldState) {
            for(const [result, data, ...pathParts] of rawCompare(oldEntry, newState.get(key)))
                yield [result, data, key, ...pathParts];
        }
        return;
    }

    if(oldState instanceof _AbstractListModel) {
        // I think this is a very interesting problem. On the Array layer
        // we can deal with change, addition, deletion and also movement
        // change (replace) is like deletion plus addition, we can't decide
        // how it happened exactly, it indicates that the new value and the
        // old value are not identical, nor somewhere in the array as that
        // would jst be moved.
        // Should we find moves first (from index, to index) so we can
        // keep them of other comparisions.
        //
        // so, when the new array is shorter than the old one we got
        // netto more deletion
        // when it's longer, we got netto addition.
        //
        // When everything new in newState got changed or replaced, we don't
        // care? One question would be how to map this to deeper down
        // change operations, we don't want to rebuild all of the UIs within
        // the array, just because one value deep down changed. Need to be
        // more precise.
        //
        // but also, when just one value in a multi-axis slider changed,
        // the mapping/updating would likely be swift.
        //
        // another example would be a simple reordering operation, e.g.
        // move the keyframe at index 4 to index 1 ...
        //
        // One question is probably how to decide whether the UI should be
        // replaced or updated! There may be a sweet spot at which replacing
        // is better than updating!
        // Consequently, we need to find out why we don't rebuild all of
        // the UI all the time, e.g. one entry in the root struct changed,
        // that should not require to rebuild the wholde app.
        // Similarly the array case, but it's much harder to decide here
        // what to do!
        //
        // hmm, to keep identities, a map could be used. Order could be
        // stored as part of the value, or next to the map, And the key
        // would be an increasing number (easy to handle!) for new inserts.
        // (Or we use an OrEmpty Type in an array to delete stuff, but at
        // this point, the map which allows for deletions natively is nice.
        // The array could be used to keep an ordered list of the keys.
        // It could be serialized without revealing the complex structure.
        // That way, new order of the array, or any additions deletions
        // etc. could be handled nicely by the UI.

        // Ok, such an id-array, if implemented as it's own type, what
        // can it do?
        // IDs are internal, not global.
        // Since set requires the element to exist already, it would not
        // change the id. But we can have a "replace" method.
        // set access is still via indexes,
        // it's interesting, we should rather make the implementation a
        // pattern. Because that way we can access the list independently
        // from the values, and get info if the list changed or not, in
        // contrast to the map...
        // Maybe a struct{
        //      order => list of ids
        //    . entries => map id: entry
        // }
        // IT should be impossible to come up with external ids though!
        //
        // So what is the aim of this?

        // A) to distinguish between change and replace:
        //     change: same key-id different entry => deep compare
        //             => how does the ui know?
        //                 if deeply anything changed, it will create a path
        //                 otherwise, there will be no deep path.
        //                 Consequently, even if the id of the entry changed
        //                 it may still be equivalent and no action is required!
        //                 but, we rather don't want to do equivalence comparison!
        //                 Hence, we, should not apply the changed if it's equivalent!
        //     replace: old key-id deleted new key-id inserted, order changed as well
        //             as before, we should probably not apply a replace if it's equivalent
        //             but this will otherwise create a new id, so it must recreate the UI(?)
        //             and it won't go into deep comparison?
        //
        // At the moment, I feel like I should create a simple solution that
        // could be enhanced later, either by adding new types to the model,
        // coherenceGuards or by updating the compare method.


        // Deletions won't be mentioned, the new order length is the new lenght.
        // Entries are either old indexes, the new indexes are the
        // indexes of the order array.
        // new Order[3, 2, NEW, NEW, 4]: note how the last item did not change!
        // new Order[3, 2, NEW, NEW, EQUALS]
        // What if there are duplicates, i.e. entries that are equal?
        // Let's say they are consumend one by one! If oldState had two
        // entries of a kind and newState has three: []

        const newOrder = []
          , seen = new Map()
          , oldFoundIndexes = new Set()
          ;
        // for(const [oldIndex, oldEntry] of oldState) {
        //     const startIndex = seen.get(newEntry)
        //       , newIndex = newState.value.indexOf(oldEntry, startIndex)
        //       ;
        //     if(newIndex !== -1) {
        //         // found
        //         newOrder[newIndex] = oldIndex === newIndex ? [EQUALS] : [MOVED, oldIndex];
        //         seen.set(newEntry, oldIndex + 1);
        //     }
        //     else
        //         // Give indexOf a chance to search less, the result is
        //         // the same as not changing seen[newEntry], not sure if
        //         // this improves performance.
        //         seen.set(newEntry, Infinity);
        // }
        // for(const [newIndex, newEntry] of newState) {
        //     if(newOrder[newIndex])
        //         continue;
        //     newOrder[newIndex] = newIndex < oldState.value.length ? [CHANGED] : [NEW];
        // }

        for(const [newIndex, newEntry] of newState) {
            const startIndex = seen.get(newEntry)
              , oldIndex = oldState.value.indexOf(newEntry, startIndex)
              ;
            if(oldIndex === -1) {
                // Give indexOf a chance to search less, the result is
                // the same as not changing seen[newEntry], not sure if
                // this improves performance.
                seen.set(newEntry, Infinity);
                continue;
            }
            // found
            newOrder[newIndex] = oldIndex === newIndex
                                ? [EQUALS]
                                : [MOVED, oldIndex]
                                ;
            seen.set(newEntry, oldIndex + 1);
            oldFoundIndexes.add(oldIndex);
        }
        for(const [newIndex, newEntry] of newState) {
            if(newOrder[newIndex] !== undefined)
                continue;
            // not found in oldState
            newOrder[newIndex] = (oldFoundIndexes.has(newIndex) // marked as MOVED
                                    || newIndex >= oldState.value.length)
                                ? [NEW]
                                : [CHANGED]
                                ;
        }
        Object.freeze(newOrder);
        yield [LIST_NEW_ORDER, newOrder]; // !!! FIXME
        for(const [index, [status, /*oldIndex*/]] of newOrder.entries()) {
            if(status === EQUALS || status === MOVED || status === NEW) {
                // EQUALS: nothing to do.
                // MOVED: not compared, listener must reorder according to newOrder.
                // NEW: Item at index requires a new UI or such, there's nothing to compare.
                yield [status, null, index];
            }
            else if(status === CHANGED) {
                // There's already an item at that index, so we compare:
                const oldEntry = oldState.get(index)
                 , newEntry = newState.get(index)
                 ;
                for(const [result, data, ...pathParts] of rawCompare(oldEntry, newEntry))
                    yield [result, data, index, ...pathParts];
                continue;
            }
            else
                throw new Error(`Don't know how to handle status ${status}`);
        }
        return;
    }
    if(oldState instanceof _AbstractMapModel) {
        for(const [key, /*oldEntry*/] of oldState) {
            if(!newState.has(key))
                yield [DELETED, null, key];
        }
        for(const [key, newEntry] of newState) {
            if(!oldState.has(key)) {
                yield [NEW, null, key];
                continue;
            }
            const oldEntry = oldState.get(key);
            if(oldEntry === newEntry) {
                yield [EQUALS, null, key];
                continue;
            }
            // CHANGED: deep compare, both keys exist
            for(const [result, data, ...pathParts] of rawCompare(oldEntry, newEntry))
                yield [result, data, key, ...pathParts];
            continue;
        }
        return;
    }
    // * states should know how to compare
    // each level would produce changed keys, and we can recursively descend?
    // a verbose mode would provide all changed paths, where a compact mode
    // only keeps the longest unique paths, where the leaves changed, this
    // will be interesting!
    throw new Error(`VALUE ERROR Don't know how to compare ${oldState}`);
}


function* compare(oldState, newState) {
    for(const [status, data, ...pathParts] of rawCompare(oldState, newState))
        yield [status, data, Path.fromParts(...pathParts)];
}

// should maybe rather start with coherenceGuards

function compareToLog(compareResult) {
    for(const [status, data, path] of  compareResult) {
        if(status === COMPARE_STATUSES.LIST_NEW_ORDER) {
            console.log(`    ${status}: ${path} ;;`);
            for(let [i, [st, ...val]] of data.entries())
                console.log(`        #${i} ${st} data:`, ...val, ';;');
        }
        else
            console.log(`    ${status}: ${path} ;;`);
    }
}

console.log('compare(exampleLayoutState, newState)');
compareToLog(compare(exampleLayoutState, newState));
console.log('compare(newState, exampleLayoutState)');
compareToLog(compare(newState, exampleLayoutState));

console.log('compare(compareBaseState, newState)');
compareToLog(compare(compareBaseState, newState));
console.log('compare(newState, compareBaseState)');
compareToLog(compare(newState, compareBaseState));

console.log('compare(newState, changedArraySameContents)');
compareToLog(compare(newState, changedArraySameContents));

// Coherence guards:
//
// The UI of the type tools grid will serve here as a target, as it has
// a lot of inherent data logic, that should be separated. It also
// is layered several levlels deep, which makes it more interesting.
// At the outher most level e.g. an axis used in the dimension controls
// should not be used (be disabled) in manual axis locations.
// Then, between the (two) dimensions, the axis also must be mutual exclusive.
// On the level of the dimension itself, there's logic involved "massaging"
// stepping values with differnt constraints, min/max, being non-zero etc.
// also, about stepping, the model should be able to produce the "other value"
// either by exosing method or by exporting a static function or both.
//
//
// SQL Constraints come into mind, especially at this point e.g. UNIQUE:
//    NOT NULL - Ensures that a column cannot have a NULL value
//    UNIQUE - Ensures that all values in a column are different
//    PRIMARY KEY - A combination of a NOT NULL and UNIQUE. Uniquely identifies each row in a table
//    FOREIGN KEY - Prevents actions that would destroy links between tables
//    CHECK - Ensures that the values in a column satisfies a specific condition
//    DEFAULT - Sets a default value for a column if no value is specified
//    CREATE INDEX - Used to create and retrieve data from the database very quickly
//
// Maybe we can have layers of checks here, things like UNIQUE could easily
// be built in, while more complex stuff needs to be custom.
//
// Good thing we are immutable: We can build up the new model completeley
// and then validate it (also, ask/decide to skip validation while in progress)
// It's just important that eventually there's a coherent model.
// If the new model is invalid, we just don't apply it, and that's it.
//
// I'll have tp look into some nosql/object stores a bit!
// there's e.g. a common model to reference another value by unique ID
// which is very handy when normalizing stuff!. E.g. the activeTarget
// state is an index into the list of targets. And the dimension axis
// is an index into the list of available axes.
// Within a datastructure, uniqueness can also be achieved i.e. using a
// dictionary, where the keys are unique by default. Bue, e.g. references
// to those entries from further away.



const repl = await import('node:repl')
  , r = repl.start('> ')
  ;//.context.m = msg;
Object.assign(r.context, {_AbstractStructModel, exampleLayoutState});