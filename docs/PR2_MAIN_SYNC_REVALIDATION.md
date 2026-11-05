# PR #2 최신 main 통합 재검증 — 2026-11-05

## 검토 대상과 통합 방식

- PR: [#2](https://github.com/seraveist/umaBoard/pull/2)
- 보존할 PR 커밋: `a1f0170d347836c31a4daf94698ceb0bec052bd0`
- 통합할 main: `257cd0c7fef77d87ae7116105bc5e385bffbd992`
- 공통 조상: `7fd42ce71cec17356b2673544cb51d929e22f89b`
- main 변경은 `data/manifest.json`, `data/portraits.json` 두 파일이며, 실제 병합 충돌은 매니페스트 한 파일이다.

PR 브랜치에 최신 main을 합치는 로컬 merge를 준비했다. 기존 PR 커밋을 재작성하지 않는다.
매니페스트에는 최신 main의 원본 커밋·blob·입력 SHA-256을 적용하고, PR의 어댑터 및 수동 보완으로
`python scripts/sync_data.py --rebuild-active`를 실행했다. 각 입력의 Git blob SHA-1·바이트 수와
매니페스트의 SHA-256이 일치하는지 확인했다.

이 기록은 GitHub 반영 전 로컬 사전 검증 결과다. 사용자 승인에 따라 PR 브랜치에 반영하고,
새 GitHub Actions CI가 통과하면 main에 병합한다. 실제 반영·CI·병합 상태는 PR과 Actions 실행에서 확인한다.

## 원본 변경 비교

| 입력 | PR 원본 → 최신 main 원본 | 실제 차이와 영향 |
| --- | --- | --- |
| UmaTools | `6efe0f3610874d10ceb6cce5153d61f9056fe1c1` → `d0a2a652605ca319e4176445c1e1bf52a8cd8fdb` | 10월 31일 → 11월 4일 원본 |
| `skills_all.json` | blob `4be4a4ac4d3bf092393fed65746d540da93b4ff0` → `e3eb2c51a485503021ff5238189a71c5e50422ae` | `1000013` カーニバルボーナス의 `unreleased: ["en"]` 필드 삭제. JP 공개 판정과 효과는 동일 |
| `uma_data.json` | blob `999d820ebbde2e4f63c13d33b2fd7dfde2bf7c6f` → `bc18c41c62225b5f6dad474e20cad2e0e40031f0` | `106501` ダイタクヘリオス의 이벤트명 3개가 영어로 변경. 현재 정규화 대상이 아닌 표시 필드 |
| `support_hints.json` | blob `7e8a24443e932b658aac2a897e5fd36559e1d957` 유지 | 바이트 동일. 30322·30323의 카드·힌트 정보도 동일 |
| umasim | `49f5e0b7b8625787eebe8f2048588ca33ffc39f6` → `75bebbeb4316cac4049fe47981231b9088d2627e` | 커밋만 이동. `skill_data.txt`·`ramen_memo.md` 두 대상 blob 모두 동일 |
| alpha 코스 | `bce6c0888e0f19dac10ac0d27d1e9741c6917657` 유지 | 고정 코스 원본 유지 |

육성마 이벤트명의 변경은 다음 세 곳이다.

| 이전 | 최신 |
| --- | --- |
| 壇上参上モチ上々！ | Officially Vibin'! |
| トレぴ☆えんどれすふぃーばー☆ | T-Rain ☆ Endless Fever ☆ |
| 言葉はSoul！いっつショウタイム！ | Express Yourself! |

비교한 고정 원본: [이전 UmaTools](https://github.com/daftuyda/UmaTools/tree/6efe0f3610874d10ceb6cce5153d61f9056fe1c1),
[최신 main의 UmaTools](https://github.com/daftuyda/UmaTools/tree/d0a2a652605ca319e4176445c1e1bf52a8cd8fdb),
[최신 main의 umasim](https://github.com/mee1080/umasim/tree/75bebbeb4316cac4049fe47981231b9088d2627e).

## 재생성 및 보존 결과

최신 입력으로 다시 정규화·검증한 데이터는 기존 PR 번들과 바이트 단위로 동일하다.
따라서 새 번들 디렉터리는 필요하지 않으며, 기존 불변 번들을 재사용한다.

- 활성 번들/SHA-256: `3bbb116d16680366e0aab672e402d5edd26a4fc76d7344abde3ca3262c5b27c5`
- 매니페스트 `sources`, `input_hashes`: 최신 main과 완전히 동일
- `adapter_fingerprint`: 기존 PR과 동일
- 반복 재생성: `unchanged`, 매니페스트와 번들 내용 유지
- 스킬 2,223개·의상 272개·서포트 566개·코스 138개 유지
- 획득 경로 9,846개·진화 규칙 689개·관계 2,098개·구매 단계 1,186개 유지
- `skills`, `outfits`, `supports`, `courses`, `acquisition_routes`, `evolution_rules`, `relations`,
  `purchase_stages`, `support_events`, `scenario_events`, `scenario_exclusive_groups`,
  `cost_policy`, `purchase_order` 전체를 기존 PR과 비교해 일치 확인

| 보완 내용 | 최신 원본 통합 결과 |
| --- | --- |
| 마야노 30322 | 이벤트 6경로·훈련 힌트 14경로 유지. 연속 마지막의 공통 금색 + 선택 금색 1개, 대성공 Lv2/성공 Lv1, 분기 배타와 할인 검증 통과 |
| 아즈마 30323 | 이벤트 4경로 유지. 해금 아래 선택 Lv5·외출 2회 Lv2·5회 Lv3·정월 Lv3, 양쪽 해금 선택과 외출 보상 양립 검증 통과 |
| 아즈마 한글 이름 | SSR/R 검색·표시 유지, JP 스킬명 및 원본 카드 정체성 유지 |
| 午式駿大祭 | 공통·링크·엔딩 16경로 유지. 본체/서포트 캐릭터 링크, 링크 선택 배타, 다른 시나리오 격리와 할인 검증 통과 |
| 시나리오 진화 | 6종 중 최대 2개. 본체 진화 제외, 수동/전체선택/고정/구매/스킬 최적화/편성 추천, 원본 금색 대안 검증 통과 |
| 기존 최적화 | SP 예산·필수 스킬·이벤트 선택·스킬 계열 배타·계산 엔진의 전체 회귀 테스트 통과 |

보상 수동 보완의 근거와 해석은 기존 [SSR 검증 기록](SHUNDAISAI_SUPPORT_EVENT_AUDIT.md),
[시나리오 검증 기록](SHUNDAISAI_SCENARIO_AUDIT.md)을 유지한다.
이번에는 위 원본 변경분과의 충돌 여부 및 소프트웨어 동작을 재검증했다.
외부 공략 페이지 전체 재조사나 실제 게임 로그 검증을 새로 수행한 것은 아니다.

`data/portraits.json`은 최신 main 버전을 유지했다. 변경은 `data_source_commit` 및
이미지 `source`의 원본 커밋 정보이며, 이미지 항목·개수·경로·blob은 기존 PR과 동일하다.

## 수정 범위

PR 브랜치에 반영할 기존 PR 대비 변경은 네 파일이다.

| 파일 | 변경 |
| --- | --- |
| `data/manifest.json` | 최신 main의 원본 메타데이터 + PR 보완 번들/어댑터로 충돌 해결 |
| `data/portraits.json` | main에서 갱신한 이미지 원본 커밋 정보 보존 |
| `tests/test_pipeline.py` | 원본 blob은 바뀌고 JP 정규화 결과는 같은 일일 동기화 회귀 테스트 1개 추가. 최신 메타데이터 갱신·수동 보완/번들 보존·반복 실행 안정성 확인 |
| `docs/PR2_MAIN_SYNC_REVALIDATION.md` | 이번 비교·해결·검증·미검증 범위 기록 |

실행용 Python/JavaScript, 수동 보완 JSON, 스킬 효과, 구매 로직 및 Actions YAML은 변경하지 않았다.
기존 PR 기능 변경 23개 파일은 그대로 보존한다.

## 검증 결과와 GitHub Actions 호환성

로컬 런타임은 Python **3.12.14**, Node.js **24.22.1**로, CI의 Python 3.12/Node 24와 일치한다.

| 검증 | 결과 |
| --- | --- |
| `python -m unittest discover -s tests -v` | 37/37 통과 (기존 36개 + 신규 동기화 회귀 1개) |
| `node --test tests/*.test.mjs` | 109/109 통과, 실패·건너뜀 없음 |
| `python scripts/validate_data.py` | 통과. 기존 경고 5개 유지 |
| `python scripts/build_pages.py` | 통과. 활성 번들과 앱 자산을 포함한 배포 산출물 38개 생성 |
| `node --check` | 모든 `assets/*.mjs`, `prototype/model.js`, `prototype/app.js` 통과 |
| 고정 원본 재생성 | 최신 main 원본으로 활성화 성공, 반복 실행 `unchanged` |
| 일반 일일 동기화 경로 | 새 회귀 테스트에서 원본 blob 변경 후에도 수동 이벤트/할인·동일 번들 유지 및 원본 메타데이터 갱신 검증 |
| Git 충돌·공백 검사 | 충돌 마커/미해결 index 없음, `git diff --check` 통과 |

위 테스트/검증/빌드/구문 검사는 `.github/workflows/ci.yml`의 명령과 같다.
`sync-data.yml`의 테스트·데이터 검증·JS 회귀 명령과도 호환된다.
실제 원본 조회 HTTP 단계는 이번 최신 main의 고정 blob 다운로드/해시 확인으로 검증했고,
일일 실행 전체를 GitHub에서 새로 실행하지는 않았다.

기존 [PR CI](https://github.com/seraveist/umaBoard/actions/runs/41772356807)와
[자동 동기화](https://github.com/seraveist/umaBoard/actions/runs/41912142900)의 성공은 확인했다.
두 실행은 이번 로컬 merge 결과에 대한 CI 성공을 뜻하지 않는다.
PR 브랜치 반영 후 새 push/PR CI 결과를 별도로 확인해야 한다.

## 남은 미검증 사항

- 로컬 사전 검증 시점에는 원격 PR이 `dirty`였으며, 이번 통합 결과의 GitHub Actions 실행은 미수행이었다. 반영 후 새 CI를 확인한다.
- Pages는 원격 초상화 다운로드 없이 빌드했다. 이미지 590개에 대한 실제 원격 다운로드·서비스 배포는 검증 범위 밖이다.
- 이벤트 완주·발표회/본행사 대성공·굿 엔딩·진화 조건 충족을 가정한다. 발생 확률·성공 판정식·실제 육성 진행은 검증하지 않았다.
- 거리별 스킬 2개 등 진화 조건을 최종 구매 목록으로 자동 증명하지 않는다.
- `名にし負う夢`의 연목 레벨별 가변 효과량(`value_scale=41`)은 계속 계산 미지원이다.
- 기존 경고 5개: 코스 10613 제외, 11619/11707 좌표 원점 검토, 수동 보완 미완료 항목, 미지원 효과 코드 보존. 새로운 경고는 없다.
- 실제 게임/공식 마스터와의 대조, 모든 레이스의 실측 정확도, 제한된 탐색의 전역 최적성은 이번 회귀 테스트로 보장하지 않는다.
