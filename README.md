# umaBoard

일본 서버의 육성 전 스킬·계승·흰 인자 준비 도구입니다.

현재 구현은 **실제 데이터의 수집·정규화·검증과 편성별 스킬 후보 조회**입니다.
마신 순위·최적 가속 조합·스태미나 완주 계산은 수식 검증 후 연결합니다.

## 실행

Python 3.12 이상과 Node.js 24를 검증에 사용합니다. 외부 Python/JavaScript 패키지는 필요하지 않습니다.

```sh
python -m http.server 8000
```

- `http://localhost:8000/`: 실제 JP 데이터로 의상·개화·각질·코스·서포트를 선택하고 스킬 후보를 확인합니다.
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

- **CI**: push/PR에서 정규화·실패 복구 테스트, 실제 데이터 후보 테스트, 활성 데이터 검증과 JS 구문 검사를 수행합니다.
- **Sync JP data**: `Asia/Seoul` **매일 00:00**, 수동 실행, 수집 코드·설정 변경 시 실행합니다.
- 검증된 변경이 있을 때만 `github-actions[bot]`이 데이터 commit을 만듭니다. force push는 없습니다.
- 실패하면 이전 활성 묶음을 유지하고 실행을 실패 상태로 반환합니다. 실행 상태는 Actions summary와 artifact로 남깁니다.
- 예약 실행은 기본 브랜치에서 동작하며 GitHub 부하에 따라 지연될 수 있습니다. 공개 저장소의 장기 비활성으로 일정이 중지될 수도 있습니다.
- 상위 UmaTools 정기 수집은 한국/일본 시간 08:00입니다. 자정 실행 성공과 최신 게임 반영은 구분합니다.
- `GITHUB_TOKEN`으로 만든 데이터 push가 후속 CI/배포를 자동 실행한다고 가정하지 않습니다. 필요한 검증은 동기화 workflow에서 직접 수행합니다.
- 배포와 GitHub Pages 활성화는 이 초기 구성에 포함하지 않습니다.

## 데이터 적용 정책

원본의 저장소 commit과 파일 blob을 고정한 뒤 캐시 또는 다운로드 바이트가 그 blob과 일치하는지 확인합니다.
전체 참조·개수·좌표·스키마 검증을 통과한 묶음을 불변 경로에 기록하고, `data/manifest.json`을 원자적으로 교체합니다.
매일의 확인 시각은 `.cache/sync-status.json`과 Actions에 남기며 마스터 데이터에 불필요한 일일 변경을 만들지 않습니다.

- 각성은 현재 공개된 MAX. 서포트의 레벨·성능 해방·이벤트 완주·선택 조건은 입력하지 않습니다.
- 개화에 따라 저레어 의상의 원본/승격 고유기 ID를 구분합니다. 실제 고유기 레벨 효과는 계산 규칙 검증 후 연결합니다.
- 진화 분기와 원본 관계를 보존합니다. 획득 가능한 원본에 적용되는 진화 후보를 구성하고 금색 원본은 중복 표시하지 않습니다.
- 흰 인자 후보는 일반 흰 스킬 ID로 구성합니다. 별도 인자 마스터·인자 ID·부모 개체·프렌드 검색은 필요하지 않습니다.
- 원본의 `unreleased` 지역 배열에 `en`/`ko`가 있다는 이유로 JP 스킬을 제외하지 않습니다.
- 효과의 대상·스케일·추가 발동과 조건·시간 단위를 원본에 맞춰 보존합니다. 서로 다른 소스의 raw 단위를 임의로 혼합하지 않습니다.
- SP 표시·예산·할인 계산은 없습니다. 할인 없는 비용은 향후 가속 조합 비교용 내부 자료로만 남깁니다.
- 알 수 없는 효과·동적 발동 조건은 계산 미검증으로 유지합니다. 현재속도/목표속도/가속의 실전 이득을 임의의 0마신으로 반환하지 않습니다.

## 남은 검증

공식 챔미 프리셋, 시나리오의 링크·특수 획득 경로·진화 선택 제한, JP 사전 수록 스킬의 출시/해방,
고유기 레벨 규칙, 마신·가속·스태미나 계산식은 추가 검증이 필요합니다.
현재 후보 화면은 코스·거리·각질의 고정 조건만 보수적으로 거르며 상대 순위·추월·다른 스킬에 의존하는 실전 발동을 확정하지 않습니다.
흰 인자 TOP 10과 최대/효율/안전 추천은 아직 실제 데이터 계산 기능이 아닙니다. 예시 화면과 실제 후보 화면을 구분합니다.

## 검증 명령

```sh
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python scripts/validate_data.py
```

## 구조

| 경로 | 내용 |
| --- | --- |
| `assets/` | 실제 후보 화면과 조건/획득 경로 조회 |
| `prototype/` | 결과 레이아웃과 fixture 엔진 |
| `scripts/umaboard/` | 수집, 소스 어댑터, 검증, 활성 묶음 교체 |
| `sync-config.json` | 정기/고정 소스와 검증 기준 |
| `curated/rules.json` | 출처를 명시한 보완 관계와 검증 대기 목록 |
| `data/manifest.json` | 현재 활성 묶음, 출처 commit/blob, 해시와 어댑터 버전 |
| `data/bundles/` | 정규화 데이터와 동일 버전의 검증 결과 |
| `docs/` | 수집 설계, 조사 기록, 엔진 연결 계약 |
| `tests/` | 정규화 오류·누락·실패 복구와 실제 데이터 후보 검증 |

[동기화 운영 명세](docs/SOURCE_SYNC_DESIGN.md) · [현재 데이터 상태](docs/DATA_STATUS.md) · [실제 엔진 계약](docs/MODEL_CONTRACT.md)
