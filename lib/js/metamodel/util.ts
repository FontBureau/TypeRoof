export const _NOTDEF = Symbol("_NOTDEF");
export type NotDef = typeof _NOTDEF;
export type DefaultProvided<D> = Exclude<D, NotDef>;
