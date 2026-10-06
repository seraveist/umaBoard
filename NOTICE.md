# Data provenance

Project-authored code is covered by the repository LICENSE. The project code license does not claim ownership of game content or upstream data.

Generated records contain factual skill identifiers, effects, conditions, course geometry and acquisition relationships adapted from these public projects:

- daftuyda/UmaTools: https://github.com/daftuyda/UmaTools — upstream collection includes GameTora; attribution is retained in the source manifest and documentation.
- mee1080/umasim: https://github.com/mee1080/umasim — supplemental inheritance records and scenario investigation reference.
- alpha123/uma-skill-tools: https://github.com/alpha123/uma-skill-tools — course geometry snapshot.

No upstream application code, original complete JSON/MDB archives, character/card images, audio, or story assets are committed. Raw inputs are kept in ignored local/Actions caches. The Pages artifact additionally includes available character and SSR support thumbnails downloaded exclusively from the pinned daftuyda/UmaTools commit. Their paths and Git blob hashes are recorded in `data/portraits.json`. UmaTools attributes its game materials to GameTora; game images remain the property of Cygames, Inc. The project code license does not cover those images. No direct GameTora image fallback is used.
The normalized contract retains raw field values needed to interpret game semantics; it is not a claim of validated game mechanics or full current-game coverage.

The independently authored comparison engine also consulted mathematical relationships and effect semantics in pinned alpha RaceSolver/HpPolicy and umasim race sources.
Exact reference commits, the comparison assumptions, and the unsupported mechanics are documented in docs/ENGINE_VALIDATION.md. No upstream solver/parser application implementation is vendored.

Korean character-name labels are a curated name-only snapshot from YIRer/umamusume_trainers `db/db.json` at commit `d840af64d80346c5d4ab15a719f8d47e8b38095d`, blob `cead5efd6fa4790ec6472a78e03b9e68d4d9de17`. The snapshot is recorded in `curated/names-ko.json`, with project spelling/spacing corrections and search aliases. No event text, upstream application code or images from that project are distributed. Outfit titles, group/card titles and skill names remain Japanese. This is a display layer; it does not replace JP mechanics with Korean-server data or add a daily external synchronization source.

Seven static support-type icons in `assets/support-types/` are sourced from GameTora's common game icons, checked on 2026-10-06. Exact source URLs and SHA-256 hashes are recorded in `curated/support-type-icons.json`. These game images remain the property of Cygames, Inc. They are static bundled assets, not a new nightly synchronization source; character/card portraits continue to use only UmaTools.
