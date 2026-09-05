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

    it("injects root font, environment facts and dimensions", () => {
        const environment = {
                layout: { width: 800, height: 600 },
                screen: { width: 1024, height: 768 },
                viewport: { width: 500, height: 400 },
                dpr: 1,
            },
            rootFont = { value: "root-font-stub" },
            width = { isLengthStub: true },
            seeded = seedTypeSpecDefaults(base, {
                rootFont,
                environment,
                width,
                height: null,
            });

        expect(seeded.get("specific/font")).toBe(rootFont);
        expect(seeded.get("specific/root/environment/layout/width")).toBe(800);
        expect(seeded.get("specific/root/environment/layout/height")).toBe(600);
        expect(seeded.get("specific/root/environment/dpr")).toBe(1);
        expect(seeded.get("specific/root/width")).toBe(width);
        expect(seeded.has("specific/root/height")).toBe(false);
        // base keys survive
        expect(seeded.get("generic/fontSize")).toBe(12);
    });

    it("does not mutate the (frozen) base map", () => {
        const before = [...base.keys()];
        seedTypeSpecDefaults(base, {
            rootFont: { value: "x" },
            environment: {
                layout: { width: 1, height: 2 },
                screen: { width: 3, height: 4 },
                viewport: { width: 5, height: 6 },
                dpr: 2,
            },
            width: {},
            height: {},
        });
        expect([...base.keys()]).toEqual(before);
        expect(base.has("specific/font")).toBe(false);
        expect(base.has("specific/root/environment/layout/width")).toBe(false);
    });

    it("seeding twice with equal inputs yields equal maps", () => {
        const environment = {
                layout: { width: 800, height: 600 },
                screen: { width: 1024, height: 768 },
                viewport: { width: 500, height: 400 },
                dpr: 1,
            },
            a = seedTypeSpecDefaults(base, { environment }),
            b = seedTypeSpecDefaults(base, { environment });
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});
