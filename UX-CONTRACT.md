# CM workspace behavior

Business authority: `PRODUCT.md`, `docs/CM_FIRST_CHART.md`, and the user's
2026-11-16 decisions. `legacy.html` is retained but has its own old contract.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | cm-app.mjs setup handlers | CM_FIRST_CHART | race / owned profile | unit + browser |
| Select/Listbox | native select, native dialog option buttons | DESIGN | platform popup / searchable dialog | keyboard + browser |
| Table Selection | cm-state.mjs | CM_FIRST_CHART | acquisition dropdown only | unit + browser |
| Scrollbar | cm.css global baseline | DESIGN | bounded table / dialog body | browser |
| Toast | stable inline cm-notice live region | DESIGN | status / error | browser |
| Skill details | cm-skill-details.mjs | DESIGN | hover / focus / tap | browser |

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
Under the user's 2026-11-16 update, acquired upper skills also mark every verified
lower purchase/evolution stage acquired. An unavailable lower stage clears every
linked upper. Returning a purchased lower stage to a hint clears acquired uppers.
Acquiring one evolution clears its sibling alternatives and keeps the common lower
stages acquired. Ordinary display groups/version families do not imply dependency.
Rows preserve identity/focus while progress arrives. All admitted rows render in
the internally scrollable table; search and tabs filter the entire pool. No unmatched
query reports a dedicated no-results state. JP names stay JP, all UI copy and
accessible names Korean. Locale ko-KR, timezone Asia/Seoul for export timestamps.


The icon-category tab row is a view of the same canonical checklist. It never
reruns calculations, changes source order or discards acquisition states. Tabs
have arrow/Home/End keyboard navigation and counts; tab/search changes retain all
matching rows without a display batch. Source icons determine mixed-effect categories.
Inheritance Top10 is frozen before rows appear; the shared six-slot limit counts
purchased and Lv0–5 states across every view. A seventh attempt restores the
previous select value and explains how to free a slot in the live draft status.
