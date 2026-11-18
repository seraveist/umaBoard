# CM first-chart contract (2026-11-18)

This is the authoritative contract for `feat/cm-first-chart` and the redesigned
root page. Older MODEL_CONTRACT/PROJECT_PLAN documents describe `legacy.html`.

The post-training extension is defined in [CM_POST_TRAINING.md](CM_POST_TRAINING.md).
It consumes this chart's checklist and full inheritance options and adds actual stats/remaining-SP
recommendation. Presentation separates purchases from evolution, while one search compares their final effects together.

The root uses two stage screens. Preparation groups character, race and deck
above the chart, with optional caps/course disclosures. Acquisition inputs are
shown in stage2 after chart completion. Both stages share one checklist and
saved plan; moving between them does not recalculate or change the records.
Setup edits require regenerating the chart before stage2 becomes available again.
See [UI verification](CM_UI_REFRESH_QA.md) for the current layout.

## Inputs and basis

- Outfit, running style, CM course/ground/weather/season/time, up to six distinct
  legal SSR supports, and a supported scenario. No SP/stat input before training.
- Optional known gate/popularity (CM9, 1–9). Missing gate is sampled uniformly;
  missing popularity uses an explicit uniform prior, not an empirical estimate.
- Scenario MAX means the scenario's verified **base five-stat caps**, without
  inheritance-dependent cap raises. Profiles 6–15 are pinned in
  `curated/cm-scenario-profiles.json`. It is not an all-2500 absolute-limit claim.
- Mood best, distance/surface/style aptitude A. Unique level comes from the owned
  outfit record; absent records default visibly to final bloom-five level six.
- Default UI baseline: the outfit's native unique only. Every candidate is added alone.
  There is no SP search and no deck speed-locking in the first-chart path.
- The evaluation API also accepts explicit `comparisonSkillIds`: a feasible,
  obtainable secured-skill context, including matching evolution options. Rows
  then measure the additional package contribution against that context, expose
  `comparisonBasis`, and mark incompatible candidates as incomparable. Recording
  checklist ownership does not silently change the ordinary UI chart baseline.
- Native unique unsupported: stop with a recoverable choice error. A physically
  inactive unique is valid and contributes zero. Never silently drop an unknown
  native effect while claiming to have applied it.

## Candidate and acquisition state

Display outfit awakening gold, scenario/deck gold, ordinary purchasable whites/factor candidates and inherited versions. Evolution rows are hidden from the first checklist. Every supported matching evolution remains in `evolutionOptions`, linked to its original rare, for joint post-training optimization. An obtainable original rare remains recordable when only its evolution is useful; unsupported original effects display an explicit unknown score rather than zero. Static impossibility and unsupported calculations otherwise exclude candidates.
Keep ordinary recovery and zero-gain candidates. Inherited skills use a separate
admission policy before merging into the same checklist:

- Use verified strengthened inherited forms 901351→91101351 (Stay Gold) and
  901411→91101411 (Epiphaneia), replacing their weaker versions. One origin per row.
- Pure recovery inherits are excluded from the default performance Top10, but
  retained in `inheritanceOptions` for actual acquisition and joint evaluation.
- Apply real fixed course/style gates first, then the internal CM9 phase/rank
  recommendation policy. Curated exceptions cover Anabolic, Angling, Tsubomi,
  Kanata and Emperor. Broad middle ranges overlap styles; unknown overtakes/gaps
  remain eligible. A viable main effect keeps a composite eligible even when an
  extra effect has a different rank requirement. This policy is a conservative
  product recommendation, not game eligibility or measured activation probability.
- Rank with the shared HP / baseline tail-time guard / mean policy, keep at most ten with gain >=0.005 lengths
  (so a displayed 0.00 is not admitted), with stable skill-ID tie breaks. The final
  table remains icon/source ordered. `전체 계승 후보 보기` exposes the full legal
  inheritance pool, including fixed-inactive/unknown scores. Recorded outside-Top10
  rows stay visible when the option is closed and enter the final optimizer.
- Lock Top10 before publishing checklist rows. Hint changes never rerank/recompute.
  At most six inherited rows may be marked purchased or Lv0–5 across all tabs and
  search results. Setting one to unavailable frees a slot. Hidden stale IDs never
  enter counts/exports. All full-pool recorded inheritance counts toward the same
  six slots. Legacy drafts over the limit retain the first six in table
  order and display an explicit migration notice.
- Ordinary checklist rows are not removed just because recommendation suitability
  is low. All speed/acceleration rows export internal suitability for later use.
  No SP or acquisition-probability optimization is performed here.

