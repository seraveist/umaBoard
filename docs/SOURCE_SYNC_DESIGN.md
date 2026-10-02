# JP 데이터 동기화 운영 명세

2026-10-02 구현 기준. 조사 당시의 원문 설계는 DATA_COLLECTION_PLAN.md와 SOURCE_FRESHNESS_CHECK.md에 남긴다.

## 정기 소스

- UmaTools: `public/assets/skills_all.json`, `uma_data.json`, `support_hints.json`.
- umasim: `data/skill_data.txt` (JSON), `data/ramen_memo.md` (수동 규칙 검토 신호).
- alpha 상세 코스: `data/course_data.json`. 기본은 현재 manifest의 고정 스냅샷. `--refresh-courses`에서만 최신 커밋을 확인한다.

전체 출처는 3곳이고 기본 일일 조회는 2곳이다. `support_hints.json`에 카드 카탈로그도 있어 `support_card.json`은 중복이다.
별도 인자 DB, xancia, Tsuyuchan과 원본 사이트 직접 스크레이핑은 정기 소스에 포함하지 않는다.

## 실행 순서

1. 원본 저장소 기본 브랜치의 commit SHA와 해당 commit의 tree에서 대상 파일 blob을 확인한다.
2. 대상 blob과 어댑터·설정이 같으면 활성 묶음을 재검증하고 변경 없이 종료한다. 사이트 코드 변경만으로 재수집하지 않는다.
3. 변경 시 필요한 raw 파일을 `.cache/raw`에서 읽거나 SHA가 고정된 URL로 내려받는다. Git blob SHA와 바이트 수가 일치해야 한다.
4. 원본 전체를 수정하지 않고 소스별 어댑터로 정규화한다. 중복 계승 ID는 동일 효과만 합치고 부모 참조를 병합한다. 충돌은 실패다.
5. umasim에만 있는 일반 계승형을 보완한다. 주 소스의 공통 스킬 효과를 자동 덮어쓰지 않는다.
6. 스키마·ID·효과 값·참조·획득 경로·진화·코스 구간·개수 급감을 검사한다.
7. 완성 묶음을 `data/bundles/<SHA256>/`에 기록한다. 디렉터리가 완성된 다음 manifest 파일 하나를 원자적으로 교체한다.
8. workflow는 추가 검증 후 생성 데이터만 commit한다. 변경이 없으면 commit하지 않는다. push는 fast-forward만 허용한다.

기존 활성 파일의 해시가 맞지 않으면 복구 없이 새 자료로 덮어쓰지 않고 실패한다.
네트워크·JSON·해시·참조 오류 또는 검증되지 않은 대량 유실은 기존 manifest를 유지하고 실패 상태로 반환한다.
`--allow-count-decrease`는 실제 삭제를 검토한 뒤 수동 실행할 때만 사용하며 예약 작업에 넣지 않는다.

## 정규화 계약

스킬 ID·의상 ID·카드 ID·코스 ID는 문자열이다. 스킬, 발동 그룹, 효과, 획득 경로, 계승/진화/버전 관계를 분리한다.
원본 효과의 `target`, `target_details`, `value_scale`, `additional_activation`과 새 필드는 `extras_raw`에 보존한다.
UmaTools의 base_time과 umasim의 duration을 같은 단위인 것처럼 합치지 않는다. 실제 수식 변환은 검증한 계산 엔진의 책임이다.

각성 MAX·진화 조건 달성·서포트 이벤트 조건 무시 정책을 후보 구성에 적용한다.
개화에 따라 자연 3성 의상과 저레어 승격 고유기를 구분한다. rarity 3은 저개화 고유, 4는 승격 고유, 5는 자연 3성 고유다.
버전 연결은 가족 관계로 보존하며 비용만으로 상위·하위 순서를 추정하지 않는다.
흰 인자 후보는 일반 흰 스킬 중 편성의 경로·연결된 버전 가족에 속하지 않는 스킬이다. 인자 클래스 매핑으로 제한하지 않는다.

단순 조건은 OR/AND 비교식으로 보존한다. 고정 코스·각질 조건만 확정적으로 거르며 알 수 없는 동적 조건은 unknown으로 유지한다.
`is_activate_other_skill_detail==1`은 같은 스킬의 선행 발동을 요구한다. 첫 발동이 고정 조건에서 불가능하면 후속 효과만으로 후보에 넣지 않는다.
이 의미는 umasim `race/calc2/SkillChecker.kt`의 해당 분기를 확인해 적용했다. 실전 시점·발동 확률 계산은 구현하지 않았다.

## 시나리오와 공식 프리셋

자유 형식 시나리오 메모를 자동 해석해 새 획득 경로를 활성화하지 않는다. 메모 해시를 묶음에 기록하여 변경을 확인한다.
`curated/rules.json`은 검증된 보완 관계와 제외 사유만 포함하며 현재 partial이다.
링크 조건이 있는 보완 경로는 지원·검증되기 전에는 무조건 습득 가능으로 처리하지 않는다.
공식 챔미 프리셋과 선택 제한·출시/해방 규칙을 수집해야 하며, 해당 JSON이 존재한다고 완성된 규칙 자료로 간주하지 않는다.

## Actions

`sync-data.yml`은 `Asia/Seoul` 기준 `0 0 * * *`와 수동 실행을 지원한다. 입력 refresh_courses로 코스 갱신을 지정할 수 있다.
초기 설정·수집 코드 변경 push도 작업을 실행하므로 설정을 반영한 실제 실행 결과를 즉시 확인할 수 있다.
`contents: write`는 생성 데이터 commit에 사용한다. 원본 조회에는 해당 workflow의 GITHUB_TOKEN을 사용한다.
변경된 raw만 다운로드할 수 있도록 캐시를 복원한다. 캐시가 없어도 원본 SHA 확인을 거쳐 정상 수집한다.
동기화 확인 시각은 추적되지 않는 `.cache/sync-status.json`, 실행 summary, artifact에만 남긴다.

상위 UmaTools의 정기 수집은 UTC 23:00(한국/일본 08:00)이다. 예를 들어 D일 12시 게임 변경이 정기 수집만으로 전달되면
상위 반영은 D+1 08:00, 자체 자정 반영은 D+2 00:00일 수 있다. 실제로 추가 갱신이 있을 수 있으므로 commit 기록을 기준으로 판단한다.
GitHub 정각 실행은 지연될 수 있다. 공개 저장소 장기 비활성으로 일정이 중지될 수 있으므로 Actions 상태를 확인한다.
GITHUB_TOKEN push가 후속 CI/배포를 자동 실행하지 않으므로 같은 작업에서 필요한 검증을 끝낸다. 사이트 배포는 별도 작업이다.

## 출처

- https://github.com/daftuyda/UmaTools
- https://github.com/mee1080/umasim
- https://github.com/alpha123/uma-skill-tools
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://docs.github.com/en/actions/concepts/security/github_token
