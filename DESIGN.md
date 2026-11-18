---
version: alpha
name: "umaBoard CM workspace"
description: "A two-stage race-preparation and post-training skill workspace."
colors:
  primary: "#126c55"
  ink: "#202d35"
  muted: "#586771"
  background: "#f5f7f8"
  surface: "#ffffff"
  border: "#dce3e6"
  mint: "#edf6f2"
  danger: "#a83138"
  accent: "#c18b26"
typography:
  sans:
    fontFamily: '"Board Sans", "Noto Sans CJK KR", sans-serif'
  display:
    fontFamily: '"Race Sans", "Board Sans", sans-serif'
rounded:
  DEFAULT: "12px"
  control: "8px"
  small: "6px"
spacing:
  section-gap: "24px"
  page-max: "1440px"
components:
  button: {}
  field: {}
  skill-table: {}
  picker-dialog: {}
---

# umaBoard design

## Overview

Operate register: a Korean-speaking JP-server player alternates between the game
and this page while checking skills. Desktop comparison and phone side-by-side
use must both work. The redesign is explicitly authorized; no marketing hero.
The signature is a course-distance ribbon drawn from actual corner/slope/phase
coordinates, with restrained finish-line geometry. Character art is existing
portrait content, not decorative artwork. No Japan-market personal data or
Japanese-language UI: JP skill names are source content; owned copy is Korean.

Runtime ownership is model B: `assets/cm.css :root` owns the tokens above and
this document mirrors them. Controls/table/dialog consume the same variables.
`tests/cm-ui.test.mjs` verifies the token and state contract.

## Colors

White work surfaces on cool pale gray; deep racing green marks the primary
action, current stage and purchased skills. Available hints tint their select,
without filling every candidate row. Ink and muted text stay legible. Gold appears only for rare-skill
identity or finish-line accents. Pink identifies evolution, blue recovery,
orange acceleration and green passive icons using existing game assets.

## Typography

Self-hosted Board Sans is a Noto Sans CJK KR subset with full Korean/Japanese
coverage for this app. Self-hosted Race Sans (Nimbus Sans Narrow Bold) is limited
to the wordmark and measured distance numerals. Body14px, line-height1.6;
page title25px (21px narrow), section titles17px, labels11px (actual inputs12px).
Japanese skill names15px, acquisition sources12px at every width, no italics or
forced letter spacing. Runtime tokens `--skill-name-size`, `--skill-source-size`
and `--skill-row-space` own15px/12px/10px vertical row padding. Numeric columns
use tabular numerals. Keep the Japanese source spelling intact.

## Layout

1440px maximum width,64px header,32px desktop/16px phone horizontal padding.
Two numbered stage tabs express the user-approved sequence: preparation, then
post-training recommendation. Stage2 unlocks only after a complete first chart.
Changing stages preserves one shared checklist, filters and actual inputs.

Preparation uses three adjacent groups: character/style/scenario, race, and six
supports. At1100px it becomes two columns with a full-width deck; at600px one
column with a3×2 deck. Scenario caps and the actual course diagram are native
collapsed disclosures. One generate action precedes the full-width first chart;
after completion the continue action becomes the primary next step. Acquisition
controls and bulk actions appear only in stage2.

Post-training places actual inputs above the checklist and recommendations.
The checklist sits left and recommendation right,
with a1.65:1 ratio and340px minimum right column (320px below1100px). At860px
native tabs switch skill records and recommendation results one at a time;
the actual-input area, submit, cancellation and progress remain common. The table has bounded
650px desktop/600px phone scrolling; all admitted rows render. The course strip
and dialog option body own their own scrolling. Forms remain in document flow.
Progress and input errors appear with their current operation. Empty informational
status regions do not reserve blank rows. No global fixed-height/overflow-hidden shell.

## Elevation & Depth

Flat bordered work surfaces. Soft elevation only on the native dialog backdrop
layer and an open picker. No glow, glass, decorative gradients or nested cards.

## Shapes

12px surfaces,8px controls,6px smaller details. Pills only for small categorical
statuses. The course strip uses measured rectangular segments, not a fake map.

## Components

