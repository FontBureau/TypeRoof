import path from "node:path";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
    ALGORITHMS,
    EXPECTED_COMPOSITION_BLOCKS,
    RENDERER_MODES,
    TRANSITION_WORKLOADS,
    WORKLOADS,
} from "./perf-composition-page.mjs";

export const scenarioKey = ({ rendererMode, algorithm, workload }) =>
    `${rendererMode}/${algorithm}/${workload}`;

const matrixOf = (workloads) => {
    const result = [];
    for (const [workloadIndex, workload] of workloads.entries()) {
        const modes = workloadIndex % 2 === 0 ? RENDERER_MODES : [...RENDERER_MODES].reverse();
        for (const [modeIndex, rendererMode] of modes.entries()) {
            const algorithms =
                (workloadIndex + modeIndex) % 2 === 0
                    ? ALGORITHMS
                    : [...ALGORITHMS].reverse();
            for (const algorithm of algorithms)
                result.push({ rendererMode, algorithm, workload });
        }
    }
    return result;
};

export function scenarioMatrix(suite = "full") {
    if (suite === "quick")
        return [
            // typing arms run in VIEWER mode: since the per-textblock
            // demand lifecycle (f7c3c374) editor-only mode performs
            // zero composition by design, so an editor typing arm
            // would measure no algorithm work; the workload edits
            // the model directly (shell.changeState), no ProseMirror
            // needed
            { rendererMode: "viewer", algorithm: "none", workload: "typing" },
            { rendererMode: "viewer", algorithm: "ragged", workload: "typing" },
            { rendererMode: "viewer", algorithm: "fit", workload: "typing" },
            // milestone 5 validation: KP on the two representative
            // workloads, against the fit baseline (>3x is the
            // tripwire for discussion, not a gate)
            { rendererMode: "viewer", algorithm: "kp", workload: "typing" },
            {
                rendererMode: "viewer",
                algorithm: "ragged",
                workload: "relevant-style",
            },
            {
                rendererMode: "editor",
                algorithm: "ragged",
                workload: "irrelevant-style",
            },
            {
                rendererMode: "viewer",
                algorithm: "ragged",
                workload: "inherited-style-partial-recompose",
            },
            {
                rendererMode: "viewer",
                algorithm: "fit",
                workload: "inherited-style-partial-recompose",
            },
            {
                rendererMode: "viewer",
                algorithm: "kp",
                workload: "inherited-style-partial-recompose",
            },
        ];
    return matrixOf(WORKLOADS);
}

export function transitionMatrix(suite = "full") {
    if (suite === "quick")
        return [
            {
                rendererMode: "viewer",
                algorithm: "ragged",
                workload: "mode-transition",
            },
            {
                // viewer: the algorithm switch recomposes all blocks
                // only under composition demand (f7c3c374)
                rendererMode: "viewer",
                algorithm: "ragged",
                workload: "algorithm-transition",
            },
        ];
    return matrixOf(TRANSITION_WORKLOADS);
}

export function coldMatrix(suite = "full") {
    if (suite === "quick")
        return [
            // viewer mode: cold full-compose (209 blocks) is the
            // structural signal; editor-only composes nothing since
            // the demand lifecycle (f7c3c374)
            { rendererMode: "viewer", algorithm: "none" },
            { rendererMode: "viewer", algorithm: "ragged" },
        ];
    return RENDERER_MODES.flatMap((rendererMode, modeIndex) => {
        const algorithms = modeIndex % 2 === 0 ? ALGORITHMS : [...ALGORITHMS].reverse();
        return algorithms.map((algorithm) => ({ rendererMode, algorithm }));
    });
}

