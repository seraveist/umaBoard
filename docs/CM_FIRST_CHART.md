# CM first-chart contract (2026-11-16)

This is the authoritative contract for `feat/cm-first-chart` and the redesigned
root page. Older MODEL_CONTRACT/PROJECT_PLAN documents describe `legacy.html`.

## Inputs and basis

- Outfit, running style, CM course/ground/weather/season/time, up to six distinct
  legal SSR supports, and a supported scenario. No SP/stat input before training.
- Scenario MAX means the scenario's verified **base five-stat caps**, without
  inheritance-dependent cap raises. Profiles 6–15 are pinned in
  `curated/cm-scenario-profiles.json`. It is not an all-2500 absolute-limit claim.
- Mood best, distance/surface/style aptitude A. Unique level comes from the owned
  outfit record; absent records default visibly to final bloom-five level six.
- Baseline: the outfit's native unique only. Every candidate is added alone.
  There is no SP search and no deck speed-locking in the first-chart path.
- Native unique unsupported: stop with a recoverable choice error. A physically
  inactive unique is valid and contributes zero. Never silently drop an unknown
  native effect while claiming to have applied it.

## Candidate and acquisition state

Keep outfit awakening gold, original gold plus each evolution alternative,
scenario/deck gold, ordinary purchasable whites/factor candidates, inherited
versions. Static impossibility and unsupported calculations exclude candidates.
Keep recovery and zero-gain candidates. No inheritance Top10, marginal ranking,
late-only acceleration filter, SP or acquisition probability filtering here.

Acquisition state is separate from simulation selection. `owned` is already
purchased, `unavailable` cannot be purchased, `0`–`5` is an available unpurchased
hint level. Input does not rerun the chart, reorder rows, or resolve evolution
alternatives. Each evolution branch keeps its own acquired/hint state; recording
one branch as purchased never marks its alternatives as purchased. The original
gold ID is retained as separate pricing metadata. Later joint optimization owns
legal purchase/evolution decisions and resolves shared base costs.

## Numerical/model policy

- `CM_MODEL_VERSION`, integration dt and sample count are explicit result fields.
- Mean is an arithmetic mean of paired trajectory differences. Default 24
  deterministic low-discrepancy samples, dt=0.01s. Fixed-position rows are computed
  once only if the native baseline is also deterministic.
- Random dimensions distinguish the native and candidate skill. The same native
  sample is reused in both trajectories. Baselines are cached per sample.
- Counter, HP, possession and start predicates are fulfilled in this chart only;
  real spatial/temporal predicates and same-skill links remain. Opponent
  conditions use the existing supported model. Unknown semantics stay excluded.
- Only the two verified repeat-window types are enabled: two cached 10m corner
  windows for all_corner_random and one cached straight window for
  straight_random. Cooldown starts at activation, scales with distance, and must
  strictly elapse. No reroll after cooldown. Other repeat policies stay excluded.
- Above speed2000 the optional public-umasim full-spurt approximation is enabled:
  extra acceleration = .068 * base acceleration / (distance/1000)^1.5, separate
  from the ordinary speed trajectory. The source's unknown ceiling is unbounded.
  This is a versioned approximation, NOT a verified exact game formula.
- Relevant primary sources, independently consulted: mee1080/umasim
  `race/calc2/SkillChecker.kt`, `RaceState.kt`, `RaceCalculator.kt` at
  e5d940ce8f73bbb756ae3cffd0a081c34b8124da. No solver source was copied.
- HP is internal only in the first chart. Recovery can show 0.00 lengths without
  being removed. No pre-training required-stamina number is displayed.

## Display and performance

One semantic table, Japanese skill names with icons, mean lengths and acquisition
dropdown. Source icon families, display order and upgrade grouping determine
order. Original gold and evolutions stay together. Missing metadata uses an
explicitly unverified deterministic fallback; exact in-game equality is not yet
claimed. No per-row condition/assumption/unsupported tags.

Thirty rows initially, add thirty on demand; full candidate pool retained. Worker
publishes ordered batches. Inputs are stable while receiving batches and progress
is count-based. New jobs cancel stale results. Draft/checklist storage is local;
scope/version prevent unrelated plans from overwriting each other. JSON export
records the input, model/version, profiles and checklist for the next stage.
