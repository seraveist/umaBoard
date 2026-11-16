# CM first-chart contract (2026-11-16)

This is the authoritative contract for `feat/cm-first-chart` and the redesigned
root page. Older MODEL_CONTRACT/PROJECT_PLAN documents describe `legacy.html`.

The post-training extension is defined in [CM_POST_TRAINING.md](CM_POST_TRAINING.md).
It consumes this chart's fixed checklist and adds actual stats/remaining-SP
recommendation without changing this stage's rows, ordering or acquisition rules.

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
Keep ordinary recovery and zero-gain candidates. Inherited skills use a separate
admission policy before merging into the same checklist:

- Use verified strengthened inherited forms 901351→91101351 (Stay Gold) and
  901411→91101411 (Epiphaneia), replacing their weaker versions. One origin per row.
- Exclude pure recovery inherits. Positive speed/acceleration composites may heal.
- Apply real fixed course/style gates first, then the internal CM9 phase/rank
  recommendation policy. Curated exceptions cover Anabolic, Angling, Tsubomi,
  Kanata and Emperor. Broad middle ranges overlap styles; unknown overtakes/gaps
  remain eligible. A viable main effect keeps a composite eligible even when an
  extra effect has a different rank requirement. This policy is a conservative
  product recommendation, not game eligibility or measured activation probability.
- Rank by unrounded arithmetic mean, keep at most ten with gain >=0.005 lengths
  (so a displayed 0.00 is not admitted), with stable skill-ID tie breaks. The final
  table remains icon/source ordered. No outside-Top10 acquired exceptions.
- Lock Top10 before publishing checklist rows. Hint changes never rerank/recompute.
  At most six inherited rows may be marked purchased or Lv0–5 across all tabs and
  search results. Setting one to unavailable frees a slot. Hidden stale IDs never
  enter counts/exports. Legacy drafts over the limit retain the first six in table
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

## Numerical/model policy

- `CM_MODEL_VERSION`, integration dt and sample count are explicit result fields.
- Mean is an arithmetic mean of paired trajectory differences. Default 24
  deterministic low-discrepancy samples, dt=0.01s. Fixed-position rows are computed
  once only if the native baseline is also deterministic.
- Random dimensions distinguish the native and candidate skill. The same native
  sample is reused in both trajectories. Baselines are cached per sample.
- Counter, HP, possession and start predicates are fulfilled in this chart only;
  real spatial/temporal predicates and same-skill links remain. Rank, position, temptation, counters, other-runner and skill-possession triggers
  are assumed successful, including same-style counts and popularity matching.
  Unknown effect mathematics still stay excluded. Real distance/style/weather and
  temporal/spatial predicates are never erased.
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
order between skill families. Within a family, evolutions come first (including
alternative branches at the same depth), followed by rare and ordinary skills.
Each present lower rarity tier indents one step: evolution0 → rare1 → ordinary2,
or rare0 → ordinary1 when no evolution is present. Standalone ordinary and
inherited skills remain unindented. Search and tabs preserve the full checklist's
depth and source order. Verified purchase/evolution links also keep families
together when display metadata is missing. Original gold and evolutions stay together. Missing metadata uses an
explicitly unverified deterministic fallback; exact in-game equality is not yet
claimed. No per-row condition/assumption/unsupported tags.

One category tab row follows display-icon types: all, passive, speed, recovery,
acceleration, mixed/other. A composite follows its source icon, with a semantic
fallback only when metadata is missing. Tabs have counts, arrow/Home/End keyboard
navigation, and combine with name search. Filtering preserves order/checks and
shows all matching rows. Ordinary recovery stays in the same table.

All admitted rows render without a display limit or load-more control. The table
retains its own bounded scrollbar. Worker
scores inherited candidates first, locks Top10, then publishes ordered batches. Inputs are stable while receiving batches and progress
is count-based. New jobs cancel stale results. Draft/checklist storage is local;
scope/version prevent unrelated plans from overwriting each other. JSON export
records the input, model/version, profiles and checklist for the next stage.
Icons use silver/gold/pink rarity frames with Korean 일반/레어/진화/계승 labels.
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
