/*
 * Based on (https://github.com/gdsmith/jquery.easing/blob/master/jquery.easing.js)
 *
 * jQuery Easing v1.4.1 - http://gsgd.co.uk/sandbox/jquery/easing/
 * Open source under the BSD License.
 * Copyright © 2008 George McGinley Smith
 * All rights reserved.
 * https://raw.github.com/gdsmith/jquery.easing/master/LICENSE
 *
 * Added TypeScript using an LLM with the types from
 * https://github.com/ai/easings.net/blame/master/src/easings/easingsFunctions.ts
 *
 * I chose that way because easings.net uses GPLv3 which is incompatible
 * with this Projects APACHE-2 license, but it used the same source, so,
 * we just replicate.
 *
 */

type EasingFunction = (progress: number) => number;

/// START jquery.easing

// Infers the literal key union from the entries while constraining every
// value to EasingFunction, so we don't have to repeat the key names.
function buildEasingMap<K extends string>(
    entries: ReadonlyArray<readonly [K, EasingFunction]>,
): Map<K, EasingFunction> {
    return new Map(entries);
}

const pow = Math.pow,
    sqrt = Math.sqrt,
    sin = Math.sin,
    cos = Math.cos,
    PI = Math.PI,
    c1 = 1.70158,
    c2 = c1 * 1.525,
    c3 = c1 + 1,
    c4 = (2 * PI) / 3,
    c5 = (2 * PI) / 4.5;
// x is the fraction of animation progress, in the range 0..1
function bounceOut(x: number): number {
    const n1 = 7.5625,
        d1 = 2.75;
    if (x < 1 / d1) {
        return n1 * x * x;
    } else if (x < 2 / d1) {
        return n1 * (x -= 1.5 / d1) * x + 0.75;
    } else if (x < 2.5 / d1) {
        return n1 * (x -= 2.25 / d1) * x + 0.9375;
    } else {
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }
}

const easingFunctions = buildEasingMap([
    ["linear", (x) => x],
    ["easeInQuad", (x) => x * x],
    ["easeOutQuad", (x) => 1 - (1 - x) * (1 - x)],
    [
        "easeInOutQuad",
        (x) => (x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2),
    ],
    ["easeInCubic", (x) => x * x * x],
    ["easeOutCubic", (x) => 1 - pow(1 - x, 3)],
    [
        "easeInOutCubic",
        (x) => (x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2),
    ],
    ["easeInQuart", (x) => x * x * x * x],
    ["easeOutQuart", (x) => 1 - pow(1 - x, 4)],
    [
        "easeInOutQuart",
        (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - pow(-2 * x + 2, 4) / 2),
    ],
    ["easeInQuint", (x) => x * x * x * x * x],
    ["easeOutQuint", (x) => 1 - pow(1 - x, 5)],
    [
        "easeInOutQuint",
        (x) => (x < 0.5 ? 16 * x * x * x * x * x : 1 - pow(-2 * x + 2, 5) / 2),
    ],
    ["easeInSine", (x) => 1 - cos((x * PI) / 2)],
    ["easeOutSine", (x) => sin((x * PI) / 2)],
    ["easeInOutSine", (x) => -(cos(PI * x) - 1) / 2],
    ["easeInExpo", (x) => (x === 0 ? 0 : pow(2, 10 * x - 10))],
    ["easeOutExpo", (x) => (x === 1 ? 1 : 1 - pow(2, -10 * x))],
    [
        "easeInOutExpo",
        (x) =>
            x === 0
                ? 0
                : x === 1
                  ? 1
                  : x < 0.5
                    ? pow(2, 20 * x - 10) / 2
                    : (2 - pow(2, -20 * x + 10)) / 2,
    ],
    ["easeInCirc", (x) => 1 - sqrt(1 - pow(x, 2))],
    ["easeOutCirc", (x) => sqrt(1 - pow(x - 1, 2))],
    [
        "easeInOutCirc",
        (x) =>
            x < 0.5
                ? (1 - sqrt(1 - pow(2 * x, 2))) / 2
                : (sqrt(1 - pow(-2 * x + 2, 2)) + 1) / 2,
    ],
    [
        "easeInElastic",
        (x) =>
            x === 0
                ? 0
                : x === 1
                  ? 1
                  : -pow(2, 10 * x - 10) * sin((x * 10 - 10.75) * c4),
    ],
    [
        "easeOutElastic",
        (x) =>
            x === 0
                ? 0
                : x === 1
                  ? 1
                  : pow(2, -10 * x) * sin((x * 10 - 0.75) * c4) + 1,
    ],
    [
        "easeInOutElastic",
        (x) =>
            x === 0
                ? 0
                : x === 1
                  ? 1
                  : x < 0.5
                    ? -(pow(2, 20 * x - 10) * sin((20 * x - 11.125) * c5)) / 2
                    : (pow(2, -20 * x + 10) * sin((20 * x - 11.125) * c5)) / 2 +
                      1,
    ],
    ["easeInBack", (x) => c3 * x * x * x - c1 * x * x],
    ["easeOutBack", (x) => 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2)],
    [
        "easeInOutBack",
        (x) =>
            x < 0.5
                ? (pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
                : (pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,
    ],
    ["easeInBounce", (x) => 1 - bounceOut(1 - x)],
    ["easeOutBounce", bounceOut],
    [
        "easeInOutBounce",
        (x) =>
            x < 0.5
                ? (1 - bounceOut(1 - 2 * x)) / 2
                : (1 + bounceOut(2 * x - 1)) / 2,
    ],
]);

type EasingName = Parameters<(typeof easingFunctions)["get"]>[0];

/// END jquery.easing

export { easingFunctions };
export type { EasingFunction, EasingName };
