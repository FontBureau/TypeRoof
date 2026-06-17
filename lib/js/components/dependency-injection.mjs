/**
 * This module ideally has very few dependencies, as it will be used a lot.
 */

export const _NOTDEF = Symbol('_NOTDEF');
/**
 * A parameter is the variable listed inside the parentheses in the
 * function definition. An argument is the actual value that is sent
 * to the function when it is called.
 */
export class InjectDependency {
    constructor(name, payload=null, typeHint=_NOTDEF) {
        this.name = name;
        this.payload = payload;
        // TODO: the same name can mean a totally different thing.
        // We don't have real typing in here anyways, but this could be
        // a place to help/instruct the caller to insert the right argument.
        // This is just a stub, to suggest to a future me, that this could
        // be a goog place to implement.
        if(typeHint !== _NOTDEF)
            throw new Error(`NOT IMPLEMENTED ${this.constructor.name} "typeHint" argument `
                + `(value: ${typeHint.toString()}).`);
    }
    toString() {
        return `[${this.constructor.name}: ${this.name}]`;
    }
}

export function require(...args) {
    return new InjectDependency(...args);
}