export function summarize(samples) {
    if (samples.length === 0)
        return { count: 0, totalMs: 0, minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
    const sorted = [...samples].sort((a, b) => a - b),
        quantile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
    return {
        count: sorted.length,
        totalMs: samples.reduce((sum, value) => sum + value, 0),
        minMs: sorted[0],
        medianMs: quantile(0.5),
        p95Ms: quantile(0.95),
        maxMs: sorted.at(-1),
    };
}

export function summarizeCold(coldSamples) {
    const grouped = new Map();
    for (const sample of coldSamples) {
        const key = `${sample.rendererMode}/${sample.algorithm}`,
            group = grouped.get(key) ?? [];
        group.push(sample);
        grouped.set(key, group);
    }
    return [...grouped].map(([key, samples]) => ({
        key,
        rendererMode: samples[0].rendererMode,
        algorithm: samples[0].algorithm,
        shellReadyMs: summarize(samples.map(({ shellReadyMs }) => shellReadyMs)),
        firstPublicationMs: summarize(
            samples.flatMap(({ publications }) =>
                publications.firstMs === null ? [] : [publications.firstMs],
            ),
        ),
        allPublicationsMs: summarize(
            samples.flatMap(({ publications }) =>
                publications.allMs === null ? [] : [publications.allMs],
            ),
        ),
    }));
}

export function aggregateRatios(steadyScenarios) {
    const groups = new Map();
    for (const scenario of steadyScenarios) {
        const key = `${scenario.rendererMode}/${scenario.workload}`,
            group = groups.get(key) ?? new Map();
        group.set(scenario.algorithm, scenario.summary.totalMs);
        groups.set(key, group);
    }
    return [...groups].flatMap(([key, totals]) => {
        const noneTotal = totals.get("none");
        if (noneTotal === undefined) return [];
        return ALGORITHMS.filter((algorithm) => algorithm !== "none").flatMap((algorithm) => {
            const numeratorTotalMs = totals.get(algorithm);
            return numeratorTotalMs === undefined
                ? []
                : [
                      {
                          key: `${key}/${algorithm}-vs-none`,
                          rendererMode: key.split("/")[0],
                          workload: key.split("/")[1],
                          algorithm,
                          numeratorTotalMs,
                          denominatorTotalMs: noneTotal,
                          ratio: numeratorTotalMs / noneTotal,
                      },
                  ];
        });
    });
}

export function summarizeCPUProfile(profile, limit = 20) {
    const nodes = new Map(profile.nodes.map((node) => [node.id, node])),
        selfMicros = new Map();
    for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
        const id = profile.samples[index], delta = profile.timeDeltas[index] ?? 0;
        selfMicros.set(id, (selfMicros.get(id) ?? 0) + delta);
    }
    return [...selfMicros]
        .map(([id, microseconds]) => {
            const frame = nodes.get(id)?.callFrame ?? {};
            return {
                functionName: frame.functionName || "(anonymous)",
                url: frame.url || "",
                lineNumber: (frame.lineNumber ?? -1) + 1,
                selfMs: microseconds / 1000,
            };
        })
        .sort((left, right) => right.selfMs - left.selfMs)
        .slice(0, limit);
}

const expectedPublicationCount = ({ workload, algorithm, rendererMode }) => {
    if (algorithm === "none" || workload === "irrelevant-style") return 0;
    if (workload === "typing") return 1;
    if (workload === "relevant-style") return null;
    // steady count on the Wikipedia fixture since the demand
    // lifecycle (f7c3c374) — 10 before it; 9 observed uniformly
    // across ragged/fit/kp (2026-10-06)
    if (workload === "inherited-style-partial-recompose") return 9;
    // the workload's rendererMode is the TARGET mode: attaching a
    // viewer (or compare) composes all blocks; editor-only composes
    // nothing (demand lifecycle, f7c3c374)
    if (workload === "mode-transition")
        return rendererMode === "editor" ? 0 : EXPECTED_COMPOSITION_BLOCKS;
    if (workload === "algorithm-transition")
        return rendererMode === "editor" ? 0 : EXPECTED_COMPOSITION_BLOCKS;
    throw new Error(`unknown publication expectation for ${workload}`);
};