Acquisition state is separate from simulation selection. `owned` is already
purchased, `unavailable` cannot be purchased, `0`–`5` is an available unpurchased
hint level. Input does not rerun the chart or reorder rows. Per the user's
2026-11-16 update, recording an upper as purchased marks every verified lower
purchase/evolution prerequisite as purchased. Setting a lower to unavailable
clears all reachable uppers, even across tabs/search. Returning a purchased lower
to Lv0–5 also clears any acquired uppers; hints alone do not acquire lower stages.
Acquiring an evolution clears sibling evolutions of the same base, while keeping
their common lower stages acquired. Only verified purchase-stage prerequisites
and evolution rules form this hierarchy, never shared names/icons/version groups.
Old independent drafts normalize on restore: first acquired alternative in table
order wins, its lower chain is restored, and stale IDs are removed. The original
gold ID remains pricing metadata; later optimization still resolves shared costs.

Visible dropdown names are 습득 / 미획득 / 획득 / 할인 Lv1–5, while stored
owned/unavailable/0–5 values remain unchanged. Whole-list unavailable and Lv5
actions ignore the current search/tab, replace all row states atomically and
invalidate final recommendations. Lv5 hints do not purchase competing branches.
Inherited bulk selection prioritizes already secured choices and then chart
order, retaining at most six; remaining inherited rows stay unavailable.

## Numerical/model policy

Current model `cm-first-chart-v8` supports the reviewed self-performance effects,
including full-spurt acceleration, variable magnitudes/durations and repeats.
Opponent debuffs are excluded per user scope; neutral vision/lane components
retain zero direct solo margin. See [effect/price audit](CM_SELF_EFFECTS_QA.md).

- `CM_MODEL_VERSION`, integration dt and sample count are explicit result fields.
- Mean aggregates paired trajectory differences within each shared context,
  then averages context means (or applies explicit supplied context weights). Default144
  reproducible stratified samples across9 coverage contexts, dt=0.01s. Fixed-position rows use the same
  samples because race starts and HP-based spurt choices can still vary.
- Full skill/channel/dimension keys replace modulo-ID streams. Each64-sample
  block visits every stratum. Race starts, gates, popularity and native draws
  are shared by both trajectories and independent of selection/order. Baselines
  are cached per sample. Export spread/half differences are not confidence bounds.
- As of `cm-first-chart-v3`, invocation alternatives with the same spatial
  random-condition key share the sample. A stronger stat-dependent form and its
  fallback cannot independently race to activate. Explicitly linked effects
  retain their own conditions and follow-up timing.
- Own activation/heal/passive/phase counters, HP, possession, inheritance count
  and start predicates are evaluated against live state. `activation_raw=0`
  exempts wisdom checks; otherwise activation uses max(.2,1−90/rawWisdom).
  Skill lottery and shared-lottery predicates have separate draws. Native
  supplements without activation metadata use their reviewed native rarity.
- Every skill in a sample shares a single distance/rank trajectory. Rank changes
  and continuous rank-band time follow that trajectory. Unobserved other external
  numeric gates use shared threshold stress values; explicit records take priority.
  These9 synthetic cases provide coverage, not empirical frequencies or complete
  opponent/lane physics. `raceContext.scenarios` accepts up to32 named, nonnegative
  weighted contexts with provenance in `scenarioSource`. Means use scenario means,
  not accidental unequal sample counts; zero-weight cases are omitted. Recorded
  ranks and other external values remain executable. Unknown effects stay excluded.
- Optional `scenarioEvidence:{kind:'observed-counts',source,sampleSize}` requires
  an integer `observations` count for every supplied context. Weights must be
  proportional to counts; omitted weights derive from counts. These are declared
  records with `independentlyValidated:false`, not automatically verified race logs.
  Assumed weights and default stress contexts remain separately labelled.
- `activationRate` is activation within these comparison samples. The separate
  `usefulAccelerationRate` requires positive additional acceleration during any
  part of the effect's lifetime, including an effect laid before the late phase.
  It does not substitute for a final-package ablation margin. No skill/course
  blacklist or name-based penalty is used for late final-corner acceleration.
- Ownership includes verified prerequisite/transformation closure while only
  the active upper effect runs. An inherited original and strengthened effect
  share one origin/slot and one paid stage. Both options remain available for
  actual acquisition recording; strengthened requirements must actually be met.
- HP-adaptive spurt planning computes feasible start/speed from remaining HP and
  recalculates after real healing. Actual spurt state gates last-spurt conditions.
  HP depletion changes travel speed. Future recovery is never presumed.
- Repeat triggers share the distance-scaled cooldown and require it to strictly
  elapse. all_corner_random draws two different cached10m corner windows;
  straight_random draws one cached10m window. Other spatial random repeats use
  one cached10m window; non-random triggers may repeat while their specified
  temporal/spatial conditions hold. There is no reroll after cooldown.
