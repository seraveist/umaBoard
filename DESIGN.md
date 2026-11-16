---
version: alpha
name: "umaBoard CM workspace"
description: "A bright race-preparation desk and an in-game-ordered skill checklist."
colors:
  primary: "#126c55"
  ink: "#182c2b"
  muted: "#5b6d6a"
  background: "#f3f6f5"
  surface: "#ffffff"
  border: "#dce5e1"
  mint: "#e6f3ec"
  danger: "#b03c35"
  accent: "#e8b953"
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

White work surfaces on cool pale gray-green; deep racing green is the single
action color. Ink and muted text stay legible. Gold appears only for rare-skill
identity or finish-line accents. Pink identifies evolution, blue recovery,
orange acceleration and green passive icons using existing game assets.

## Typography

Self-hosted Board Sans is a Noto Sans CJK KR subset with full Korean/Japanese
coverage for this app. Self-hosted Race Sans (Nimbus Sans Narrow Bold) is limited
to the wordmark and measured distance numerals. Body 14–16px, line-height1.6;
Japanese skill names16px, no italics, no forced letter spacing. Numeric columns
use tabular numerals. Keep the Japanese source spelling intact.

## Layout

1440px maximum width. Header, compact title, left preparation form and right
course/results desk. Desktop left360–400px; narrow screens stack naturally with
the results below. Only the skill-table surface owns bounded scrolling; forms
remain in document flow. Thirty rows per explicit load batch. Errors/progress
reserve space. No global fixed-height/overflow-hidden shell.

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
Shared notice uses a stable live region; errors stay inline. Search has an
immediate clear button and IME-safe updates. Loading uses a count/progress bar.
Buttons reserve their size when busy. Native focus-visible uses primary color.
Global scrollbars use border/muted/mint tokens, with forced-colors fallback.
Hover/active/disabled states exist for every action. Reduced motion disables
transitions. The sole authored reveal is the course strip update; table rows do
not animate or move while users input.

## Do's and Don'ts

- Do keep the acquisition checklist in source order while users work.
- Do preserve inputs, scroll and focus during asynchronous progress.
- Do use actual portraits/icons and actual course coordinates.
- Don't replace zero-gain recovery with an empty row or another category tab.
- Don't turn this tool into a landing page, rankings dashboard or SP optimizer.
- Don't claim exact game simulation or exact sorting before verification.
