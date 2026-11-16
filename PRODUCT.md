# umaBoard — CM skill workspace

The current user-approved contracts are `docs/CM_FIRST_CHART.md` and
`docs/CM_POST_TRAINING.md`. They supersede the
old expected-SP planning workflow for the new root surface. The previous app is
retained at `legacy.html` for regression/reference, not mixed into this flow.

Korean-speaking JP-server Uma Musume players prepare a character and six-card
support deck for a CM race, then use one in-game-ordered checklist while entering
the skills they actually unlocked. First-chart generation and acquisition-state
recording passed the final completion audit on 2026-11-16; the baseline and
handoff contract are recorded in `docs/CM_FIRST_CHART_COMPLETION.md`. The next
stage accepts actual five-stat values, remaining SP and aptitudes, and recommends
an affordable skill combination from the recorded checklist.

The user chose separate stage screens on2026-11-16. Stage1 groups character,
race and supports above the first chart; caps and course geometry are expandable.
After chart completion, stage2 places acquisition records beside actual inputs
and recommendations (stacked with section links on phones). Moving between
stages retains the same checklist, filters and per-plan values without recalculating.
The initial stage hides acquisition controls. Setup edits lock stage2 until a
fresh chart completes. Reload begins at stage1 and restores the matching saved
records/actual inputs after regeneration. This changes presentation only;
candidate, price and physics contracts remain the same.

Only initial inputs: owned outfit, running style, CM race conditions, support deck,
scenario. A persisted owned-outfit record supplies bloom and unique level. Race
stats use verified scenario base caps, mood is best, aptitudes A. No pre-training
stamina advice. All supported acquisition/trigger predicates are fulfilled;
physical timing, course geometry, durations and causal linked effects remain.

All skill categories share one table, with an icon-category tab row and name search. Gold candidates come only from the selected
outfit, scenario and deck. Evolutions and alternatives remain individually visible.
Ordinary factor-eligible whites complete the ordinary pool. Inheritance uses a fixed positive-gain Top10 after style suitability filtering, always using verified strengthened forms and excluding pure healing; users can record at most six of these. Unknown
calculations are excluded. Every admitted row is displayed inside the bounded
scrollable table, without a display limit or a load-more action.
The acquisition dropdown retains eight stored states: owned, unavailable, levels
zero to five. Visible names are 습득, 미획득, 획득, 할인 Lv1–5; 획득 means
available but unpurchased with no hint discount. Atomic whole-list buttons reset
to unavailable or discount Lv5, keeping the six-inherited limit and existing
inherited choices first. Search/category filters do not narrow a bulk action.
Acquiring an upper skill records all verified lower stages as acquired. Marking a
lower skill unavailable clears all linked uppers. Acquiring an evolution clears
its sibling evolution alternatives, retaining the shared acquired lower stages.
Player-facing rarity names are 일반, 레어, 진화 and 계승. Icons have rarity frames
and open source descriptions through hover, keyboard focus or tap.
Only rare/evolution have visible name-line badges. The subtitle shows possible
acquisition routes for the selected setup, with inferred and unknown paths marked.

The post-training stage retains paid skills, permits genuine upgrades and charges
only unpaid purchase stages at recorded hint discounts. It does not assume white
Lv5 or event maximum hints. Optional Fast Learner adds ten percentage points to
each stage's hint discount before integer flooring. It compares actual combinations against the acquired
baseline, prioritizing full-speed-spurt HP feasibility, then mean lengths. The
search is bounded and does not guarantee a global optimum. Recommendations never
change the checklist. Inputs persist per plan; edited inputs/checks invalidate
recommendations, and changed race/deck settings require a fresh first chart.
Both stages support independent cancellation and JSON export.

Assets: existing UmaTools-only character/support portraits and type badges;
alpha123 skill display-order metadata and 120 icons, eight additional original
GameTora skill icons, source-owned skill icon IDs, and locally served fonts. No remote runtime
requests other than same-origin static assets. No accounts, payments or messaging.