- Above speed2000 the optional public-umasim full-spurt approximation is enabled:
  extra acceleration = .068 * base acceleration / (distance/1000)^1.5, separate
  from the ordinary speed trajectory. The source's unknown ceiling is unbounded.
  This is a versioned approximation, NOT a verified exact game formula.
- Relevant primary sources, independently consulted: mee1080/umasim
  `race/calc2/SkillChecker.kt`, `RaceState.kt`, `RaceCalculator.kt` at
  e5d940ce8f73bbb756ae3cffd0a081c34b8124da. No solver source was copied.
- HP is internal only in the first chart. Recovery can show 0.00 lengths without
  being removed. No pre-training required-stamina number is displayed.

The [v8 algorithm audit](CM_ALGORITHMS_V8_QA.md) records current results and limits.
The [v7 algorithm audit](CM_ALGORITHMS_V7_QA.md) remains a historical snapshot.
The [v6 audit](CM_ACTIVATION_PROBABILITY_QA.md) remains a historical snapshot.

## Display and performance

One semantic table, Japanese skill names with icons, mean lengths and acquisition
dropdown. Source icon families, display order and upgrade grouping determine
order between skill families. In the first chart, rare skills precede ordinary skills, with rare at depth0 and ordinary at depth1. Hidden evolution branches retain their individual IDs and parent links. Result cards show awakening and scenario evolutions separately. Verified purchase/evolution links keep families together when display metadata is missing. Missing metadata uses an
explicitly unverified deterministic fallback; exact in-game equality is not yet
claimed. No per-row condition/assumption/unsupported tags.

One category tab row follows display-icon types: all, passive, speed, recovery,
acceleration, mixed/other. A composite follows its source icon, with a semantic
fallback only when metadata is missing. Tabs have counts, arrow/Home/End keyboard
navigation, and combine with name search. Filtering preserves order/checks and
shows all matching rows. Ordinary recovery stays in the same table.

All admitted rows render without a display limit or load-more control. The table
retains its own bounded scrollbar. Worker
scores inherited candidates first, locks the default Top10, retains all scored inheritance options, then publishes ordered batches. Inputs are stable while receiving batches and progress
is count-based. New jobs cancel stale results. Draft/checklist storage is local;
scope/version prevent unrelated plans from overwriting each other. JSON export
records the input, model/version, profiles and checklist for the next stage.
Icons use silver/gold/pink rarity frames. Only rare/evolution show a Korean badge
after the skill name; normal/inherited have no visible rarity badge. The subtitle
shows possible acquisition paths for the current outfit/deck/scenario. Direct
routes follow the master acquisition records and reviewed requirements. Derived
purchase-stage routes and factor candidates are visibly inferred; absent evidence
is unknown. This does not identify which event the player actually received.
Image identity prefers `data.skills[id].icon_id` from the preserved UmaTools
`iconid`; only same-ID alpha metadata may provide a compatibility fallback.
Family/order fallback never supplies the image of a lower rarity. The static
128-icon pack covers every current normalized record, with seven added alpha
PNGs and eight additional originals from GameTora; each new file retains source
and hash evidence. An inventory/identity regression checks the entire active
catalog rather than only the current outfit/deck shortlist.
Source descriptions open on icon hover, keyboard focus, or tap, including a named
lower-skill chain. A single text-only tooltip escapes source content, avoids table
clipping, is hoverable, and supports Escape, outside interaction and scroll dismissal.

`manifest.checklist_data_sha256` scopes saved checklists using the dataset without
the display-only `icon_id` field. Its value equals the pre-icon bundle version,
so this asset update retains existing acquired/hint records. Other data changes
still change the scope; exports retain the actual full dataset version.


## Course semantics and presentation corrections

CM rank percentages compare the rank against round(9 * percentage / 100), rather
than rounding the runner's percentage. Thus <=40 includes ranks 1–4, >50 starts
at sixth, and Anabolic's 65–70 range is exactly sixth. Reference: GameTora's
[condition viewer](https://gametora.com/umamusume/skill-condition-viewer?skill=100103111).
This is independent from the recommendation bands in cm-recommendation.mjs.

Final-corner latter-half includes the final straight, and furlong is floor(x/200)
with exact 200m boundaries. Spatially impossible first invocations cannot leave
orphan same-skill linked effects. Original awakening gold remains even when all
its evolution alternatives fail fixed gates. Tight-track flags are factual values
from umasim rawData.kt at the pinned commit above, matched by course ID and
track/distance/surface/turn signature; unknown signatures remain unsupported.

The SVG has relative elevation integrated from slopes, four phase bands, and
numbered corner/straight segments. Unknown initial segments stay unknown. Values
are course distances in meters, not absolute elevation. Horizontal scroll is
bounded to the diagram on narrow screens. Niigata/Fukushima track labels and
straight-course orientation are corrected. Existing SSR thumbnails preserve their
complete square game frame; support-type badges are beside the name.
