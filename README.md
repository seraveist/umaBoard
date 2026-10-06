# umaBoard

일본 서버의 육성 전 스킬·계승·흰 인자 준비 도구입니다.

현재 구현은 **실제 JP 데이터 수집·정규화와 1차 단독 비교 엔진**입니다.
편성별 후보, 추가·제외 마신 정렬, 최대/효율/안전 가속 추천, 흰 인자 TOP 10,
회복 성공·실패에 따른 최속 완주 HP 검토를 제공합니다.
실전 발동 확률·상대 행동을 재현하는 완성된 레이스 계산기는 아닙니다.

## 실행

테스트 페이지: **[https://seraveist.github.io/umaBoard/](https://seraveist.github.io/umaBoard/)**

최초 공개에는 저장소의 [Settings → Pages](https://github.com/seraveist/umaBoard/settings/pages)에서
`Build and deployment → Source → GitHub Actions`를 선택해야 합니다.
이후 **Deploy GitHub Pages**가 성공하면 위 주소에서 사용할 수 있습니다.

Python 3.12 이상과 Node.js 24를 검증에 사용합니다. 외부 Python/JavaScript 패키지는 필요하지 않습니다.

```sh
python -m http.server 8000
```

- `http://localhost:8000/`: 실제 JP 데이터로 의상·개화·각질·코스·서포트·목표 능력치·적성을 선택해 비교합니다.
- `http://localhost:8000/prototype/`: 합의한 결과 화면과 토글 동작을 확인하는 예시 모드입니다. 수치는 실제 게임 계산 결과가 아닙니다.

## 구현된 데이터 동기화

```sh
python scripts/sync_data.py
python scripts/validate_data.py
```

UmaTools와 umasim 두 저장소의 대상 파일을 매일 확인합니다. alpha 상세 코스는 첫 수집의 고정 버전을 유지합니다.

```sh
python scripts/sync_data.py --refresh-courses
```

위 명령 또는 Actions의 `refresh_courses` 입력으로 alpha 코스도 최신 자료를 검사할 수 있습니다.
GitHub API 한도에 도달했다면 로컬 환경에 `GITHUB_TOKEN`을 설정하거나 한도 초기화 후 실행합니다. 토큰을 저장소에 넣지 않습니다.

| 소스 | 필수 파일 | 사용 범위 |
| --- | --- | --- |
| [UmaTools](https://github.com/daftuyda/UmaTools) | `skills_all.json`, `uma_data.json`, `support_hints.json` | 주 스킬 DB, 의상·카드, 획득·진화·계승 관계 |
| [umasim](https://github.com/mee1080/umasim) | `skill_data.txt`, `ramen_memo.md` | 주 소스 누락 계승형 보완, 교차 비교, 시나리오 변경 검토 신호 |
| [uma-skill-tools](https://github.com/alpha123/uma-skill-tools) | `course_data.json` | 상세 코너·직선·경사 지형 |

2026-10-02 초기 묶음: 스킬 **2,194**, 의상 **270**, 서포트 **563**, 상세 코스 **138**.
코스 `10613`은 원본의 마지막 코너가 결승선을 초과하여 선택에서 제외합니다. 원본 좌표는 보존합니다.
현재 공개 소스의 수록 수이며 게임 전체 커버리지를 보증하는 숫자는 아닙니다.

## GitHub Actions

- **CI**: push/PR에서 정규화·실패 복구, 실제 후보와 계산 엔진 테스트, 활성 데이터 검증과 JS 구문 검사를 수행합니다.
- **Sync JP data**: `Asia/Seoul` **매일 00:00**, 수동 실행, 수집 코드·설정 변경 시 실행합니다.
- **Deploy GitHub Pages**: main 변경·수동 실행·데이터 동기화 성공 후, 최신 main을 검증하여 테스트 페이지에 배포합니다.
- 검증된 변경이 있을 때만 `github-actions[bot]`이 데이터 commit을 만듭니다. force push는 없습니다.
- 실패하면 이전 활성 묶음을 유지하고 실행을 실패 상태로 반환합니다. 실행 상태는 Actions summary와 artifact로 남깁니다.
- 예약 실행은 기본 브랜치에서 동작하며 GitHub 부하에 따라 지연될 수 있습니다. 공개 저장소의 장기 비활성으로 일정이 중지될 수도 있습니다.
- 상위 UmaTools 정기 수집은 한국/일본 시간 08:00입니다. 자정 실행 성공과 최신 게임 반영은 구분합니다.
- `GITHUB_TOKEN`으로 만든 데이터 push가 후속 CI/배포를 자동 실행한다고 가정하지 않습니다. 동기화 workflow에서도 후보·엔진 호환 테스트를 수행한 뒤 commit합니다.
- Pages는 `workflow_run`으로 동기화 성공을 받아 bot의 데이터 commit도 배포합니다. 동기화가 실패하면 해당 실행은 배포하지 않습니다.
- 배포 파일은 화면·JS/CSS·활성 데이터 묶음·출처/라이선스만 포함합니다. 이전 데이터 묶음, 수집 원본과 테스트 코드는 제외합니다.
- 최초 Pages 활성화 전에 배포가 실패했다면, 설정 후 Actions에서 **Deploy GitHub Pages → Run workflow** 또는 실패 실행의 **Re-run failed jobs**를 선택합니다.

## 데이터 적용 정책

원본의 저장소 commit과 파일 blob을 고정한 뒤 캐시 또는 다운로드 바이트가 그 blob과 일치하는지 확인합니다.
전체 참조·개수·좌표·스키마 검증을 통과한 묶음을 불변 경로에 기록하고, `data/manifest.json`을 원자적으로 교체합니다.
매일의 확인 시각은 `.cache/sync-status.json`과 Actions에 남기며 마스터 데이터에 불필요한 일일 변경을 만들지 않습니다.

- 각성은 현재 공개된 MAX. 서포트의 레벨·성능 해방·이벤트 완주·선택 조건은 입력하지 않습니다.
- 개화에 따라 저레어 의상의 원본/승격 고유기 ID와 최종 고유 Lv4~6을 구분하고 효과별 배율을 반영합니다.
- 진화 분기와 원본 관계를 보존합니다. 획득 가능한 원본에 적용되는 진화 후보를 구성하고 금색 원본은 중복 표시하지 않습니다.
- 흰 인자 후보는 일반 흰 스킬 ID로 구성합니다. 별도 인자 마스터·인자 ID·부모 개체·프렌드 검색은 필요하지 않습니다.
- 원본의 `unreleased` 지역 배열에 `en`/`ko`가 있다는 이유로 JP 스킬을 제외하지 않습니다.
- 효과의 대상·스케일·추가 발동과 조건·시간 단위를 원본에 맞춰 보존합니다. 서로 다른 소스의 raw 단위를 임의로 혼합하지 않습니다.
- SP 표시·예산·할인 계산은 없습니다. 할인 없는 비용은 가속 조합 비교와 정상 습득 흰 스킬 판정에만 사용합니다.
- 알 수 없는 효과·동적 발동 조건은 계산 미검증으로 유지합니다. 현재속도/목표속도/가속의 실전 이득을 임의의 0마신으로 반환하지 않습니다.

## 비교 모델 사용

1. 조건과 편성을 선택하고 `계산하기`를 누릅니다.
2. 기본 습득 가능한 속도·능력치 스킬과 본체 고유기가 체크됩니다. 같은 계열/진화 분기는 하나만 선택합니다.
3. 속도기·흰 인자·회복을 토글하면 가속 조합과 HP 검토를 다시 계산합니다.
4. 가속기를 직접 체크하면 수동 선택을 유지합니다. `자동 추천 적용` 또는 추천 기준 변경으로 자동 추천에 복귀합니다.

마신은 현재 선택에 대한 추가·제외 비교입니다. 복합 스킬은 속도/가속 탭에서 동일 ID를 한 번 적용합니다.
가속 탭의 비교 표는 펼쳐져 있으며 진입속도·부족 속도·목표 도달과 5개 위치 표본의 이득을 보여줍니다.
가속 후보 10개 이하는 완전 탐색, 더 많으면 6단계 beam 탐색을 사용하고 **근사 탐색**이라고 표시합니다.
최대는 중앙 위치 이득, 효율은 탐색 최고 이득의 90% 이상에서 기준 비용 최소,
안전은 5개 표본 중 가장 불리한 이득을 최대화합니다. 실제 모든 발동 상황의 전역 최적 조합을 보장하지 않습니다.

계산은 Web Worker에서 수행합니다. 편성에 따라 첫 비교와 토글 재계산이 수 초 걸릴 수 있지만 탭·페이지 조작은 유지됩니다.

## 지원 범위와 남은 검증

공식 챔미 프리셋, 시나리오의 링크·특수 획득 경로·진화 선택 제한, JP 사전 수록 스킬의 출시/해방,
반복/가변 스킬, 최신 전개스퍼트, HP 부족 시 스퍼트 재선택은 추가 검증이 필요합니다.
순위·추월·게이트 등은 조건 성공 가정이며, 발동 가능한 거리 구간에서 5개 위치 표본을 사용합니다.
계산 미지원 스킬은 0마신으로 표시하지 않고 제외된 효과 수와 이유를 제공합니다.
의욕/능력치 스킬 반영 원본 스피드 2000 초과와 미국 코스 출발 좌표는 계산을 차단합니다.
지능 구간 난수·내리막 모드·포지션 킵·몸싸움·경쟁·디버프는 미반영입니다.
스태미나는 최속 스퍼트 유지에 필요한 HP를 검토하며, HP 부족을 실제 완주 불가로 단정하지 않습니다.
순수 회복 흰 인자의 HP 기반 추천은 후속 작업입니다.

[수식·출처·표본·검증 명세](docs/ENGINE_VALIDATION.md)에 지원 범위와 검증된 사례를 기록했습니다.
DB 전체의 `calculation_status`는 아직 `unvalidated`이며, 엔진 결과별로 지원/성공 가정/미지원 상태를 별도로 판정합니다.

## 검증 명령

```sh
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python scripts/validate_data.py
python scripts/build_pages.py
```

Pages 배포 파일은 `.cache/pages/`에 생성됩니다. 상대 경로를 사용하므로 `/umaBoard/` 하위에서도 데이터와 계산 worker가 로드됩니다.

## 구조

| 경로 | 내용 |
| --- | --- |
| `assets/` | 실제 후보·조건/획득 경로·단독 비교 엔진·worker·결과 화면 |
| `prototype/` | 결과 레이아웃과 fixture 엔진 |
| `scripts/umaboard/` | 수집, 소스 어댑터, 검증, 활성 묶음 교체 |
| `sync-config.json` | 정기/고정 소스와 검증 기준 |
| `curated/rules.json` | 출처를 명시한 보완 관계와 검증 대기 목록 |
| `data/manifest.json` | 현재 활성 묶음, 출처 commit/blob, 해시와 어댑터 버전 |
| `data/bundles/` | 정규화 데이터와 동일 버전의 검증 결과 |
| `docs/` | 수집 설계, 조사 기록, 엔진 연결 계약 |
| `tests/` | 정규화·실패 복구·실제 후보·속도/가속/HP·추천 정책 검증 |

[동기화 운영 명세](docs/SOURCE_SYNC_DESIGN.md) · [현재 데이터 상태](docs/DATA_STATUS.md) · [실제 엔진 계약](docs/MODEL_CONTRACT.md)
