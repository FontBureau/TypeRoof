// Shared htmlAttrs bag helpers: the guard and the
// collect/replay primitives for both reproducing atoms and
// editable-element attr replay (Q1). The guard lives HERE, outside
// ingest, by operator decision: TypeRoof's core properties, on*
// handlers and the style attribute must never be emitted from a bag
// nor collected into one at parse time.
export const HTML_ATTRS_GUARD =
    /^(?:data-node-type|data-mark-type|data-style-name|on)|^style$/;

// Collect an element's attributes into the htmlAttrs bag form (a JSON
// string of [name, value] pairs, guarded), "" when empty.
export function collectHtmlAttrsToBag(dom: Element): string {
    const bag: [string, string][] = [];
    for (const attr of Array.from(dom.attributes)) {
        if (HTML_ATTRS_GUARD.test(attr.name)) continue;
        bag.push([attr.name, attr.value]);
    }
    return bag.length ? JSON.stringify(bag) : "";
}

// Parse the bag into a guarded name -> value spec (for toDOM output
// specs and DOM application).
export function htmlAttrsBagToSpec(bagJson: string): Record<string, string> {
    const spec: Record<string, string> = {};
    if (!bagJson) return spec;
    let pairs: unknown = null;
    try {
        pairs = JSON.parse(bagJson);
    } catch {
        pairs = null;
    }
    if (!Array.isArray(pairs)) return spec;
    for (const [name, value] of pairs as [string, string][]) {
        if (HTML_ATTRS_GUARD.test(name)) continue;
        spec[name] = String(value);
    }
    return spec;
}

// Replay the bag onto a DOM element (guarded).
export function applyHtmlAttrsBag(dom: Element, bagJson: string): void {
    for (const [name, value] of Object.entries(htmlAttrsBagToSpec(bagJson)))
        dom.setAttribute(name, value);
}
