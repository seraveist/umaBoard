# CM workspace behavior

Business authority: `PRODUCT.md`, `docs/CM_FIRST_CHART.md`, and the user's
2026-11-16 decisions. `legacy.html` is retained but has its own old contract.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Navigation | cm-workflow.mjs | PRODUCT / DESIGN | stage tabs / responsive record-result tabs | keyboard + browser |
| Form | cm-app.mjs / cm-final-ui.mjs | CM_FIRST_CHART / CM_POST_TRAINING | race / owned profile / post-training | unit + browser |
| Select/Listbox | native select, native dialog option buttons | DESIGN | platform popup / searchable dialog | keyboard + browser |
| Table Selection | cm-state.mjs | CM_FIRST_CHART | acquisition dropdown / atomic whole-list settings | unit + browser |
| Scrollbar | cm.css global baseline | DESIGN | bounded table / dialog body | browser |
| Toast | stable inline cm-notice live region | DESIGN | status / error | browser |
| Skill details | cm-skill-details.mjs | DESIGN | hover / focus / tap | browser |

Under the user's quiet-copy update, omit general instructions, policy prose,
list-footer repetition and routine save/restore/export/completion success copy.
Keep semantic labels, source routes, actual numbers and necessary error,
progress, cancellation, storage-failure and inherited-limit state. Empty live
regions occupy no visible row. Exported model/provenance and stored drafts retain
their existing meaning. Stale results say `재추천 필요`, disable export and expose
`다시 추천`; data changes do not silently recalculate.

Two native button tabs control preparation and post-training tabpanels. Selected
state, roving tabindex and Arrow/Home/End navigation remain synchronized. Stage2
is disabled until a complete first chart exists; setup changes invalidate it.
Continue and edit-preparation actions restore focus to the relevant stage/input.
Stage changes move the existing checklist into its visible slot, never clone it
or create a second draft. Search, category, row identity, recorded states, actual
inputs and valid final results survive navigation without calculation. Skill
details dismiss when the stage changes. Stage1 hides acquisition/bulk controls;
stage2 exposes them. Reload starts at preparation because charts are explicitly
regenerated, then restores the corresponding plan's saved records and inputs.

At widths up to860px, native record/result tabs display one existing panel at a
time. Their selection, roving tabindex and Arrow/Home/End behavior stay in sync.
Desktop displays both panels and removes the mobile tabpanel roles/labels.
Resizing recovers focus from a newly hidden panel or tab. Tabs never duplicate
the checklist, discard search/scroll/records, or trigger calculation. The actual
input form and submit/cancel/progress/status remain common to both views.

`cm-final-ui.mjs` owns the native actual-input disclosure: expanded for each
restored/new chart, collapsed after a successful recommendation, manually
reopenable without invalidation. Invalid inputs reopen it before first-error
focus. The external submit button explicitly owns `final-form`. Success selects
the mobile result panel before focusing its title; background completion does
not focus a hidden stage. Disclosure/view selection is transient UI state;
the existing plan key and saved input/acquisition schema are unchanged.

Generate validates without native validation bubbles; focus the first relevant
field on recoverable failure. Same inputs reuse calculation cache. Recalculation
never changes acquisition states. A stale result cannot overwrite a new request.
Cancel stops new batches and preserves completed data; setup edits mark the
displayed result as belonging to its previous input until regenerated.

LocalStorage contains only local settings/owned outfit levels/acquisition drafts,
no secrets or account data. Persisting local app state replaces URL paging because
this is a private transient draft, not a remotely queried/shared dataset. Failed
storage is disclosed and does not prevent calculation. Export is a user-triggered
JSON download. No external writes/messaging or irreversible mutations.

The dropdown records acquisition without altering the simulated mean gain.
Course selection uses the same reviewed-coordinate support gate as calculation.
Reviewed zero-runup US courses use Korean track labels; missing/conflicting or
positive-runup geometry remains unavailable. This does not change selection,
keyboard, invalidation or stage-transition behavior. See `docs/CM_ALGORITHMS_V9_QA.md`.
Under the user's 2026-11-16 update, acquired upper skills also mark every verified
lower purchase/evolution stage acquired. An unavailable lower stage clears every
linked upper. Returning a purchased lower stage to a hint clears acquired uppers.
Acquiring one evolution clears its sibling alternatives and keeps the common lower
stages acquired. Ordinary display groups/version families do not imply dependency.
Rows preserve identity/focus while progress arrives. All admitted rows render in
the internally scrollable table; search and tabs filter the entire pool. No unmatched
query reports a dedicated no-results state. JP names stay JP, all UI copy and
accessible names Korean. Locale ko-KR, timezone Asia/Seoul for export timestamps.

The 2026-11-17 first-chart hierarchy shows rare → ordinary, with rare at depth0 and ordinary at depth1. Evolution branches are hidden here and retained as internal planning options. Final results have separate awakening/scenario evolution sections and a complete active list.
Category/search filtering preserves these depths; gain/state columns stay aligned.


