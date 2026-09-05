import { describe, it, expect } from "vitest";

import { CascadingMap } from "./cascading-map.mjs";

describe("CascadingMap", () => {
    it("reads a key present in one layer", () => {
        const cascade = new CascadingMap([["local", new Map([["a", 1]])]]);
        expect(cascade.get("a")).toBe(1);
        expect(cascade.has("a")).toBe(true);
        expect(cascade.has("b")).toBe(false);
        expect(cascade.get("b")).toBe(undefined);
    });

    it("a key in two layers reads from the higher-precedence one", () => {
        const cascade = new CascadingMap([
            ["local", new Map([["a", "local"]])],
            [
                "parent",
                new Map([
                    ["a", "parent"],
                    ["b", "parent-b"],
                ]),
            ],
        ]);
        expect(cascade.get("a")).toBe("local");
        expect(cascade.get("b")).toBe("parent-b");
    });

    it("iterating yields each key once, size matches the deduped count", () => {
        const cascade = new CascadingMap([
            [
                "local",
                new Map([
                    ["a", 1],
                    ["b", 2],
                ]),
            ],
            [
                "parent",
                new Map([
                    ["b", 3],
                    ["c", 4],
                ]),
            ],
        ]);
        expect(cascade.size).toBe(3);
        expect([...cascade.keys()]).toEqual(["a", "b", "c"]);
        expect([...cascade.entries()]).toEqual([
            ["a", 1],
            ["b", 2],
            ["c", 4],
        ]);
        expect([...cascade.values()]).toEqual([1, 2, 4]);
        // Symbol.iterator yields entries
        expect([...cascade]).toEqual([
            ["a", 1],
            ["b", 2],
            ["c", 4],
        ]);
    });

    it("forEach visits value, key, cascade in effective order", () => {
        const cascade = new CascadingMap([
            ["local", new Map([["a", 1]])],
            [
                "parent",
                new Map([
                    ["a", 9],
                    ["b", 2],
                ]),
            ],
        ]);
        const seen = [];
        cascade.forEach((value, key, self) => seen.push([key, value, self]));
        expect(seen.map(([k, v]) => [k, v])).toEqual([
            ["a", 1],
            ["b", 2],
        ]);
        expect(seen[0][2]).toBe(cascade);
    });

    it("duplicate labels throw at construction", () => {
        expect(
            () =>
                new CascadingMap([
                    ["local", new Map()],
                    ["local", new Map()],
                ]),
        ).toThrow(/duplicate layer "local"/);
    });

    it("reads through a nested cascade layer", () => {
        const parent = new CascadingMap([
                ["local", new Map([["a", "parent-local"]])],
                [
                    "environment",
                    new Map([
                        ["a", "env"],
                        ["b", "env-b"],
                    ]),
                ],
            ]),
            cascade = new CascadingMap([
                ["local", new Map([["c", "own"]])],
                ["parent", parent],
            ]);
        expect(cascade.get("c")).toBe("own");
        expect(cascade.get("a")).toBe("parent-local");
        expect(cascade.get("b")).toBe("env-b");
        expect(cascade.size).toBe(3);
    });

    it("getLayer returns the addressed layer and supports ancestor chains", () => {
        const grandparent = new Map([["g", "grand"]]),
            parent = new CascadingMap([["parent", grandparent]]),
            cascade = new CascadingMap([
                ["local", new Map()],
                ["parent", parent],
            ]);
        expect(cascade.getLayer("parent")).toBe(parent);
        expect(cascade.getLayer("missing")).toBe(undefined);
        // ancestor chain: parent.parent
        expect(cascade.getLayer("parent").getLayer("parent")).toBe(grandparent);
    });

    it("toMap equals repeated reads", () => {
        const cascade = new CascadingMap([
            ["local", new Map([["a", 1]])],
            [
                "parent",
                new Map([
                    ["a", 9],
                    ["b", 2],
                ]),
            ],
        ]);
        expect(cascade.toMap()).toEqual(
            new Map([
                ["a", 1],
                ["b", 2],
            ]),
        );
    });

    it("exposes no mutation methods", () => {
        const cascade = new CascadingMap([["local", new Map()]]);
        expect(cascade.set).toBe(undefined);
        expect(cascade.delete).toBe(undefined);
        expect(cascade.clear).toBe(undefined);
    });
});
