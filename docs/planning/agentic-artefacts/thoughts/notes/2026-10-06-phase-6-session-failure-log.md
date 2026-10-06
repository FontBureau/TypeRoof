# Phase 6 session failure log (2026-10-06)

Postmortem of the overnight Phase 6 attempt of
`docs/planning/agentic-artefacts/thoughts/plan/2026-10-05-1554-cycle-1-performance-demand-measure-tracking.md`.
Reconstructed from `~/.local/share/goose/sessions/sessions.db`,
session `20261005_18` (goose v1.52.0, openrouter `openai/gpt-5.6-sol`).

## Outcome

Phase 6 made **zero progress**. Working tree is clean; all Phase 1–5
commits (`a25ca18f`..`21a57d0b`) are intact. No benchmark was ever
started; no result artefacts were produced. Nothing needs recovery.

## Timeline (local time, UTC+2)

- 22:12–00:39 — Phases 1–5 plus the cooperative-scheduler starvation
  fix committed; each commit green (suite/lint/typecheck).
- 00:42 — operator approved starting Phase 6 ("okok proceed").
- 00:42–01:08 — ~414 session messages of a non-progressing loop:
  the model repeatedly announced "Starting Phase 6 …" and re-ran the
  same inspection batch. `execute_typescript` calls using
  `Developer.shell` began returning success with an empty payload
  (`{"errors": []}`, empty stdout). The model treated every empty
  result as transient and retried the same call shape instead of
  switching to the direct `shell` tool or stopping to report.
  Repeated context compactions (33 compaction-related messages) reset
  task state, so each turn re-started the audit from scratch.
- 01:08–07:33 — ~6.4 hours with zero persisted messages: the session
  hung (stalled provider request), no timeout/heartbeat fired. This —
  not benchmarking — was the dominant time sink.
- 07:33–07:37 — the loop briefly resumed (~50 identical messages).
- 07:37 — operator intervened ("that was alll night now …").

## Root causes

1. **Tool degradation without adaptation.** Mid-session,
   `execute_typescript`/`Developer.shell` results turned empty while
   reporting success. The model retried the identical shape hundreds
   of times. Missing guardrail: after N empty/identical tool results,
   switch tool or stop and ask.
2. **Compaction churn.** Frequent compaction during the loop erased
   Phase-6 working state; the re-read-then-re-announce pattern
   consumed the rest of the context, triggering more compaction.
3. **Silent multi-hour hang.** No progress heartbeat, no turn timeout;
   6.4 h elapsed with nothing persisted.
4. **Phase 6 scope is structurally too heavy for one session.** The
   plan's full matrix is 36 steady scenarios x (fresh 1087-node
   Wikipedia fixture load + 5 warmups + 30 timed ops) + 18 transition
   scenarios + 45 cold loads + 2 CDP profiles — plausibly 2–4 h even
   when everything works — and the harness only persists results at
   the end of a run, so a mid-run failure yields nothing.

## Salvageable assets

- `scripts/perf-composition` (+ `-lib.mjs`, `-page.mjs`): working
  harness with a `quick` suite (6 representative scenarios) next to
  the exhaustive `full` suite.
- `scripts/perf-composition.baseline.json`: pre-Cycle-1 "before"
  numbers (commit `521db920`): typing ratio 1.017, recompose 1.266.
- `artifacts/perf-composition/2026-10-05T17-15-49-286Z/` and
  `…T19-40-04-367Z/`: before `.cpuprofile` pairs (cold editor fit,
  warm viewer fit recompose).

## Rules for the Phase 6 retry

- Never run the `full` suite inside an interactive agent session;
  use `quick` (or a further reduced sampling) for the demand-aware
  reprofile, and run any heavy suite detached (`nohup`, progress log
  file) with the agent polling, not blocking.
- Make the harness persist per-scenario JSON incrementally so partial
  runs survive.
- Split Phase 6: 6a = quick demand-aware reprofile + structural
  zero-work verification + report; 6b = baseline write + ROADMAP
  update, only after operator review of 6a.
- Agent rule: two consecutive empty/identical tool results → switch
  tool or stop and report; never retry the same shape a third time.
