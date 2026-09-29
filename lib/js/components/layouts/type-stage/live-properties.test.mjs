import { describe, it, expect } from "vitest";

import { seedTypeSpecDefaults } from "./live-properties.typeroof.jsx";
import { FreezableMap } from "../../../metamodel.mjs";

describe("seedTypeSpecDefaults", () => {
    const base = new FreezableMap([
        ["generic/fontSize", 12],
        ["generic/baseFontSize", 12],
    ]);
    // FreezableMap freezes via Object.isFrozen (its set() then silently
    // no-ops), matching how getTypeSpecDefaultsMap freezes its result.
    Object.freeze(base);

    it("injects root font and dimensions", () => {
        const rootFont = { value: "root-font-stub" },
            width = { isLengthStub: true },
            seeded = seedTypeSpecDefaults(base, {
                rootFont,
                width,
                height: null,
            });

        expect(seeded.get("specific/font")).toBe(rootFont);
        expect(seeded.get("layout/width")).toBe(width);
        expect(seeded.has("layout/height")).toBe(false);
        // base keys survive
        expect(seeded.get("generic/fontSize")).toBe(12);
    });

    it("does not mutate the (frozen) base map", () => {
        const before = [...base.keys()];
        seedTypeSpecDefaults(base, {
            rootFont: { value: "x" },
            width: {},
            height: {},
        });
        expect([...base.keys()]).toEqual(before);
        expect(base.has("specific/font")).toBe(false);
    });

    it("seeding twice with equal inputs yields equal maps", () => {
        const a = seedTypeSpecDefaults(base, {}),
            b = seedTypeSpecDefaults(base, {});
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});
