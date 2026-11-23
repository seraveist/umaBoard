# 최적화 알고리즘 v1 — 다른 작업 공간으로 인계

[main 출시 기준](CM_MAIN_RELEASE.md) · [v1.6.8 엔진과 PDM·탐색 풀 검토](CM_V1_6_8_ENGINE_REVIEW.md)

작성일: **2026-11-23 Asia/Seoul**

이 문서는 현재 대화나 로컬 캐시 없이 다른 work·체크아웃·worktree에서 작업을 재개하기 위한 인계서다.
현재 구현·한계·우선순위는 [현황과 보완 방향](CM_V1_STATUS_AND_ROADMAP.md)을 함께 읽는다.
인계 문서 추가 자체는 다음 알고리즘 개선을 이미 수행했다는 뜻이 아니다.

## 1. 가져갈 저장소와 기준

| 항목 | 인계 기준 |
| --- | --- |
| 저장소 | [seraveist/umaBoard](https://github.com/seraveist/umaBoard) |
| 원격 주소 | `https://github.com/seraveist/umaBoard.git` |
| 기준 브랜치 | `perf/cm-encounter-scheduling` |
| 개정4 계산 구현 커밋 | `34d0579` — 0.1마신 압축 개정4 |
| 이 인계 문서 추가 전 커밋 | `ba654ac` — 현황·보완 방향 정리 |
| 실제 재개 위치 | 이 인계 문서를 포함한 `origin/perf/cm-encounter-scheduling` 최신 커밋 |
| 현재 모델 | v1.6.12, 마신표v16·목표 가속v5·최종 추천v20·단독 비교v8 |
| 계산41모듈 SHA256 | `5b38cabecc8385ff5904afdd307da374fe7eeb647f65828bde587ab3b17b0666` |
| 출시 기준 데이터 | `59fd2b3c2fd17d42d715692281615e0d78dbbf01fb51917d984bfbb56fc5a85a` |

기존 로컬 작업 경로는 `C:/Users/JOON/Documents/Codex/2026-11-17/new-chat-2/work/umaBoard-review`다.
이는 출처 확인용이며 새 작업이 이 절대 경로에 의존하면 안 된다. 아래 명령은 선택한 저장소의 루트에서 실행한다.
과거 커밋 번호는 비교 기준이다. 새 브랜치에 이후 변경이 있으면 먼저 차이를 확인하며 과거 상태로 강제 복원하지 않는다.

## 2. 작업 사본 준비

먼저 현재 위치의 `AGENTS.md` 등 적용 지침, Git 상태와 원격을 확인한다.
기존 수정이 있으면 보존한 뒤 작업 사본을 선택한다. 검증된 파일만 일부 복사하기보다 Git 이력을 포함한 저장소를 사용한다.
기준 평가기 비교가 `git show baa9d98:...`를 사용하므로 해당 커밋이 있어야 한다.
검증 기준 런타임은 **Git·Node.js24·Python3.12 이상**이다.

### 새 clone을 사용하는 경우

사용할 상위 폴더에서 실행한다. 대상 폴더는 아직 사용하지 않는 이름으로 정한다.

```powershell
git clone --branch perf/cm-encounter-scheduling https://github.com/seraveist/umaBoard.git umaBoard-next
if ($LASTEXITCODE -ne 0) { throw 'clone 실패: 대상 폴더와 원격을 확인하세요.' }
Set-Location -LiteralPath .\umaBoard-next -ErrorAction Stop
git status --short
git branch --show-current
git log -3 --oneline
git cat-file -e 'baa9d98^{commit}'
if ($LASTEXITCODE -ne 0) { throw '독립 비교에 필요한 Git 이력이 없습니다.' }
node --version
python --version
```

얕은 clone을 이미 사용 중이라면 `git rev-parse --is-shallow-repository`로 확인하고,
결과가 `true`인 경우 `git fetch --unshallow origin`으로 필요한 이력을 가져온다.
Git 이력이 없는 ZIP 사본으로는 위 독립 비교를 그대로 재현할 수 없다.

### 같은 저장소에서 별도 worktree를 사용하는 경우

원래 브랜치가 다른 worktree에서 열려 있을 수 있으므로 새 작업 브랜치를 만든다.
아래 브랜치·폴더 이름도 아직 사용하지 않는 것으로 정한다.

```powershell
git status --short
git remote get-url origin
git fetch origin
if ($LASTEXITCODE -ne 0) { throw '원격 기준을 가져오지 못했습니다.' }
git worktree list
git worktree add -b review/cm-v1-next ..\umaBoard-next origin/perf/cm-encounter-scheduling
if ($LASTEXITCODE -ne 0) { throw 'worktree 생성 실패: 새 브랜치와 폴더 이름을 확인하세요.' }
Set-Location -LiteralPath ..\umaBoard-next -ErrorAction Stop
git merge-base --is-ancestor origin/perf/cm-encounter-scheduling HEAD
if ($LASTEXITCODE -ne 0) { throw '기준 브랜치를 포함한 작업 사본인지 확인하세요.' }
git log -3 --oneline
git cat-file -e 'baa9d98^{commit}'
if ($LASTEXITCODE -ne 0) { throw '독립 비교에 필요한 Git 이력이 없습니다.' }
```

새 작업 브랜치의 변경은 그 브랜치에 먼저 기록한다. 원래 기능 브랜치로의 반영은 변경 내용을 검토해 진행한다.
이 인계의 대상은 기능 브랜치의 후속 작업이며 `main` 병합은 별도 작업이다.

## 3. 처음 읽을 문서와 코드

문서는 다음 순서로 읽는다.

1. [현재 상태와 보완 방향](CM_V1_STATUS_AND_ROADMAP.md): 현재 수치·해석 범위·우선순위.
2. [개정4 QA](CM_OPTIMIZATION_V1_FAST_QA.md): 실제 변경, 채택하지 않은 시험, 입력과 검증 근거.
3. [마신표 계약](CM_FIRST_CHART.md), [최종 추천 계약](CM_POST_TRAINING.md): 구현이 지켜야 할 동작.
4. [현재 고정 기준](validation/cm-optimization-v1-encounter-release-20261119.json),
   [개정4 집계·증거 해시](validation/cm-optimization-v1-fast-summary-20261118.json).
5. [누적 개발 현황](CM_PROGRESS_AND_NEXT_STEPS.md): UI·데이터·과거 검증의 날짜별 맥락.

| 코드 | 역할 |
| --- | --- |
| [cm-final-plan.mjs](../assets/cm-final-plan.mjs) | 실제 능력치·획득·가격·구매/진화 탐색, 단계별 평가와 잔여SP 재검토 |
| [cm-plan-compression.mjs](../assets/cm-plan-compression.mjs) | 고정 최선 기준, 전개별 대표 선별, 연계 분류와 저비용 선택 후 복원 |
| [race-evaluation.mjs](../assets/race-evaluation.mjs) | 동일 표본의 관측 재사용과 전체 조합의 기여·HP·위험 집계 |
| [cm-search.mjs](../assets/cm-search.mjs) | 합법 상태 열거와 SP 확보·복합 교체 제안 |
| [skill-dependencies.mjs](../assets/skill-dependencies.mjs) | 원본 조건에서 유도한 보유/발동 개수 연계 묶음 |
| [race-sampling.mjs](../assets/race-sampling.mjs), [race-objective.mjs](../assets/race-objective.mjs) | 표본 번호별 추첨과 HP·위험·평균의 비교 기준 |
| [cm-algorithm-version.mjs](../assets/cm-algorithm-version.mjs) | 공개 명칭·개정·모델 식별자 |

오래된 설계 문서에는 `legacy.html` 기준도 있다. 현재 CM 동작은 위 두 계약을 우선한다.

## 4. 시작 시 확인할 현재 상태

```powershell
node scripts/check_cm_algorithm_v1.mjs
```

변경 전 기준에서 `status:passed`, 공개v1·개정6, 계산41모듈과 위 계산 해시를 확인한다.
변경 전부터 실패하면 브랜치·데이터·파일 상태를 먼저 조사한다.
정당한 코드 수정 뒤에는 고정 검사 실패가 예상될 수 있다. 이 경우 기존 릴리스 파일의 해시만 덮어써 통과시키지 않고,
새 개정·모델·고정 파일을 만들며 현재 기준을 이전 증거로 연결한다.

인계받는 핵심 사실은 다음과 같다.

- 기본 허용 범위는0.1마신이며 HP·가격·획득·위험 제약에는 적용하지 않는다.
  최종 기본 평가는144표본·0.01초이고 개별 작은 기여를 버리거나 더해서 최종 점수를 만들지 않는다.
- 개정4 기록에서 7000SP·220후보는36.928414마신·6972SP·표본HP 충족률1이다.
  직전 대비 정밀367→104회, 관찰282→214초이며 더 넓은 시험의 최선과도0.027001 차이다.
- 기존10추천·강제 제한4추천의 전수 기준 차이는0.1 이내다.
  다른 표본20대조 중4건은 약0.117~0.125 차이였으므로 모든 추첨의0.1 상한은 아니다.
- 원래 평가기와65대조의 모든 반환값이 같았고 Node320·Python51·빌드32모듈 검증이 기록돼 있다.
  이는 과거 완료한 검증이다. 재개한 작업에서 새로 실행한 검사 수로 합산하지 않는다.
- 미실측 상대 전개·실전 승률은 현재 범위 밖이다. 왕수·군림의 실전 과대평가가 모두 해결됐다고 선언하지 않는다.

## 5. 새 작업 공간의 캐시와 검증 순서

`.cache/`는 Git에서 제외된다. 새 clone·worktree에 이전 `.cache/pages/`나
`.cache/cm-current-7000-validation.json`이 없을 수 있으며, 원래 작업의 파일을 복사해야 하는 전제는 없다.

다음은 저장소 루트에서 사용할 수 있는 확인 명령이다. 로그는 무시되는 로컬 폴더에 남겨 기존 증거를 덮어쓰지 않는다.
실패한 명령이 있으면 결과를 확인한 뒤 다음 단계를 진행한다.

```powershell
New-Item -ItemType Directory -Force .cache/handoff-check -ErrorAction Stop | Out-Null
node scripts/check_cm_algorithm_v1.mjs
if ($LASTEXITCODE -ne 0) { throw '계산 고정 기준 불일치: 결과를 확인하세요.' }
node --test tests/*.test.mjs > .cache/handoff-check/node-tests.txt 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Node 검사 실패: 결과를 확인하세요.' }
python -m unittest discover -s tests -v *> .cache/handoff-check/python-tests.txt
if ($LASTEXITCODE -ne 0) { throw 'Python 검사 실패: 결과를 확인하세요.' }
python scripts/validate_data.py > .cache/handoff-check/data-validation.json
if ($LASTEXITCODE -ne 0) { throw '데이터 검사 실패: 결과를 확인하세요.' }
python scripts/build_pages.py
if ($LASTEXITCODE -ne 0) { throw '빌드 실패: 결과를 확인하세요.' }
node scripts/check_cm_algorithm_v1.mjs --build
if ($LASTEXITCODE -ne 0) { throw '빌드 계산 대조 실패: 결과를 확인하세요.' }
```

전체 Node 검사에는 무거운7000SP 통합 검사가 포함돼 있다. 이것이
`.cache/cm-current-7000-validation.json`을 생성한다.
이 파일만 필요하면 `node --test tests/cm-joint-evolution.test.mjs`로 통합 검사부터 실행할 수 있다.
`--build` 확인은 먼저 기본 경로인 `.cache/pages/`에 빌드해야 한다.
화면을 확인할 때는 다음 명령을 사용하고 로컬 주소를 연다.

```powershell
python -m http.server 8000 --directory .cache/pages
```

그 다음 실제 브라우저에서 모델·입력·진행·취소·저장·내보내기를 확인한다.
빌드는 기본적으로 현재 이미지 캐시만 사용하며, 이미지 다운로드 여부와 계산 검증을 구분한다.
무거운 성능 계측은 위 검사들과 동시에 실행하지 않는다.

### 고정된 결과 파일을 지키는 방법

아래 도구는 출력 경로가 고정돼 있다. 현재 파일들을 그대로 다시 생성해 기준 증거를 덮어쓰지 않도록 한다.

| 도구 | 용도와 재개 시 주의점 |
| --- | --- |
| [validate_cm_v1_fast.mjs](../scripts/validate_cm_v1_fast.mjs) | 기존5템플릿·강제 제한·큰 입력·민감도·집계. `cm-optimization-v1-fast-…20261118` 파일을 직접 쓴다. 현재 모델v14·이전 물리/데이터를 가정하는 검사도 있다. |
| [check_cm_prefix_cache.mjs](../scripts/check_cm_prefix_cache.mjs) | Git의 `baa9d98` 평가기와 독립 비교. 현재 `fast-cache-equivalence` 결과를 직접 쓴다. |
| [check_cm_algorithm_v1.mjs](../scripts/check_cm_algorithm_v1.mjs) | 현재 고정 기준 읽기·검사. `--build`는 로컬 빌드 결과도 읽는다. |

새 개선의 검증은 현재 스크립트를 참고해 **별도 출력 이름/폴더와 집계 도구**를 준비한다.
입력으로 읽는 이전 기준과 새 결과를 쓰는 경로를 분리하고, 문자열을 일괄 치환해 이전 기준까지 새 경로로 바꾸지 않는다.
기준 재현이 필요하면 원본을 보존한 별도 검증 사본에서 실행하고 새 관찰값을 다른 이름으로 보관한다.

기존 `self-*`, `search-*`, `tolerance-*`, `fast-*` 증거와 릴리스·완성 기준을 보존한다.
`fast` 집계는 새 작업 공간의7000SP 캐시에도 의존하므로 `.cache`가 없어서 실패한 경우와 알고리즘 회귀를 구분한다.
과거 `v1_search`·`v1_tolerance` 검증 도구를 현재 모델에 맞추려고 원래 모델 검사를 제거하지 않는다.

## 6. 다른 work에서 시작할 첫 과제

권장 시작점은 **기준 보존과 독립 테스트베드 확대**다.

1. 위 기준을 확인하고 이전 증거의 해시·원자료를 읽는다.
2. 새 결과 경로와 입력 목록을 정한 뒤 기존v11의 넓은 조건을v14에서 재실행한다.
   과거v11의25코스·37조건 결과를v14 결과로 재사용하지 않는다.
3. 개발에 쓰지 않은 코스·각질·능력치·힌트·예산·HP 경계의 작은 후보 집합을 별도 선정한다.
4. 구매 상태의 독립 열거·가격 검산과 현재 추천을 비교한다. 실패는 제약 위반·탐색 누락·표본 차이로 나눈다.
5. 원인을 확인한 뒤 공통 조건·탐색 구조로 보완하고 같은 입력과 별도 입력에서 다시 확인한다.

그 다음은 허용 범위 근처의 후보만 짝지은 표본으로 확대하는 정책과 실제 병목·메모리 측정이다.
표본 정책을 바꾸는 것은 현재144표본 계약과 별개의 변경이므로 모델·내보내기 기준도 함께 정리한다.
새 작업에서 알고리즘을 수정하면 잔여SP 재검토, 작은 개선의 묶음 평가, HP·획득·가격 제약을 유지한다.
특정 스킬 결과를 맞추기 위한 예외·점수 가중치나 미실측 상대 분포 보정은 추가하지 않는다.

결과 인계에는 실제 작업 브랜치/커밋, 모델·데이터·소스 해시, 새로 실행한 검사, 품질·시간·한계,
실패/미완료 항목과 다음 명령을 기록한다. 새 작업 브랜치에 커밋·푸시하고 이전 증거와 새 증거를 구분한다.

## 7. 새 work에 복사할 재개 요청문

아래는 후속 검증·보완을 실제로 시작할 때 사용할 요청문이다.

```text
seraveist/umaBoard의 origin/perf/cm-encounter-scheduling 최신 상태에서 이어서 작업해줘.
docs/CM_V1_HANDOFF.md와 docs/CM_V1_STATUS_AND_ROADMAP.md를 먼저 읽고,
현재 작업 위치·Git 상태·브랜치·적용 지침·모델·데이터를 확인해줘.

현재 계산 기준은 v1.6.12, 마신표v16·목표 가속v5·최종 추천v20이다. [최종 평가와 재현 방법](CM_V1_6_FINAL_REVIEW.md)을 따른다.
0.1마신은 현재 평가 표본의 선택 허용 범위이며 모든 추첨의 오차 보증은 아니다.
개정6의 순위·경합·인기 판정은 고정 전개의 짝비교로 검증했다.

기존 증거를 보존하고 새 출력 경로부터 준비한 뒤,
변경한 조건의 작은 재현 사례와 경계 검사를 먼저 실행해줘.
실패가 나오면 제약 위반·탐색 누락·표본 차이를 구분하고 필요한 공통 로직을 보완해줘.

HP·획득·가격·발동 조건·복합 연계와 잔여SP 재검토를 유지하고,
특정 스킬 예외나 임의 점수 가중치로 결과를 맞추지 말아줘.
미실측 상대 주행·승률 모델은 이번 범위에 추가하지 말아줘.
같은 조건에서 품질·시간을 확인하고, 새 검증 결과·한계·후속 내용을 문서와 함께 작업 브랜치에 정리해줘.
```
