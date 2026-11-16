# CM first-chart verification — 2026-11-16

Branch: `feat/cm-first-chart`, based on main `e96b037`.
Active JP dataset: `e1b13e942888b9c45d42aebb2566d275b31ea2a11596f1880ee89ec5ba0f1775`.

![Verified rarity frames and keyboard-accessible skill details](images/cm-skill-details-desktop.png)

## Automated checks

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 150 passed, including 41 first-chart/UI/state/icon/completion checks |
| `python -X utf8 -m unittest discover -s tests -v` | 42 passed on native Windows, including two CP949-default UTF-8 regressions; canonical fixtures explicitly retain LF bytes |
| `python scripts/validate_data.py` | Passed |
| `python scripts/build_pages.py --output dist --fetch-portraits` | Passed; all 273 outfit and 319 SSR portraits and 128 skill icons available |
| Strict static UI audit | Zero findings in the configured `assets/` source directory |
| `npx --yes -p @google/design.md designmd lint DESIGN.md` | Zero errors; six unused-token reference warnings |
| `git diff --check` | Passed |

The static audit accepts directory roots and recognizes inline/framework click
handlers only. Root HTML uses external module event listeners. Its entry markup
is covered by the UI contract tests and the interaction checks below; the asset
audit alone is not claimed as a full accessibility audit.

## Browser checks

The staged site was exercised in headless Microsoft Edge on Windows through a
temporary loopback-only server, with production 24-sample/0.01s generation.

| Flow | Observed result |
| --- | --- |
| Default MacQueen, Kyoto turf 2200m, six SSRs, scenario 15 | All 207 admitted candidates rendered, including the locked inherited Top10 |
| Full list | DOM row count equals the exported full pool; no load-more control; bounded table scrolling |
| Family hierarchy | Both Nishino Flower evolution alternatives precede their rare base and ordinary lower; desktop indentation0/16/32px and 340px indentation0/8/16px; gain/state columns stay aligned |
| Metadata fallback | New rare204811 and ordinary204812 remain grouped by their verified purchase relation despite absent display metadata; rare0/ordinary1 depth verified |
| Acquisition select | Eight choices; Lv3 persisted without recalculating/reordering |
| Reload and regenerate same setup | Recorded Lv3 restored |
| Recovery search | `コーナー回復○` retained with `0.00` lengths |
| Korean support search | MacQueen cards found and disabled for the same training character |
| Picker close | Explicit close and Escape restore the invoking support button; IME composition is preserved |
| Owned profile | Unique level 5 saved and reflected, then restored to 6 |
| Cancel and rerun | Cancel returns control immediately; stale worker messages ignored; rerun completes |
| Export | JSON contains 207 rows and ten inherited IDs, fixed five-stat profile, model version, 24-sample/0.01s settings and the saved acquisition state |
| Narrow layout | 340px browser viewport; document width and scroll width both 340px; no horizontal overflow |
| Icon category tabs | Six category tabs, current counts 207 / 34 / 119 / 15 / 19 / 20 after restoring source icons; icon-based classification; arrow/Home navigation; checks retained across tabs |
| Search with tabs | Dedicated no-results state; clearing restores every matching row in the current category |
| Inheritance limit | Ten inherited rows total, six recorded allowed, seventh restored to unavailable with explanation; releasing a slot allows a different skill |
| Strengthened inherits | Export contains 91101411 and no weaker 901411; no pure healing inherit in shortlist |
| Portraits | All six selected support frames loaded at 48×48 with contain; type icons beside names |
| Narrow diagram/tabs | At 340px, the document has no horizontal overflow; component scroll areas remain operable |
| Skill details | Hover, moving into the tooltip, keyboard focus, click/tap-style activation, Escape and close-on-second-click exercised; source description and lower-skill names shown |
| Rarity | 일반/레어/진화 labels and three distinct frame colors verified; no 금딱 label in rows |
| Acquisition chain | Acquiring an evolution acquires each admitted lower stage; marking the lowest unavailable clears the upper; persisted chain restores after reload |
| Alternative evolution | Nishino Flower outfit 105101: acquiring 105101111 then 105101121 clears the former and keeps the common base acquired; clearing the base clears both evolutions |
| Narrow tooltip | At 340×850, left12/right328 and top451.30/bottom638.67; popup fully inside viewport; no page errors |
| Restored skill icons | All 207 checklist images loaded and matched their own source IDs; no placeholders, PNG failures or external requests; 12 formerly affected examples checked, including the new evolution icon20386 |
| Icon-update compatibility | A pre-update saved hint4 was restored; a newly recorded hint2 also survived reload/regeneration; only the original plan key remained; JSON export retained the actual new data version |