Native selects own popup geometry for small enumerations and acquisition states.
Outfit/card choice uses an app-owned native dialog with a search field and real
option buttons, keeping browser focus trapping/Escape and explicit return focus.
Dialog search and footer stay available while options scroll, including a
340×520 viewport. Original square SSR frames use contain without cropping;
owned-profile forms scroll when the viewport is short. Shared notice uses a stable live region for actionable state/errors, while routine save/restore/export success stays silent. Search has an
immediate clear button and IME-safe updates. Loading uses a count/progress bar.
Buttons reserve their size when busy. Native focus-visible uses primary color.
Global scrollbars use shared thumb/background tokens, with forced-colors fallback.
Skill icons are buttons framed in silver (normal), gold (rare), or pink
(evolution), with a visible focus ring. Only rare/evolution get a small bordered
badge immediately after the skill name; normal/inherited omit the rarity badge.
Names and badges flow inline so long phone-sized names keep their text width.
The subtitle shows setup-specific possible acquisition routes; derived/factor
paths are explicitly inferred, and absent evidence is labeled unknown.
The image inside the frame uses the skill's normalized source `icon_id`; a
same-ID display record is the compatibility fallback. Grouping/order may follow
a lower stage, but the image never borrows that lower stage's rarity. All 128
registered PNGs are served locally with pinned provenance and checksum evidence.
The runtime owns
`--skill-indent-step` (16px desktop, 8px narrow): first-chart rare rows start at depth0 and ordinary lowers step in once. Evolution options are retained internally. Mean gain and acquisition controls keep aligned columns.
Final results show additional purchases, then awakening/scenario evolution cards side by side on wide screens and vertically on narrow screens. A complete active skill list follows, with paid history in a disclosure. Evolution cards show the original rare → evolved skill and additional0 SP. Scenario count includes already acquired evolutions.
The runtime also owns
`--skill-*-frame` and `--skill-*-surface` tokens in cm.css. One body-mounted
`cm-skill-details.mjs` tooltip uses `--z-skill-details:300`, stays within the
viewport, and opens on hover, focus or tap. Escape/outside interaction dismisses
it; moving the pointer into the explanation keeps it available for reading.
Hover/active/disabled states exist for every action. Reduced motion disables
transitions. The sole authored reveal is the course strip update; table rows do
not animate or move while users input.

The post-training panel follows the same bordered work surface, native fields,
status regions and primary action. It is visible in stage2 after a completed
chart. Six numeric inputs share one full-width desktop row and two three-column
rows on phones. They start expanded, then collapse after successful recommendation
to a summary of input completion, remaining budget, discount trait and aptitudes.
Users can reopen the native disclosure at any time. The submit action remains
outside the disclosure with an explicit native form owner; errors reopen inputs
before focusing the invalid field. Controls are42px
high,44px on phones. A labeled native discount select offers 없음 / 공부가 / 수완가
with0/4/10 percent discounts. Its closed control aligns with the aptitude
disclosure. Expanded desktop aptitudes align the three controls with the discount
control in one row; phone aptitudes expand beneath it. An open actual-input
section hides the repeated summary and gives the form16px separation from its title.
Actual values start blank. Successful recommendations select the mobile result
view before focusing its heading; re-entering preparation does not force the
hidden result into focus. Results use a compact SP/gain summary and a source-ordered list with
expandable stage prices; the checklist retains its single table and scroll area.
Recommendations never modify acquisition records. A visible stale-result label
and disabled export prevent old recommendations being presented as current.
Purchase-stage costs remain expandable; general model/policy explanations,
usage prose, repeated subtitles and list-footer instructions are omitted from
the working UI. Model and provenance remain in project documentation/exports.
Whole-checklist actions remain
visible near search/categories, explicitly naming their scope and retaining the
shared six-slot inherited rule.

The user's quiet-copy decision also removes normal completion, saved-draft and
restored-draft messages. Keep concise validation/storage/slot-limit/cancellation
feedback, numeric results and acquisition routes. Stale recommendations show
`재추천 필요` and the action changes to `다시 추천`. Course distance, track name
and condition facts share a vertical center; the number's unit retains its
numeric baseline. Support type icons center with names, style buttons center
their labels, and each recommended skill's price centers within its name row.

Utility icons share18px geometry and1.7px strokes. Download, search, disclosure
and navigation icons are supplementary to text. Tabs expose selected state and
Arrow/Home/End keys. Focus-visible rings, inline errors, cancellation, stale
result labels, disabled exports and reduced-motion/forced-colors behavior remain.
Measured representative small text contrast is5.44:1 or better; this is browser
sampling, not a claim of complete accessibility certification.

## Do's and Don'ts

Optional gate/popularity controls reuse native selects inside existing details.
The full-inheritance view uses one compact native checkbox beside the shared
six-slot count. Model qualifications stay in collapsed `발동 조건과 표본` details;
sample HP count/total remains ordinary numeric result text. These additions use
the existing spacing, focus, border and muted-text tokens.

- Do keep the acquisition checklist in source order while users work.
- Do preserve inputs, scroll and focus during asynchronous progress.
- Do use actual portraits/icons and actual course coordinates.
- Do keep ordinary zero-gain recovery in the shared checklist.
- Do use one icon-category tab row above the table; filtering preserves source order and all checked states.
- Do show original square SSR frames, with type badges beside the name.
- Do draw relative elevation, phase bands and numbered segments from course geometry.
- Don't turn this tool into a landing page or rankings dashboard. SP recommendation belongs only in the separate post-training stage; the initial chart remains SP-free.
- Don't claim exact game simulation or exact sorting before verification.
- Keep v7 context coverage/physics sensitivity in the existing calculation
  disclosure; show package contribution as muted detail under applied skills.
  Preserve the table and stage layout. Comparison percentages are not empirical rates.
- Keep v8 tail-time risk details collapsed. Event-reward conflicts use the same
  concise draft status, native select focus and danger border; return mobile
  users to skill records without changing their choices. Narrow gain headings
  may wrap inside their fixed column instead of colliding with acquisition controls.
