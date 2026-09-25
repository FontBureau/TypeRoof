import { describe, it, expect } from "vitest";

import { Path } from "../../../../metamodel.mjs";
import { getStyleLinkPropertiesId } from "./derivations.mjs";

// Minimal protocol-handler stub: registers everything it's asked about.
function makeWidgetBus(registered = true) {
    return {
        getProtocolHandlerImplementation: () => ({
            hasRegistered: () => registered,
        }),
    };
}

describe("styleLinkProperties@ id construction", () => {
    it("matches the former editor-side construction byte-identically", () => {
        const typeSpecProperties =
                "typeSpecProperties@/activeState/typeSpec/children/paragraphs",
            fieldName = "marks/strong",
            styleLink = "strong",
            // former editor construction (pre-dedup):
            legacyId = `styleLinkProperties@${Path.fromParts(
                typeSpecProperties.slice("typeSpecProperties@".length),
                fieldName,
                styleLink,
            )}`,
            // shared construction via the derivations.mjs function:
            sharedId = getStyleLinkPropertiesId(
                makeWidgetBus(),
                Path.fromString(
                    typeSpecProperties.slice("typeSpecProperties@".length),
                ),
                fieldName,
                styleLink,
            );
        expect(sharedId).toBe(legacyId);
    });

    it("returns null when the id is not registered", () => {
        expect(
            getStyleLinkPropertiesId(
                makeWidgetBus(false),
                Path.fromString("/activeState/typeSpec"),
                "marks/strong",
                "strong",
            ),
        ).toBe(null);
    });
});