The full icon inventory checks all 2,229 normalized records, beyond this one
setup's shortlist. See [skill icon verification](SKILL_ICON_QA.md) for the before/
after totals, image sources and source-identity checks.

Narrow layout testing used a 340×850 browser viewport. Physical touch hardware
and other browser engines have not been tested.

The Windows local-build failure was reproduced by modeling CP949 as the default
for text file reads/writes. The full staging path and validation CLI are now
tested with Korean, Japanese and emoji content in UTF-8 manifests, reports,
modules, HTML and portrait metadata. This is a locale simulation on the test
host and has now also passed on native Windows. Text encodings are explicit
in the build/data utilities, and README includes the UTF-8-mode command that
also works with an older downloaded ZIP.

## Model limits retained deliberately

- Independent skill contribution after trigger conditions succeed; no opponent
  simulation, win probability, or final SP optimization claim.
- Scenario MAX uses verified base caps, excluding inheritance-dependent raises.
- Above speed 2000, full-spurt uses the documented public approximation whose
  ceiling remains unknown.
- Missing display metadata has a stable fallback; exact game ordering for every
  new skill is not verified.
- Unknown skill calculations are excluded; an unsupported native unique stops
  generation with a recoverable error.

See [calculation contract](CM_FIRST_CHART.md) for source pins and policies.

## Final completion audit

The repaired icon build `7263de5` was rechecked at the user's request before
starting subsequent flows. No production defect was found. The full catalog
regressions in `tests/cm-completion.test.mjs` cover 2,229 records' family order,
indentation and stable sort; 1,085 upper prerequisite chains; and all 2,340
ordered evolution-alternative switches, including restoration of the chosen
branch and clearing its common base.

A fresh, isolated Edge context exercised the running Desktop build on port8000.
The default MacQueen setup rendered207 rows; Nishino Flower105101 without
supports rendered191. Search-hidden prerequisite propagation, both branch
directions, lower-to-hint/unavailable changes, unchanged numerical gains/order,
tab round trips, independent saved setups, reload and JSON export all passed.
The full branch family had desktop padding0/0/16/32px and narrow0/0/8/16px.
At340px, document width and scroll width were both340px; page errors, failed
responses and external requests were all zero. Tests used reduced-motion mode.

This is the completed first-chart/checklist baseline. The [completion record](CM_FIRST_CHART_COMPLETION.md)
defines the retained contracts for subsequent development.

![Final verified evolution branches, rare and ordinary order](images/cm-first-chart-final.png)


## Pool regression audit

Ten representative turf/dirt courses (including straight1000, Kyoto2200 and
long3200), each with four running styles: 40 setups. Fixed-gate violations: zero.
The separate awakening/evolution scan now finds zero missing obtainable original
gold rows (previous audit found 773 cases across 70 outfit/base families).
60 distinct skills remain unsupported across this matrix because their effect,
duration, target, repeat or other math is still outside the model; they remain
excluded. This is not a complete game-engine validation or a proc-rate study.

Numerical and policy regressions cover CM9 rounded rank thresholds, exact-sixth
Anabolic suitability, broad-middle overlap, restored trigger-only skills,
tight-track flags, final-straight latter-half semantics, 200m furlong windows,
orphan link exclusion, strengthened inherit replacement/style gates, ordinary
zero-gain healing, locked positive Top10, shared six-slot state and course geometry.
The legacy test that expected a wrong-style orphan acceleration was corrected to
expect inactivity; the full suite passes with the physical-link correction.

Browser generation/JSON used the production 24 samples and dt0.01. Narrow testing
used a 340px Edge viewport; touch hardware and other browser engines remain untested.

![Narrow-screen description popup](images/cm-skill-details-mobile.png)

![Evolution, rare and ordinary family order](images/cm-hierarchy-desktop.png)

![Narrow-screen family indentation](images/cm-hierarchy-mobile.png)
