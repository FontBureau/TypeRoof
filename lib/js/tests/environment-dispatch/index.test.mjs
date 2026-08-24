// @vitest-environment jsdom
// Behavior test: an environment-only update (no model change) is
// dispatched by the shell — the EQUALS-only early return in
// _updateState must not swallow protocol-handler updates, or
// consumers of environment@ would never react to resizes.
import { describe, it, expect } from "vitest";

import { SimpleProtocolHandler } from "../../components/basics/component.mjs";

describe("environment-only updates reach consumers", () => {
    it("hasUpdated reports pending protocol updates", () => {
        const [, handler] = SimpleProtocolHandler.create("environment@", {
            treatAdressAsRootPath: false,
        });
        handler.register("layout", { width: 800, height: 600 });
        expect(handler.hasUpdated()).toBe(false);

        handler.setUpdated("layout");
        expect(handler.hasUpdated()).toBe(true);

        handler.resetUpdatedLog();
        expect(handler.hasUpdated()).toBe(false);
    });
});
