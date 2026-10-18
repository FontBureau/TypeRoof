// Wikipedia in-document link policy for the demo (see main.mjs):
// Parsoid marks wiki-internal links with the "mw:WikiLink" token in
// rel and points them at "./<slug>[#<fragment>]" — the fragment
// addresses source anchors which the ingested document has none of,
// so only the slug survives as the load target.

// The rel tokens are space separated (Parsoid may emit more than
// one, e.g. rel="mw:ExtLink nofollow").
export function isWikiLink(rel: string | null): boolean {
    return (rel ?? "").split(/\s+/).includes("mw:WikiLink");
}

// The article slug to load for a wikilink href: without the "./"
// prefix and the fragment, with the percent-encoding decoded (what
// the slug input of the load form carries, too).
export function wikiLinkSlug(href: string): string {
    const raw = href.replace(/^\.?\//, "").replace(/#.*$/, "");
    try {
        return decodeURIComponent(raw);
    } catch {
        // malformed percent-encoding: try the slug verbatim
        return raw;
    }
}
