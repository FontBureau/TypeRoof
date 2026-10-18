import { describe, it, expect } from "vitest";
import { isWikiLink, wikiLinkSlug } from "./wiki-links";

describe("wikipedia wiki-links (in-document navigation policy)", () => {
    it("isWikiLink: only a mw:WikiLink rel token makes a wikilink", () => {
        expect(isWikiLink("mw:WikiLink")).toBe(true);
        // rel token lists are space separated
        expect(isWikiLink("mw:WikiLink other")).toBe(true);
        expect(isWikiLink("other mw:WikiLink")).toBe(true);
        expect(isWikiLink("mw:ExtLink nofollow")).toBe(false);
        expect(isWikiLink("mw:referencedBy")).toBe(false);
        expect(isWikiLink("")).toBe(false);
        expect(isWikiLink(null)).toBe(false);
    });

    it("wikiLinkSlug: strips ./ and fragment, decodes percent-encoding", () => {
        expect(wikiLinkSlug("./Desktop_publishing")).toBe("Desktop_publishing");
        expect(wikiLinkSlug("./Typography#cite_ref-26")).toBe("Typography");
        expect(wikiLinkSlug("./M%C3%BCnchen")).toBe("München");
        // malformed percent-encoding falls back to the raw slug
        expect(wikiLinkSlug("./100%_sure")).toBe("100%_sure");
    });
});