The icon-category tab row is a view of the same canonical checklist. It never
reruns calculations, changes source order or discards acquisition states. Tabs
have arrow/Home/End keyboard navigation and counts; tab/search changes retain all
matching rows without a display batch. Source icons determine mixed-effect categories.
Inheritance Top10 is frozen before rows appear; the shared six-slot limit counts
purchased and Lv0–5 states across every view and full inheritance options. The
native `전체 계승 후보 보기` checkbox exposes all inherited rows; recorded outside
Top10 rows remain visible after it closes. It does not rerun or discard records.
A seventh attempt restores the
previous select value and reports the six-slot limit in the live draft status.

Post-training inputs remain hidden and disabled until a complete first chart exists. The
actual five stats and remaining SP start blank; aptitudes default to A. Inputs
use native controls and explicit validation with text, aria-invalid and first
error focus. Remaining SP excludes past purchases. Paid skills remain fixed as
purchase history, while a genuine upgrade replaces their lower active effect.
Hints use recorded levels; a native discount select chooses none/Studious/Fast
Learner and adds0/4/10 percentage points to each unpaid stage before flooring.
`cm-discounts.mjs` owns trait labels, rates and strict input normalization.
`postTraining.values.discountTrait` is canonical; saved legacy `fastLearner:true`
restores Fast Learner, false/missing restores none. New explicit choices take
precedence. The legacy boolean remains derived for compatibility in saved inputs
and exports, so it never stacks with Studious. Selection persists per plan and
cancels stale work on change. UI restoration tolerates malformed legacy drafts;
calculation input rejects unknown choices.

Native optional gate/popularity selects appear in collapsed race-context details
in both stages. Missing values visibly say uniform assumption. Changed values
invalidate the corresponding calculation; they do not create a new acquisition
history scope. Stage2 restores its own values, falling back to the chart context.
Collapsed `발동 조건과 표본` details disclose self/probability sampling, opponent
assumptions and full-spurt approximation. Result HP text gives sampled success
count/total. No per-row warning badges or expanded policy prose are added.

`cm-final-plan.mjs` owns stage pricing and combination recommendation; the shared
discount function remains in `purchases.mjs`. `cm-final-ui.mjs` owns the second
form, scoped draft fields, progress, cancel/error/stale states and result export.
The first-chart sampler/compiler and solo physics own numerical behavior.
Recommendations use a separate cancellable worker and never mutate checklist
states or first-chart rows/gains. Input or acquisition edits cancel stale work
and disable old exports. Setup edits require regenerating the first chart.
Reload restores actual inputs with the corresponding plan; recommendations are
recalculated explicitly. Native unique and acquired effects form the baseline;
lower prerequisites never stack with their upgrade, nor do sibling evolutions.

Whole-list unavailable/Lv5 actions ignore search/category filters. They replace
each current row's value atomically, drop stale IDs and invalidate final results.
Lv5 is availability, not purchase. Matching evolution options inherit eligibility and prices from the original rare; they never ask for another hint level. Excluding an evolution option does not alter actual purchase history.
Inherited availability keeps previously secured choices first, fills remaining
slots in chart order and stops at six; skipped choices stay unavailable with a
visible explanation. Bulk actions are disabled until a complete chart exists.
The labels change without migrating stored values: owned/unavailable/0–5 remain
the contract. Visible0 is 획득, and1–5 are 할인 Lv1–5.

`cm-skill-presentation.mjs` owns rare/evolution name badges and setup-specific
route subtitles in both checklist and final recommendation. Normal/inherited
badges are omitted. Source evidence filters by selected owners and reviewed
requirements; verified prerequisite-derived paths and factor candidates are
marked inferred, and other missing paths are unknown. Display sources never
become acquisition edges or pricing rules.

The chart label is 단독 평균 마신; calculation details qualify9 shared comparison
contexts/144 samples as coverage, not measured probabilities. Final applied
skills expose their whole-effect ablation contribution in the current package.
Activation sample rate and useful-acceleration sample rate are separate. Normal
and strengthened inheritance share one origin/slot and the original paid stage;
recording a strengthened effect asserts that its actual requirements are met.

The v8 objective and risk preference stay in the existing calculation disclosure
and export. Comparison-sample percentages remain distinct from measured rates.
Reviewed mutually exclusive gold event rewards invalidate the entire recorded
availability before simulation. Structured errors preserve all records, search,
filters and actual inputs, select the mobile skill-record view, mark the minimal
conflicting selects with `aria-invalid`, describe them through `draft-status`,
and focus the first visible conflict (or search when filtered out). The shared
draft footer shows the concise correction message. A record edit clears these
markers and stale recommendations; the app never chooses an event on the user's behalf.