const validatePublications = (item, errors) => {
    const expected = expectedPublicationCount(item);
    for (const [index, sample] of item.samples.entries()) {
        const actual = sample.publications.count,
            valid = expected === null ? actual > 0 : actual === expected;
        if (!valid)
            errors.push(
                `publication count ${scenarioKey(item)} sample ${index}: ${actual}, expected ${expected ?? ">0"}`,
            );
    }
};

export function validateResult(result) {
    const errors = [];
    if (result.schemaVersion !== 1) errors.push("schemaVersion must be 1");
    if (result.suite === "quick" || result.suite === "full") {
        const expectedCold = coldMatrix(result.suite),
            expectedSteady = scenarioMatrix(result.suite),
            expectedTransitions = transitionMatrix(result.suite);
        for (const arm of expectedCold) {
            const matches = result.cold.filter(
                (item) => item.rendererMode === arm.rendererMode && item.algorithm === arm.algorithm,
            );
            if (matches.length !== result.sampling.coldSamples)
                errors.push(`cold ${arm.rendererMode}/${arm.algorithm}: ${matches.length}`);
            for (const sample of matches) {
                // editor-only composes nothing (demand lifecycle,
                // f7c3c374); viewer/compare compose all blocks
                const expected =
                    sample.algorithm === "none" ||
                    sample.rendererMode === "editor"
                        ? 0
                        : EXPECTED_COMPOSITION_BLOCKS;
                if (sample.publications.count !== expected)
                    errors.push(
                        `cold publications ${arm.rendererMode}/${arm.algorithm}: ${sample.publications.count}, expected ${expected}`,
                    );
            }
        }
        const steady = new Map(result.steady.map((item) => [scenarioKey(item), item]));
        for (const scenario of expectedSteady) {
            const item = steady.get(scenarioKey(scenario));
            if (!item) errors.push(`missing steady ${scenarioKey(scenario)}`);
            else {
                if (
                    item.samples.length !== result.sampling.steadySamples ||
                    item.summary.count !== result.sampling.steadySamples ||
                    item.warmups !== result.sampling.warmups
                ) errors.push(`invalid samples ${scenarioKey(scenario)}`);
                validatePublications(item, errors);
            }
        }
        for (const transition of expectedTransitions) {
            const item = result.transitions.find(
                (candidate) => scenarioKey(candidate) === scenarioKey(transition),
            );
            if (!item) errors.push(`missing transition ${scenarioKey(transition)}`);
            else {
                if (item.samples.length !== result.sampling.transitionSamples)
                    errors.push(`invalid transition samples ${scenarioKey(transition)}`);
                validatePublications(item, errors);
            }
        }
        if (result.steady.length !== expectedSteady.length)
            errors.push(`steady scenario count ${result.steady.length}, expected ${expectedSteady.length}`);
        if (result.transitions.length !== expectedTransitions.length)
            errors.push(
                `transition scenario count ${result.transitions.length}, expected ${expectedTransitions.length}`,
            );
        if (result.coldSummary.length !== expectedCold.length)
            errors.push(`cold summary count ${result.coldSummary.length}, expected ${expectedCold.length}`);
    } else if (result.suite === "profile") {
        if (result.profiles.length !== 2) errors.push("profile suite requires cold and warm profiles");
        for (const profile of result.profiles)
            if (!profile.outputPath.endsWith(".cpuprofile") || profile.dominantStacks.length === 0)
                errors.push(`invalid ${profile.kind} CPU profile`);
    } else errors.push(`unknown suite ${result.suite}`);
    if (errors.length) throw new Error("RESULT VALIDATION FAILED:\n- " + errors.join("\n- "));
    return true;
}

export function gitCommit() {
    try { return execSync("git rev-parse --short HEAD").toString().trim(); }
    catch { return "unknown"; }
}

export function writeJSON(filePath, value) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

export function readJSON(filePath) {
    return JSON.parse(readFileSync(filePath, "utf8"));
}
