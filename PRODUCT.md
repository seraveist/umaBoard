# umaBoard — CM first chart

The current user-approved contract is `docs/CM_FIRST_CHART.md`. It supersedes the
old expected-SP planning workflow for the new root surface. The previous app is
retained at `legacy.html` for regression/reference, not mixed into this flow.

Korean-speaking JP-server Uma Musume players prepare a character and six-card
support deck for a CM race, then use one in-game-ordered checklist while entering
the skills they actually unlocked. First-chart generation and acquisition-state
recording passed the final completion audit on 2026-11-16; the baseline and
handoff contract are recorded in `docs/CM_FIRST_CHART_COMPLETION.md`. Post-training SP optimization is a
later stage and is not represented as working on this surface.

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
The acquisition dropdown has eight states: owned, unavailable, levels zero to five.
Acquiring an upper skill records all verified lower stages as acquired. Marking a
lower skill unavailable clears all linked uppers. Acquiring an evolution clears
its sibling evolution alternatives, retaining the shared acquired lower stages.
Player-facing rarity names are 일반, 레어, 진화 and 계승. Icons have rarity frames
and open source descriptions through hover, keyboard focus or tap.

Assets: existing UmaTools-only character/support portraits and type badges;
alpha123 skill display-order metadata and 120 icons, eight additional original
GameTora skill icons, source-owned skill icon IDs, and locally served fonts. No remote runtime
requests other than same-origin static assets. No accounts, payments or messaging.
