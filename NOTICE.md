# Data provenance

Project-authored code is covered by the repository LICENSE. The project code license does not claim ownership of game content or upstream data.

Generated records contain factual skill identifiers, effects, conditions, course geometry and acquisition relationships adapted from these public projects:

- daftuyda/UmaTools: https://github.com/daftuyda/UmaTools — upstream collection includes GameTora; attribution is retained in the source manifest and documentation.
- mee1080/umasim: https://github.com/mee1080/umasim — supplemental inheritance records and scenario investigation reference.
- alpha123/uma-skill-tools: https://github.com/alpha123/uma-skill-tools — course geometry snapshot.

No upstream application code, original complete JSON/MDB archives, raw character/card portrait files, audio, or story assets are committed. Raw inputs are kept in ignored local/Actions caches. The Pages artifact additionally includes original in-game outfit list icons from [BWiki's Uma Musume file collection](https://wiki.biligame.com/umamusume/) and SSR support thumbnails from the pinned daftuyda/UmaTools commit. The 2026-11-17 snapshot covers 274 exact outfit IDs using `Chr_icon_<character ID>_<outfit ID>_01.png`; original 256×280 RGBA images are preserved. Source URLs, file identities, original SHA1s, Git blob hashes and byte lengths are pinned in `curated/ingame-portraits.json`. Reproduction uses `scripts/import_ingame_portraits.py`. `data/portraits.json` records the integrated output paths and per-entry provenance; future outfits without a curated icon retain only the exact-ID UmaTools fallback. UmaTools attributes its game materials to GameTora; game images remain the property of Cygames, Inc. The project code license does not cover those images, including their depiction in UI verification screenshots. Character/support portraits never use a direct GameTora fallback.
The normalized contract retains raw field values needed to interpret game semantics; it is not a claim of validated game mechanics or full current-game coverage.

The independently authored comparison engine also consulted mathematical relationships and effect semantics in pinned alpha RaceSolver/HpPolicy and umasim race sources.
Exact reference commits, the comparison assumptions, and the unsupported mechanics are documented in docs/ENGINE_VALIDATION.md. No upstream solver/parser application implementation is vendored.

Korean character-name labels are a curated name-only snapshot from YIRer/umamusume_trainers `db/db.json` at commit `d840af64d80346c5d4ab15a719f8d47e8b38095d`, blob `cead5efd6fa4790ec6472a78e03b9e68d4d9de17`. The snapshot is recorded in `curated/names-ko.json`, with project spelling/spacing corrections and search aliases. No event text, upstream application code or images from that project are distributed. Outfit titles, group/card titles and skill names remain Japanese. This is a display layer; it does not replace JP mechanics with Korean-server data or add a daily external synchronization source.

Seven static support-type icons in `assets/support-types/` are sourced from GameTora's common game icons, checked on 2026-10-06. Exact source URLs and SHA-256 hashes are recorded in `curated/support-type-icons.json`. These game images remain the property of Cygames, Inc. They are static bundled assets, not a new nightly synchronization source.

The first-chart frontend bundles 128 game skill icons: 120 from `alpha123/uma-tools` at commit `dfbeafb23253b238a0417ddd4dde70a36fd11d4f`, and eight additional originals from [GameTora's skill media](https://gametora.com/umamusume/skills), checked on 2026-11-16. The GameTora icon IDs are 2010011, 20361, 20362, 20366, 20376, 20381, 20382 and 20386. Their exact media URLs, dimensions, byte lengths and SHA-256 hashes, and the seven added alpha assets' Git blob identities, are recorded per file in `curated/cm-skill-display.json`. These are committed static assets; no runtime image request is made to either source. These game images remain the property of Cygames, Inc.; the project code license does not cover them. No upstream application implementation is bundled.

Skill-image identity is preserved from UmaTools' `iconid` as `skills.icon_id` in the normalized dataset. The alpha display-order/group table remains a separate source: a base-skill grouping fallback does not replace an evolution's or inherited skill's own image. The three secondary-only inheritance records retain their independently recorded, same-ID alpha metadata.

Scenario base-stat caps (IDs 6–15) are factual reference values independently recorded from `mee1080/umasim` at commit `e5d940ce8f73bbb756ae3cffd0a081c34b8124da`. Per-profile source paths and the inheritance-cap exclusion policy are retained in `curated/cm-scenario-profiles.json`.

The locally subset Board Sans fonts derive from Noto Sans CJK KR under the SIL Open Font License 1.1. The Race Sans display subset derives from Nimbus Sans Narrow Bold under the GNU Affero General Public License with the font exception. Full license notices are included in `assets/fonts/Noto-CJK-LICENSE.txt` and `assets/fonts/Nimbus-LICENSE.txt`; those licenses, rather than the project code license, apply to these fonts. Reproduction is described by `scripts/prepare_cm_fonts.py`.

Tight-track flags in `assets/cm-course-metadata.mjs` are factual per-course values from mee1080/umasim `race/data/rawData.kt` at `e5d940ce8f73bbb756ae3cffd0a081c34b8124da`, guarded by track/distance/surface/turn identity. No upstream implementation is bundled.
